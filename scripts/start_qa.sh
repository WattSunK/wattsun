#!/bin/bash
# ===========================================
# 🟨 WattSun QA Environment Startup (Patched)
# ===========================================

export NODE_ENV=qa
export PORT=3000

ROOT="/volume1/web/wattsun"
export SQLITE_DB="$ROOT/data/qa/wattsun.qa.db"
export DB_PATH_USERS="$ROOT/data/qa/wattsun.qa.db"
export DB_PATH_INVENTORY="$ROOT/data/qa/inventory.qa.db"
export LOG_FILE="$ROOT/logs/qa/app.out"
export RUN_DIR="$ROOT/run/qa"

mkdir -p "$ROOT/logs/qa" "$RUN_DIR"
cd "$ROOT" || { echo "❌ Failed to enter $ROOT"; exit 1; }

echo "==========================================================="
echo "[qa] WattSun QA Environment Startup"
echo "NODE_ENV=$NODE_ENV"
echo "DB_PATH_USERS=$DB_PATH_USERS"
echo "SQLITE_DB=$SQLITE_DB"
echo "LOG_FILE=$LOG_FILE"
echo "==========================================================="

# 🧩 Auto-verify dependencies
if [ ! -d node_modules ] || [ ! -f node_modules/better-sqlite3/package.json ]; then
  echo "[qa] ⚙️ node_modules missing or incomplete — reinstalling..."
  npm ci --omit=dev || npm install
  echo "[qa] ✅ Dependencies verified."
else
  echo "[qa] 🧱 Dependencies OK — proceeding to start server."
fi

# Launch server
nohup env NODE_ENV=$NODE_ENV \
DB_PATH_USERS=$DB_PATH_USERS \
DB_PATH_INVENTORY=$DB_PATH_INVENTORY \
SQLITE_DB=$SQLITE_DB \
PORT=$PORT \
node "$ROOT/server.js" > "$LOG_FILE" 2>&1 &

echo $! > "$RUN_DIR/app.pid"

echo "[qa] ✅ WattSun QA server running on port $PORT (NODE_ENV=$NODE_ENV)"
echo "[qa] Logs: $LOG_FILE"
echo "[qa] PID file: $RUN_DIR/app.pid"
