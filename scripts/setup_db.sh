#!/usr/bin/env bash
# Membuat ulang kedua database dan memasang skema (TANPA data). Aman dijalankan berulang (DROP + CREATE).
#   OLTP_DB / DW_DB mengatur nama database (default kost_oltp / kost_dw).
set -euo pipefail
cd "$(dirname "$0")/.."
OLTP_DB="${OLTP_DB:-kost_oltp}"; DW_DB="${DW_DB:-kost_dw}"

for db in "$OLTP_DB" "$DW_DB"; do
  dropdb --if-exists "$db"; createdb "$db"
done
psql -q -v ON_ERROR_STOP=1 -d "$OLTP_DB" -f db/oltp/01_schema.sql -f db/oltp/02_functions.sql
psql -q -v ON_ERROR_STOP=1 -d "$DW_DB"   -f db/dw/01_schema.sql   -f db/dw/02_static_rows.sql
echo "OK  skema OLTP ($OLTP_DB) dan DW ($DW_DB) terpasang."
