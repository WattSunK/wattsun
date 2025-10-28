#!/bin/sh
# ==========================================================
# 🌍 WattSun — Full Site Backup (Files + Databases + Config)
# ==========================================================
# Creates a timestamped archive of the *entire WattSun site*,
# including code, HTML, CSS/JS assets, and database backups.
#
# Structure:
#   /volume1/web/backups/wattsun/full/<timestamp>/
#     ├─ wattsun_full_<timestamp>.tar.gz
#     └─ (contains everything from /volume1/web/wattsun/)
#
# The script also triggers the lightweight database backup
# first (backup_sqlite_wattsun.sh) to ensure the latest
# SQLite copies are captured inside the archive.
#
# Recommended schedule:
#   - Run nightly DB backup (small)
#   - Run this full backup weekly (Sunday 03:00)
# ==========================================================

set -eu

# ----- Paths -----
ROOT_DIR="/volume1/web/wattsun"
BACKUP_ROOT="/volume1/web/backups/wattsun/full"
TS="$(date +%Y-%m-%d_%H%M%S)"
OUT_DIR="$BACKUP_ROOT/$TS"
ARCHIVE="$OUT_DIR/wattsun_full_${TS}.tar.gz"
LOG_FILE="$OUT_DIR/backup_full.log"

mkdir -p "$OUT_DIR"

echo "=== WattSun Full-Site Backup started at $TS ===" | tee "$LOG_FILE"
echo "Root directory: $ROOT_DIR" | tee -a "$LOG_FILE"
echo "Backup target:  $ARCHIVE" | tee -a "$LOG_FILE"

# ----------------------------------------------------------
# 1️⃣  Run database/config backup first
# ----------------------------------------------------------
if [ -x "$ROOT_DIR/scripts/backup_sqlite_wattsun.sh" ]; then
  echo "[step] Running backup_sqlite_wattsun.sh ..." | tee -a "$LOG_FILE"
  bash "$ROOT_DIR/scripts/backup_sqlite_wattsun.sh" >> "$LOG_FILE" 2>&1 || true
else
  echo "⚠️  Database backup script not found or not executable." | tee -a "$LOG_FILE"
fi

# ----------------------------------------------------------
# 2️⃣  Create archive of full site (excluding heavy/temp dirs)
# ----------------------------------------------------------
echo "[step] Creating compressed site archive ..." | tee -a "$LOG_FILE"

tar --exclude='node_modules' \
    --exclude='logs/*' \
    --exclude='backups/*' \
    --exclude='run/*' \
    --exclude='.git' \
    -czf "$ARCHIVE" -C /volume1/web wattsun

echo "✅ Archive created: $ARCHIVE" | tee -a "$LOG_FILE"

# ----------------------------------------------------------
# 3️⃣  Fix permissions for NAS access
# ----------------------------------------------------------
chown -R 53Bret:users "$OUT_DIR" 2>/dev/null || true
chmod -R 755 "$OUT_DIR" 2>/dev/null || true

# ----------------------------------------------------------
# 4️⃣  Retention: keep last 8 full backups (8 weeks)
# ----------------------------------------------------------
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +56 -exec rm -rf {} \; 2>/dev/null || true

echo "✅ Full-site backup complete at $TS" | tee -a "$LOG_FILE"
echo "Backup stored in: $OUT_DIR" | tee -a "$LOG_FILE"
echo "----------------------------------------------------------" | tee -a "$LOG_FILE"
exit 0
