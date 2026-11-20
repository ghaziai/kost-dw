#!/usr/bin/env python3
"""
ETL Manajemen Kost : OLTP (PostgreSQL) -> Staging -> Data Warehouse (PostgreSQL)
Pendekatan : Python hanya untuk EKSTRAKSI + ORKESTRASI; transformasi & pemuatan
             dijalankan sebagai Native SQL di dalam PostgreSQL (alur ELT).

Fitur teori yang diterapkan:
  * Full extraction (pemuatan awal)  &  Incremental extraction / CDC berbasis timestamp (watermark)
  * Online extraction (sumber tetap berjalan) dengan snapshot REPEATABLE READ yang konsisten
  * Staging area (schema stg), urutan muat: dimensi -> fakta
  * SCD tipe 0/1/2, upsert idempoten, unknown member
  * Log eksekusi (etl.run_log), watermark (etl.watermark), validasi rekonsiliasi
  * Atomik: seluruh perubahan DW satu transaksi; gagal -> rollback, watermark tidak maju

Contoh:
  python3 etl/run_etl.py --as-of 2026-09-30            # run 1 (full, karena watermark kosong)
  python3 etl/run_etl.py --as-of 2026-10-31            # run 2 (incremental)
  python3 etl/run_etl.py --as-of 2026-10-31            # run 3 (idempotensi: 0 baris berubah)
  python3 etl/run_etl.py --mode full --rebuild-okupansi-from 2026-01-01
"""
import argparse
import glob
import os
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from validate import run_validation  # noqa: E402

TABLES = {
    "users":      ["id", "role", "full_name", "email", "phone", "business_name", "created_at", "updated_at"],
    "properties": ["id", "owner_id", "name", "property_type", "address", "city", "created_at", "updated_at"],
    "rooms":      ["id", "property_id", "room_number", "room_type", "price", "deposit_amount", "created_at", "updated_at"],
    "contracts":  ["id", "tenant_id", "room_id", "start_date", "end_date", "rent_amount", "deposit_amount",
                   "due_day", "status", "created_at", "updated_at"],
    "invoices":   ["id", "contract_id", "period_month", "due_date", "amount", "status", "created_at", "updated_at"],
    "payments":   ["id", "invoice_id", "amount", "method", "paid_at", "recorded_by", "created_at", "updated_at"],
    "complaints": ["id", "tenant_id", "room_id", "category", "status", "created_at", "handled_at", "resolved_at",
                   "updated_at"],
}
TZ_OPT = "-c timezone=Asia/Jakarta"


def load_env():
    """Baca .env sederhana (tanpa dependensi) jika ada."""
    path = os.path.join(HERE, "..", ".env")
    if os.path.exists(path):
        for line in open(path):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def jakarta_today():
    return datetime.now(timezone(timedelta(hours=7))).date()


def parse_steps():
    steps = []
    for path in sorted(glob.glob(os.path.join(HERE, "sql", "*.sql"))):
        text = open(path, encoding="utf-8").read()
        parts = re.split(r"(?m)^-- @step (\w+)\s*$", text)
        for i in range(1, len(parts), 2):
            steps.append((parts[i], parts[i + 1].strip()))
    return steps


def extract_table(src, dw, table, cols, batch_id, watermark):
    """COPY baris sumber -> tabel temp di DW -> UPSERT ke stg.<table>. Mengembalikan (jumlah, max_updated_at)."""
    collist = sql.SQL(", ").join(sql.Identifier(c) for c in cols)
    where = sql.SQL("") if watermark is None else sql.SQL(" WHERE updated_at >= {}").format(sql.Literal(watermark))
    tmp = sql.Identifier("_x_" + table)
    with dw.cursor() as cur:
        cur.execute(sql.SQL("CREATE TEMP TABLE {} ON COMMIT DROP AS SELECT {} FROM {} WITH NO DATA")
                    .format(tmp, collist, sql.SQL("stg.") + sql.Identifier(table)))
        copy_out = sql.SQL("COPY (SELECT {} FROM public.{}{}) TO STDOUT").format(collist, sql.Identifier(table), where)
        copy_in = sql.SQL("COPY {} ({}) FROM STDIN").format(tmp, collist)
        with src.cursor().copy(copy_out) as co, cur.copy(copy_in) as ci:
            for chunk in co:
                ci.write(chunk)
        sets = sql.SQL(", ").join(sql.SQL("{0} = EXCLUDED.{0}").format(sql.Identifier(c)) for c in cols if c != "id")
        cur.execute(sql.SQL(
            "INSERT INTO stg.{t} ({cols}, _batch_id) SELECT {cols}, %s FROM {tmp} "
            "ON CONFLICT (id) DO UPDATE SET {sets}, _batch_id = EXCLUDED._batch_id"
        ).format(t=sql.Identifier(table), cols=collist, tmp=tmp, sets=sets), (batch_id,))
        n = cur.rowcount
        cur.execute(sql.SQL("SELECT max(updated_at) FROM {}").format(tmp))
        mx = cur.fetchone()[0]
    return n, mx


def okupansi_window(dw, as_of, rebuild_from):
    """Tentukan awal jendela potret harian; None bila tidak ada yang perlu dimuat."""
    if rebuild_from:
        start = rebuild_from
    else:
        with dw.cursor() as cur:
            cur.execute("SELECT max(waktu_key) FROM dw.fact_okupansi_harian")
            last = cur.fetchone()[0]
            if last:
                start = datetime.strptime(str(last), "%Y%m%d").date() + timedelta(days=1)
            else:
                cur.execute("SELECT min(start_date) FROM stg.contracts")
                first = cur.fetchone()[0]
                if not first:
                    return None
                start = date(first.year, first.month, 1)
    return start if start <= as_of else None


