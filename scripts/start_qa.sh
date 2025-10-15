#!/bin/bash
# ===========================================
# 🟨 WattSun QA Environment Startup (Final)
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

# 🧩 Kill existing process on port 3000 to avoid EADDRINUSE
EXISTING_PID=$(netstat -tlnp 2>/dev/null | grep ":${PORT}" | awk '{print $7}' | cut -d'/' -f1 || true)
if [ -n "$EXISTING_PID" ]; then
  echo "[qa] 🧹 Port $PORT already in use by PID $EXISTING_PID — stopping it..."
  kill "$EXISTING_PID" 2>/dev/null || sudo kill -9 "$EXISTING_PID" 2>/dev/null || true
  sleep 1
fi

# 🧩 Auto-verify dependencies
if [ ! -d node_modules ] || [ ! -f node_modules/better-sqlite3/package.json ]; then
  echo "[qa] ⚙️ node_modules missing or incomplete — reinstalling..."
  npm ci --omit=dev || npm install --omit=dev
  echo "[qa] ✅ Dependencies verified."
else
  echo "[qa] 🧱 Dependencies OK — proceeding."
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

echo "[qa] ✅ WattSun QA server running on port $PORT (NODE_ENV=$NODE_ENV)"
echo "[qa] Logs: $LOG_FILE"
echo "[qa] PID file: $RUN_DIR/app.pid"
