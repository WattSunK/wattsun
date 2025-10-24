#!/bin/bash
# ============================================================
# 🧩 WattSun — Rebuild QA Environment from DEV Baseline (Safe)
# ============================================================
# Copies latest Dev code + databases into QA environment.
# NO nesting (/qa/qa), NO deletions outside QA.
# Creates /data/qa at repo root, not inside /qa/.
# Logs operations under logs/rebuild_qa.log
# ============================================================

set -euo pipefail
cd "$(dirname "$0")/.." || exit 1

LOG_FILE="logs/rebuild_qa.log"
mkdir -p "$(dirname "$LOG_FILE")"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "============================================================"
echo "🚀 Rebuilding WattSun QA from Dev baseline ($(date))"
echo "============================================================"

# --- 1️⃣ Stop any running QA processes ---
echo "🛑 Stopping existing QA processes..."
pkill -f "/volume1/web/wattsun/qa/server.js" 2>/dev/null || true
pkill -f "/volume1/web/wattsun/qa/scripts/notifications_worker.js" 2>/dev/null || true
sleep 2

# --- 2️⃣ Define paths ---
ROOT="/volume1/web/wattsun"
DEV_DATA="$ROOT/data/dev"
QA_DATA="$ROOT/data/qa"
QA_ROOT="$ROOT/qa"

mkdir -p "$QA_DATA"

# --- 3️⃣ Backup any existing QA DBs ---
if compgen -G "$QA_DATA/*.db" > /dev/null; then
  TS=$(date +%Y%m%d_%H%M%S)
  BACKUP_DIR="$ROOT/backups/qa_rebuild_$TS"
  echo "📦 Backing up existing QA DBs to $BACKUP_DIR"
  mkdir -p "$BACKUP_DIR"
  cp -v "$QA_DATA"/*.db "$BACKUP_DIR"/ || true
fi

# --- 4️⃣ Copy DEV databases to QA ---
echo "🧱 Copying DEV databases to QA..."
cp -v "$DEV_DATA"/wattsun.dev.db "$QA_DATA"/wattsun.qa.db
cp -v "$DEV_DATA"/inventory.dev.db "$QA_DATA"/inventory.qa.db

chmod 664 "$QA_DATA"/*.db
chown 53Bret:users "$QA_DATA"/*.db 2>/dev/null || true

# --- 5️⃣ Rsync code baseline (exclude heavy dirs) ---
echo "📁 Syncing code from main repo into /qa/ ..."
rsync -a \
  --delete \
  --exclude ".git" \
  --exclude "node_modules" \
  --exclude "data" \
  --exclude "logs" \
  --exclude "archive" \
  --exclude "backups" \
  --exclude "infra" \
  --exclude "run" \
  ./ "$QA_ROOT/"

# --- 6️⃣ Start QA environment ---
echo "🚀 Starting QA environment..."
if [ -f "$QA_ROOT/scripts/start_qa.sh" ]; then
  sudo bash "$QA_ROOT/scripts/start_qa.sh"
else
  echo "⚠️  start_qa.sh not found under QA; skipping auto-start."
fi

# --- 7️⃣ Verify QA health ---
echo "🔍 Verifying QA API health..."
sleep 5
curl -fsS http://127.0.0.1:3000/api/health || echo "⚠️  QA /api/health did not respond (check manually)."

echo "============================================================"
echo "✅ Rebuild complete. Logs: $LOG_FILE"
echo "============================================================"