def log_update(log_conn, run_id, **fields):
    sets = sql.SQL(", ").join(sql.SQL("{} = %s").format(sql.Identifier(k)) for k in fields)
    vals = [Jsonb(v) if isinstance(v, (dict, list)) else v for v in fields.values()]
    with log_conn.cursor() as cur:
        cur.execute(sql.SQL("UPDATE etl.run_log SET {} WHERE id = %s").format(sets), vals + [run_id])


def main():
    ap = argparse.ArgumentParser(description="ETL Manajemen Kost (OLTP -> DW)")
    ap.add_argument("--mode", choices=["auto", "full", "incremental"], default="auto")
    ap.add_argument("--as-of", type=date.fromisoformat, default=None, help="tanggal potret terakhir (default: kemarin)")
    ap.add_argument("--rebuild-okupansi-from", type=date.fromisoformat, default=None,
                    help="bangun ulang Fact_Okupansi_Harian mulai tanggal ini")
    ap.add_argument("--no-validate", action="store_true")
    args = ap.parse_args()

    load_env()
    oltp_url = os.environ.get("OLTP_DATABASE_URL", "postgresql:///kost_oltp")
    dw_url = os.environ.get("DW_DATABASE_URL", "postgresql:///kost_dw")
    as_of = args.as_of or (jakarta_today() - timedelta(days=1))

    log_conn = psycopg.connect(dw_url, autocommit=True, options=TZ_OPT)
    with log_conn.cursor() as cur:
        cur.execute("SELECT table_name, last_updated_at FROM etl.watermark")
        wms = dict(cur.fetchall())
    mode = args.mode if args.mode != "auto" else ("incremental" if wms else "full")
    if mode == "incremental" and not wms:
        print("Watermark kosong -> beralih ke mode full")
        mode = "full"
    with log_conn.cursor() as cur:
        cur.execute("INSERT INTO etl.run_log (mode, as_of) VALUES (%s, %s) RETURNING id", (mode, as_of))
        run_id = cur.fetchone()[0]

    print("=" * 66)
    print(" ETL Manajemen Kost | batch #%d | mode %s | as-of %s" % (run_id, mode, as_of))
    print("=" * 66)
    t_all = time.perf_counter()
    extracted, loaded, timings = {}, {}, {}
    try:
        with psycopg.connect(oltp_url, options=TZ_OPT) as src, psycopg.connect(dw_url, options=TZ_OPT) as dw:
            src.isolation_level = psycopg.IsolationLevel.REPEATABLE_READ   # snapshot konsisten lintas tabel
            src.read_only = True
            new_wm = {}
            print("[EXTRACT] online extraction, snapshot REPEATABLE READ")
            for table, cols in TABLES.items():
                t0 = time.perf_counter()
                wm = None if mode == "full" else wms.get(table)
                n, mx = extract_table(src, dw, table, cols, run_id, wm)
                extracted[table] = n
                new_wm[table] = mx
                timings["extract_" + table] = round(time.perf_counter() - t0, 3)
                print("  %-12s %6d baris  (%s)" % (table, n, "full" if wm is None else "delta > watermark"))
            src.rollback()

            window = okupansi_window(dw, as_of, args.rebuild_okupansi_from)
            params = {"batch_id": run_id, "as_of": as_of, "okupansi_from": window or as_of}
            print("[TRANSFORM + LOAD] Native SQL di PostgreSQL")
            for name, stmt in parse_steps():
                if name.startswith("okupansi_") and window is None:
                    print("  %-34s dilewati (tidak ada hari baru)" % name)
                    continue
                t0 = time.perf_counter()
                with dw.cursor() as cur:
                    cur.execute(stmt, params)
                    loaded[name] = cur.rowcount
                timings[name] = round(time.perf_counter() - t0, 3)
                print("  %-34s %6d baris  %.3f s" % (name, loaded[name], timings[name]))

            with dw.cursor() as cur:
                for table, mx in new_wm.items():
                    if mx is not None:
                        cur.execute(
                            "INSERT INTO etl.watermark (table_name, last_updated_at, last_batch_id) VALUES (%s, %s, %s) "
                            "ON CONFLICT (table_name) DO UPDATE SET "
                            "last_updated_at = GREATEST(etl.watermark.last_updated_at, EXCLUDED.last_updated_at), "
                            "last_batch_id = EXCLUDED.last_batch_id, updated_at = now()", (table, mx, run_id))
            dw.commit()                                   # satu-satunya titik commit DW
        total = round(time.perf_counter() - t_all, 3)
        timings["total"] = total
        log_update(log_conn, run_id, status="success", finished_at=datetime.now(timezone.utc),
                   rows_extracted=extracted, rows_loaded=loaded, step_seconds=timings)
        print("[SELESAI] %.3f detik, perubahan DW tersimpan (commit)" % total)
    except Exception as e:                               # rollback otomatis oleh context manager
        log_update(log_conn, run_id, status="failed", finished_at=datetime.now(timezone.utc), error=str(e)[:2000])
        print("[GAGAL] %s\nSeluruh perubahan DW dibatalkan (rollback); watermark tidak maju." % e, file=sys.stderr)
        sys.exit(1)

    if not args.no_validate:
        print("[VALIDASI] rekonsiliasi sumber vs DW")
        checks = run_validation(oltp_url, dw_url)
        for c in checks:
            print("  [%s] %-52s sumber=%s dw=%s" % ("OK " if c["ok"] else "GAGAL", c["name"], c["expected"], c["actual"]))
        log_update(log_conn, run_id, validation=checks)
        if not all(c["ok"] for c in checks):
            print("Validasi menemukan ketidakcocokan.", file=sys.stderr)
            sys.exit(2)
        print("Semua %d pemeriksaan lulus." % len(checks))


if __name__ == "__main__":
    main()
