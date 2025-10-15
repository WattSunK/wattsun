#!/bin/bash
# ===========================================
# 🟨 WattSun QA Environment Startup (Hardened)
# ===========================================

set -euo pipefail

export NODE_ENV=qa
export PORT=3000
export ROOT="/volume1/web/wattsun"
export WATTSUN_DB_ROOT="$ROOT/data/qa"
export DB_PATH_USERS="$WATTSUN_DB_ROOT/wattsun.qa.db"
export DB_PATH_INVENTORY="$WATTSUN_DB_ROOT/inventory.qa.db"
export SQLITE_DB="$DB_PATH_USERS"
export LOG_FILE="$ROOT/logs/qa/app.out"
export RUN_DIR="$ROOT/run/qa"

mkdir -p "$ROOT/logs/qa" "$RUN_DIR"

echo "==========================================================="
echo "[qa] WattSun QA Startup"
echo "NODE_ENV=$NODE_ENV"
echo "PORT=$PORT"
echo "DB_PATH_USERS=$DB_PATH_USERS"
echo "==========================================================="

# 🧩 Verify DB files exist
for f in "$DB_PATH_USERS" "$DB_PATH_INVENTORY"; do
  if [ ! -f "$f" ]; then
    echo "[qa] ❌ Missing database file: $f"
    exit 1
  fi
done

# 🧩 Enforce DB file permissions
chmod 664 "$DB_PATH_USERS" "$DB_PATH_INVENTORY" 2>/dev/null || true
chown 53Bret:users "$DB_PATH_USERS" "$DB_PATH_INVENTORY" 2>/dev/null || true

# 🧩 Kill existing process on port
EXISTING_PID=$(netstat -tlnp 2>/dev/null | grep ":${PORT}" | awk '{print $7}' | cut -d'/' -f1 || true)
if [ -n "$EXISTING_PID" ]; then
  echo "[qa] 🧹 Port $PORT in use by PID $EXISTING_PID — stopping it..."
  kill "$EXISTING_PID" 2>/dev/null || sudo kill -9 "$EXISTING_PID" 2>/dev/null || true
  sleep 1
fi

cd "$ROOT" || exit 1

# 🧩 Dependencies check
if [ ! -d node_modules ] || [ ! -f node_modules/better-sqlite3/package.json ]; then
  echo "[qa] ⚙️ Installing dependencies..."
  npm ci --omit=dev || npm install --omit=dev
  echo "[qa] ✅ Dependencies verified."
else
  echo "[qa] 🧱 Dependencies OK — proceeding."
fi

# 🧩 Fix permissions on native modules
find node_modules -type f -name "*.node" -exec chmod 755 {} \; 2>/dev/null || true

# 🟢 Launch backend
echo "[qa] 🚀 Starting WattSun QA backend..."
nohup env NODE_ENV=$NODE_ENV \
  DB_PATH_USERS=$DB_PATH_USERS \
  DB_PATH_INVENTORY=$DB_PATH_INVENTORY \
  SQLITE_DB=$SQLITE_DB \
  PORT=$PORT \
  node "$ROOT/server.js" > "$LOG_FILE" 2>&1 &

echo $! > "$RUN_DIR/app.pid"
echo "[qa] ✅ WattSun QA running (port $PORT) — logs: $LOG_FILE"
