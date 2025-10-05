#!/bin/sh
set -eu
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
DB_PATH="${DB_PATH:-$ROOT_DIR/data/dev/marketplace.dev.db}"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/logs}"
TS="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$OUT_DIR"

if [ -f "$DB_PATH" ] && command -v sqlite3 >/dev/null 2>&1; then
  OUT_FILE="$OUT_DIR/marketplace.dev.$TS.sqlite"
  echo "Backing up $DB_PATH -> $OUT_FILE"
  sqlite3 "$DB_PATH" ".backup '$OUT_FILE'"
  gzip "$OUT_FILE"
  echo "Created $OUT_FILE.gz"
else
  echo "No DB file or sqlite3 missing; nothing to back up."
fi
