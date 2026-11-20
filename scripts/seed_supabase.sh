#!/usr/bin/env bash
# Mengisi proyek Supabase (skema sudah dipasang lewat migrasi) dengan data demo, lalu menjalankan ETL 3x.
# Membutuhkan: psql, python (psycopg), dan .env berisi OLTP_DATABASE_URL / DW_DATABASE_URL yang valid.
# PERINGATAN: seed memasukkan data ke tabel public.*; jalankan hanya pada database kosong (cek di bawah).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
PY="$(command -v python3 || command -v python)"
step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

n=$(psql "$OLTP_DATABASE_URL" -Atqc "select count(*) from public.users")
if [ "$n" != "0" ]; then echo "public.users sudah berisi $n baris - seed dibatalkan (database tidak kosong)."; exit 1; fi

step "1/5 Seed OLTP (Jan-Sep 2026)"        ; psql -q -v ON_ERROR_STOP=1 "$OLTP_DATABASE_URL" -f db/seed/01_oltp_seed_sampai_2026-09.sql
step "2/5 ETL #1 - full load"              ; "$PY" etl/run_etl.py --as-of 2026-09-30
step "3/5 Aktivitas OLTP Oktober 2026"     ; psql -q -v ON_ERROR_STOP=1 "$OLTP_DATABASE_URL" -f db/seed/02_oltp_aktivitas_2026-10.sql
step "4/5 ETL #2 - incremental"            ; "$PY" etl/run_etl.py --as-of 2026-10-31
step "5/5 ETL #3 - idempotensi (0 berubah)"; "$PY" etl/run_etl.py --as-of 2026-10-31
echo "Selesai. Jalankan:  npm start   lalu buka http://localhost:3000   (owner: budi@kost.test / demo1234)"
