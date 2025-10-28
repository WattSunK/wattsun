#!/bin/sh
# ==========================================================
# 🔒 WattSun — Automated SQLite & Config Backup Utility
# ==========================================================
# Creates timestamped backups of all active databases and
# .env configuration files for both DEV and QA environments.
# ----------------------------------------------------------
# Location:   /volume1/web/wattsun/scripts/backup_sqlite_wattsun.sh
# Schedule:   Daily at 02:00 (see Task Scheduler notes below)
# ==========================================================

set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
BACKUP_ROOT="/volume1/backups/wattsun"
TS="$(date +%Y-%m-%d_%H%M%S)"
OUT_DIR="$BACKUP_ROOT/$TS"
LOG_FILE="$OUT_DIR/backup.log"

mkdir -p "$OUT_DIR"

echo "=== WattSun backup started at $TS ===" | tee "$LOG_FILE"

# ----------------------------------------------------------
# 🧱 1. Backup main databases (DEV + QA)
# ----------------------------------------------------------
for DB in \
  "$ROOT_DIR/data/dev/wattsun.dev.db" \
  "$ROOT_DIR/data/dev/inventory.dev.db" \
  "$ROOT_DIR/data/qa/wattsun.qa.db" \
  "$ROOT_DIR/data/qa/inventory.qa.db"
do
  if [ -f "$DB" ]; then
    BASENAME="$(basename "$DB" .db)"
    OUT_FILE="$OUT_DIR/${BASENAME}.db"
    echo "Backing up $DB → $OUT_FILE.gz" | tee -a "$LOG_FILE"
    sqlite3 "$DB" ".backup '$OUT_FILE'"
    gzip "$OUT_FILE"
  else
    echo "⚠️  Skipping missing $DB" | tee -a "$LOG_FILE"
  fi
done

# ----------------------------------------------------------
# 🧾 2. Copy JSON orders file if present
# ----------------------------------------------------------
if [ -f "$ROOT_DIR/data/dev/orders.dev.json" ]; then
  cp "$ROOT_DIR/data/dev/orders.dev.json" "$OUT_DIR/orders.dev.json"
  echo "Included orders.dev.json" | tee -a "$LOG_FILE"
fi

# ----------------------------------------------------------
# ⚙️ 3. Backup .env and .env.qa files
# ----------------------------------------------------------
for ENVFILE in "$ROOT_DIR/.env" "$ROOT_DIR/.env.qa"; do
  if [ -f "$ENVFILE" ]; then
    cp "$ENVFILE" "$OUT_DIR/"
    echo "Included $(basename "$ENVFILE")" | tee -a "$LOG_FILE"
  fi
done

# ----------------------------------------------------------
# 🧹 4. Retention (keep last 30 backups)
# ----------------------------------------------------------
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf {} \; 2>/dev/null || true

echo "✅ Backup complete: $OUT_DIR" | tee -a "$LOG_FILE"
exit 0
