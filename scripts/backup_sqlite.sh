#!/usr/bin/env bash
set -euo pipefail
BASE="/volume1/web/wattsun"
DATA="$BASE/data/dev"
STAMP="$(date +%F_%H%M%S)"
OUT="$BASE/backups/sqlite_$STAMP"
mkdir -p "$OUT"

echo "→ Backing up SQLite + JSON to $OUT"

# DBs
for DB in "$DATA/wattsun.dev.db" "$DATA/inventory.dev.db"; do
  if [ -f "$DB" ]; then
    echo "  • DB: $(basename "$DB")"
    sqlite3 "$DB" ".backup '$OUT/$(basename "$DB")'"
  else
    echo "  • DB missing: $DB"
  fi
done

# JSONs (orders etc.)
cp -a "$DATA"/*.json "$OUT/" 2>/dev/null || true

echo "→ Result:"
ls -lh "$OUT"
