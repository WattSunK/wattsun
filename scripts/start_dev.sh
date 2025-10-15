#!/bin/bash
# ===========================================
# 🟩 WattSun Dev Environment Startup (Final)
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

# 🧩 Kill existing process on port 3001 to avoid EADDRINUSE
EXISTING_PID=$(netstat -tlnp 2>/dev/null | grep ":${PORT}" | awk '{print $7}' | cut -d'/' -f1 || true)
if [ -n "$EXISTING_PID" ]; then
  echo "[dev] 🧹 Port $PORT already in use by PID $EXISTING_PID — stopping it..."
  kill "$EXISTING_PID" 2>/dev/null || sudo kill -9 "$EXISTING_PID" 2>/dev/null || true
  sleep 1
fi

# 🧩 Auto-verify dependencies
cd "$ROOT" || exit 1
if [ ! -d node_modules ] || [ ! -f node_modules/better-sqlite3/package.json ]; then
  echo "[dev] ⚙️ node_modules missing or incomplete — reinstalling..."
  npm ci --omit=dev || npm install --omit=dev
  echo "[dev] ✅ Dependencies verified."
else
  echo "[dev] 🧱 Dependencies OK — proceeding."
fi

# 🧩 Fix native module permissions
find node_modules -type f -name "*.node" -exec chmod 755 {} \; 2>/dev/null || true
chown -R 53Bret:users node_modules 2>/dev/null || true

# 🟢 Launch server
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
