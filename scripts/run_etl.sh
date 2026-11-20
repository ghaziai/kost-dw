#!/usr/bin/env bash
# Pembungkus ETL. Contoh:  scripts/run_etl.sh --as-of 2026-11-12
# (jadwalkan dengan cron, mis. tiap malam: 5 0 * * *  /path/scripts/run_etl.sh)
set -euo pipefail
cd "$(dirname "$0")/.."
PY="$(command -v python3 || command -v python)"
exec "$PY" etl/run_etl.py "$@"
