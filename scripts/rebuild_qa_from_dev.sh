#!/bin/bash
# ============================================================
# ⚡ WattSun — Optimized QA Rebuild from DEV Baseline
# ============================================================
# Fast, safe promotion: sync code (excluding heavy dirs + scripts),
# copy DEV DBs, and restart QA. No nesting or duplication.
# ============================================================

set -euo pipefail
cd "$(dirname "$0")/.." || exit 1

LOG_FILE="logs/rebuild_qa.log"
mkdir -p "$(dirname "$LOG_FILE")"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "============================================================"
echo "🚀 Rebuilding QA from Dev baseline ($(date))"
echo "============================================================"

ROOT="/volume1/web/wattsun"
DEV_DATA="$ROOT/data/dev"
QA_DATA="$ROOT/data/qa"
QA_ROOT="$ROOT/qa"

# --- 1️⃣ Stop existing QA processes ---
echo "🛑 Stopping QA processes..."
pkill -f "$QA_ROOT/server.js" 2>/dev/null || true
pkill -f "$QA_ROOT/scripts/notifications_worker.js" 2>/dev/null || true
sleep 1

# --- 2️⃣ Backup any existing QA DBs ---
if compgen -G "$QA_DATA/*.db" > /dev/null; then
  TS=$(date +%Y%m%d_%H%M%S)
  BACKUP_DIR="$ROOT/backups/qa_rebuild_$TS"
  echo "📦 Backing up existing QA DBs → $BACKUP_DIR"
  mkdir -p "$BACKUP_DIR"
  cp -v "$QA_DATA"/*.db "$BACKUP_DIR"/ || true
fi

# --- 3️⃣ Copy fresh Dev DBs ---
echo "🧱 Copying DEV DBs → QA ..."
mkdir -p "$QA_DATA"
cp -v "$DEV_DATA"/wattsun.dev.db "$QA_DATA"/wattsun.qa.db
cp -v "$DEV_DATA"/inventory.dev.db "$QA_DATA"/inventory.qa.db
chmod 664 "$QA_DATA"/*.db
chown 53Bret:users "$QA_DATA"/*.db 2>/dev/null || true

# --- 4️⃣ Fast rsync (optimized) ---
echo "📁 Syncing code (optimized)..."
rsync -a --delete \
  --exclude ".git" \
  --exclude "node_modules" \
  --exclude "data" \
  --exclude "logs" \
  --exclude "backups" \
  --exclude "archive" \
  --exclude "infra" \
  --exclude "run" \
  --exclude "scripts" \
  --exclude "qa/scripts" \
  --info=progress2 \
  ./ "$QA_ROOT/"

# --- 5️⃣ Start QA ---
echo "🚀 Starting QA environment..."
if [ -f "$ROOT/scripts/start_qa.sh" ]; then
  sudo bash "$ROOT/scripts/start_qa.sh"
else
  echo "⚠️  start_qa.sh missing in root; please start QA manually."
fi

# --- 6️⃣ Verify health ---
echo "🔍 Checking QA health..."
sleep 5
curl -fsS http://127.0.0.1:3000/api/health || echo "⚠️  QA health check failed."

echo "============================================================"
echo "✅ Rebuild complete. Logs: $LOG_FILE"
echo "============================================================"
