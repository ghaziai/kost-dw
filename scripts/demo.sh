#!/usr/bin/env bash
# Demo penuh: skema -> seed s.d. Sep 2026 -> ETL #1 (full) -> aktivitas Okt 2026 -> ETL #2 (incremental) -> ETL #3 (idempotensi).
set -euo pipefail
cd "$(dirname "$0")/.."
OLTP_DB="${OLTP_DB:-kost_oltp}"
step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

step "1/7 Pasang skema"                          ; scripts/setup_db.sh
step "2/7 Seed OLTP (Jan–Sep 2026)"              ; psql -q -v ON_ERROR_STOP=1 -d "$OLTP_DB" -f db/seed/01_oltp_seed_sampai_2026-09.sql
step "3/7 ETL #1 — full load (watermark kosong)" ; scripts/run_etl.sh --as-of 2026-09-30
step "4/7 Aktivitas OLTP Oktober 2026"           ; psql -q -v ON_ERROR_STOP=1 -d "$OLTP_DB" -f db/seed/02_oltp_aktivitas_2026-10.sql
step "5/7 ETL #2 — incremental (CDC watermark)"  ; scripts/run_etl.sh --as-of 2026-10-31
step "6/7 ETL #3 — idempotensi (harus 0 berubah)"; scripts/run_etl.sh --as-of 2026-10-31
step "7/7 Selesai"
echo "Jalankan:  npm start   lalu buka http://localhost:3000   (owner: budi@kost.test / demo1234)"
