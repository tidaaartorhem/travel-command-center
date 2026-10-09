#!/usr/bin/env bash
# Precompute the frontend's derived bundle from the real data sources.
# Usage: ./scripts/precompute.sh [--today YYYY-MM-DD]
set -euo pipefail
cd "$(dirname "$0")/.."

TODAY="$(date +%F)"
while [ $# -gt 0 ]; do
  case "$1" in
    --today) TODAY="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

.venv/bin/python -m services.main \
  --bts data/raw/otp_2026_7.zip \
  --airports data/raw/airports.dat \
  --trips data/raw/seed_trips.csv \
  --out web/public/tripdata.json \
  --today "$TODAY"
