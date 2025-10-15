#!/bin/bash
# ===========================================
# 🟩 WattSun Dev Environment Startup (Patched)
# ===========================================

export NODE_ENV=development
export PORT=3001

ROOT="/volume1/web/wattsun"
export SQLITE_DB="$ROOT/data/dev/wattsun.dev.db"
export DB_PATH_USERS="$ROOT/data/dev/wattsun.dev.db"
export DB_PATH_INVENTORY="$ROOT/data/dev/inventory.dev.db"
export LOG_FILE="$ROOT/logs/dev/app.out"
export RUN_DIR="$ROOT/run/dev"

mkdir -p "$ROOT/logs/dev" "$RUN_DIR"

echo "==========================================================="
echo "[dev] WattSun DEV Environment Startup"
echo "NODE_ENV=$NODE_ENV"
echo "DB_PATH_USERS=$DB_PATH_USERS"
echo "SQLITE_DB=$SQLITE_DB"
echo "LOG_FILE=$LOG_FILE"
echo "==========================================================="

# 🧩 Auto-verify dependencies
cd "$ROOT" || exit 1
if [ ! -d node_modules ] || [ ! -f node_modules/better-sqlite3/package.json ]; then
  echo "[dev] ⚙️ node_modules missing or incomplete — reinstalling..."
  npm ci --omit=dev || npm install
  echo "[dev] ✅ Dependencies verified."
else
  echo "[dev] 🧱 Dependencies OK — proceeding to start server."
fi

# Launch server
nohup env NODE_ENV=$NODE_ENV \
DB_PATH_USERS=$DB_PATH_USERS \
DB_PATH_INVENTORY=$DB_PATH_INVENTORY \
SQLITE_DB=$SQLITE_DB \
PORT=$PORT \
node "$ROOT/server.js" > "$LOG_FILE" 2>&1 &

echo $! > "$RUN_DIR/app.pid"

echo "[dev] ✅ WattSun DEV server running on port $PORT (NODE_ENV=$NODE_ENV)"
echo "[dev] Logs: $LOG_FILE"
echo "[dev] PID file: $RUN_DIR/app.pid"
