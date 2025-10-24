#!/bin/bash
# ============================================================
# ⚡ WattSun — Optimized QA Rebuild from DEV Baseline
# ============================================================
# Safe and fast rebuild:
# - Recreates missing QA directories
# - Copies DEV DBs
# - Rsyncs main code (excluding heavy/runtime dirs)
# - Restarts QA
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

# --- 1️⃣ Stop QA processes ---
echo "🛑 Stopping QA processes..."
pkill -f "$QA_ROOT/server.js" 2>/dev/null || true
pkill -f "$QA_ROOT/scripts/notifications_worker.js" 2>/dev/null || true
sleep 1

# --- 2️⃣ Bootstrap QA directories ---
echo "📁 Ensuring QA directory structure..."
mkdir -p "$QA_ROOT" "$QA_DATA"
for d in routes public services src test tools; do
  mkdir -p "$QA_ROOT/$d"
done
echo "✅ QA base folders ready: $(ls -1 "$QA_ROOT" | xargs)"

# --- 3️⃣ Backup existing QA DBs ---
if compgen -G "$QA_DATA/*.db" > /dev/null; then
  TS=$(date +%Y%m%d_%H%M%S)
  BACKUP_DIR="$ROOT/backups/qa_rebuild_$TS"
  echo "📦 Backing up existing QA DBs → $BACKUP_DIR"
  mkdir -p "$BACKUP_DIR"
  cp -v "$QA_DATA"/*.db "$BACKUP_DIR"/ || true
fi

# --- 4️⃣ Copy Dev DBs to QA ---
echo "🧱 Copying DEV databases to QA..."
cp -v "$DEV_DATA"/wattsun.dev.db "$QA_DATA"/wattsun.qa.db
cp -v "$DEV_DATA"/inventory.dev.db "$QA_DATA"/inventory.qa.db
chmod 664 "$QA_DATA"/*.db
chown 53Bret:users "$QA_DATA"/*.db 2>/dev/null || true

# --- 5️⃣ Optimized rsync (skip runtime + scripts) ---
echo "🔄 Syncing Dev code → QA (optimized)..."
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

# --- 6️⃣ Start QA server ---
echo "🚀 Starting QA environment..."
if [ -f "$ROOT/scripts/start_qa.sh" ]; then
  sudo bash "$ROOT/scripts/start_qa.sh"
else
  echo "⚠️  start_qa.sh not found; start manually."
fi

# --- 7️⃣ Health check ---
echo "🔍 Checking QA health (port 3000)..."
sleep 5
if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
  echo "✅ QA /api/health → OK"
else
  echo "⚠️  QA health check failed; check logs or port usage."
fi

echo "============================================================"
echo "✅ QA rebuild complete. Log: $LOG_FILE"
echo "============================================================"
