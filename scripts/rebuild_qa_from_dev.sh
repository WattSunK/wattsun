#!/bin/bash
# ============================================================
# 🚀 Rebuild QA from Dev (Safe + Non-nesting version)
# ============================================================

set -e

ROOT="/volume1/web/wattsun"
QA_ROOT="/volume1/web/wattsun/qa"
QA_DATA="$ROOT/data/qa"

echo "============================================================"
echo "🚀 Rebuilding QA from Dev baseline ($(date))"
echo "============================================================"

# 1️⃣ Stop running QA processes
echo "🛑 Stopping QA processes..."
pkill -f "$QA_ROOT/server.js" 2>/dev/null || true
pkill -f "$QA_ROOT/scripts/notifications_worker.js" 2>/dev/null || true

# 2️⃣ Prepare QA directories
echo "📁 Ensuring QA directory structure..."
mkdir -p "$QA_ROOT" "$QA_DATA"
for d in public routes services src test tools; do
  mkdir -p "$QA_ROOT/$d"
done
echo "✅ QA base folders ready: $(ls -1 "$QA_ROOT" | xargs)"

# 3️⃣ Copy DEV DBs → QA
echo "🧱 Copying DEV databases to QA..."
cp -v "$ROOT/data/dev/wattsun.dev.db" "$QA_DATA/wattsun.qa.db"
cp -v "$ROOT/data/dev/inventory.dev.db" "$QA_DATA/inventory.qa.db"

# 4️⃣ Sync source code (excluding heavy dirs)
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
