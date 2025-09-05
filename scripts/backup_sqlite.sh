#!/bin/sh
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATE=$(date +%F_%H%M%S)
DEST="/volume1/backups/wattsun/$DATE"
mkdir -p "$DEST"

for f in "$ROOT"/data/dev/*.dev.db "$ROOT"/data/dev/orders.dev.json; do
  [ -e "$f" ] || continue
  cp -a "$f" "$DEST"/
done

# keep last 30 backups
ls -1dt /volume1/backups/wattsun/* 2>/dev/null | awk 'NR>30' | xargs -r rm -rf
echo "Backup complete -> $DEST"
