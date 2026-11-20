"""Validasi rekonsiliasi: membandingkan angka sumber (OLTP) dengan hasil di DW."""
import psycopg

TZ_OPT = "-c timezone=Asia/Jakarta"


def _one(conn, query, params=None):
    with conn.cursor() as cur:
        cur.execute(query, params)
        v = cur.fetchone()[0]
    return v if v is not None else 0


def run_validation(oltp_url, dw_url):
    checks = []

    def add(name, expected, actual):
        checks.append({"name": name, "expected": str(expected), "actual": str(actual), "ok": expected == actual})

    with psycopg.connect(oltp_url, options=TZ_OPT) as src, psycopg.connect(dw_url, options=TZ_OPT) as dw:
        # --- Fact_Pembayaran (transaksional)
        add("jumlah pembayaran = baris fact_pembayaran",
            _one(src, "SELECT count(*) FROM payments"), _one(dw, "SELECT count(*) FROM dw.fact_pembayaran"))
        add("total nilai dibayar",
            _one(src, "SELECT sum(amount) FROM payments"), _one(dw, "SELECT sum(nilai_dibayar) FROM dw.fact_pembayaran"))
        add("total nilai tagihan (tagihan yang dibayar)",
            _one(src, "SELECT sum(i.amount) FROM invoices i JOIN payments p ON p.invoice_id = i.id"),
            _one(dw, "SELECT sum(nilai_tagihan) FROM dw.fact_pembayaran"))
        add("selisih_pembayaran = dibayar - tagihan (baris salah)",
            0, _one(dw, "SELECT count(*) FROM dw.fact_pembayaran WHERE selisih_pembayaran <> nilai_dibayar - nilai_tagihan"))

        # --- Dim_Kamar (SCD tipe 2)
        add("kamar sumber = versi aktif dim_kamar",
            _one(src, "SELECT count(*) FROM rooms"), _one(dw, "SELECT count(*) FROM dw.dim_kamar WHERE baris_aktif"))
        add("versi dim_kamar bertumpuk / berlubang",
            0, _one(dw, """SELECT count(*) FROM (
                             SELECT valid_dari, lag(valid_sampai) OVER (PARTITION BY kamar_id ORDER BY valid_dari) AS prev
                               FROM dw.dim_kamar) x
                            WHERE prev IS NOT NULL AND valid_dari <> prev + 1"""))
        # tarif versi aktif harus sama dengan rooms.price (lintas database -> dibandingkan di Python)
        with src.cursor() as cur:
            cur.execute("SELECT id, price FROM rooms")
            src_price = dict(cur.fetchall())
        with dw.cursor() as cur:
            cur.execute("SELECT kamar_id, tarif_sewa FROM dw.dim_kamar WHERE baris_aktif")
            dw_price = dict(cur.fetchall())
        add("kamar dengan tarif aktif DW berbeda dari rooms.price",
            0, sum(1 for k, v in src_price.items() if dw_price.get(k) != v))

        # --- Fact_Okupansi_Harian (potret periodik)
        with dw.cursor() as cur:
            cur.execute("SELECT min(w.tanggal), max(w.tanggal) FROM dw.fact_okupansi_harian f "
                        "JOIN dw.dim_waktu w ON w.waktu_key = f.waktu_key")
            dmin, dmax = cur.fetchone()
        if dmin:
            add("baris okupansi = kamar x hari (versi awal diperluas ke kontrak surut)",
                _one(src, """SELECT count(*) FROM rooms r
                             LEFT JOIN (SELECT room_id, min(start_date) AS fs FROM contracts GROUP BY 1) c ON c.room_id = r.id,
                             generate_series(greatest(least(r.created_at::date, COALESCE(c.fs, r.created_at::date)), %s::date),
                                             %s::date, interval '1 day') g""",
                     (dmin, dmax)),
                _one(dw, "SELECT count(*) FROM dw.fact_okupansi_harian"))
            add("hari-kamar terisi (dari rentang kontrak)",
                _one(src, """SELECT sum(greatest(0, least(end_date, %s::date) - greatest(start_date, %s::date) + 1))
                               FROM contracts""", (dmax, dmin)),
                _one(dw, "SELECT sum(flag_terisi) FROM dw.fact_okupansi_harian"))
            add("terisi + kosong = jumlah kamar-hari (selisih)",
                0, _one(dw, "SELECT count(*) FROM dw.fact_okupansi_harian WHERE flag_terisi + flag_kosong <> jumlah_kamar"))

        # --- Fact_Pengaduan (potret terakumulasi)
        add("jumlah pengaduan", _one(src, "SELECT count(*) FROM complaints"),
            _one(dw, "SELECT count(*) FROM dw.fact_pengaduan"))
        add("pengaduan selesai", _one(src, "SELECT count(*) FROM complaints WHERE status = 'resolved'"),
            _one(dw, "SELECT sum(flag_selesai) FROM dw.fact_pengaduan"))
        add("pengaduan ditangani (kunci waktu terisi)",
            _one(src, "SELECT count(*) FROM complaints WHERE handled_at IS NOT NULL"),
            _one(dw, "SELECT count(*) FROM dw.fact_pengaduan WHERE waktu_ditangani_key <> 99991231"))
    return checks
