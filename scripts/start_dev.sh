#!/bin/bash
# ===========================================
# 🟩 WattSun DEV Environment Startup (Hardened)
# ===========================================

set -euo pipefail

export NODE_ENV=development
export PORT=3001
export ROOT="/volume1/web/wattsun"
export WATTSUN_DB_ROOT="$ROOT/data/dev"
export DB_PATH_USERS="$WATTSUN_DB_ROOT/wattsun.dev.db"
export DB_PATH_INVENTORY="$WATTSUN_DB_ROOT/inventory.dev.db"
export SQLITE_DB="$DB_PATH_USERS"
export SQLITE_MAIN="$DB_PATH_USERS"
export LOG_FILE="$ROOT/logs/dev/app.out"
export RUN_DIR="$ROOT/run/dev"

mkdir -p "$ROOT/logs/dev" "$RUN_DIR"

echo "==========================================================="
echo "[dev] WattSun DEV Startup"
echo "NODE_ENV=$NODE_ENV"
echo "PORT=$PORT"
echo "DB_PATH_USERS=$DB_PATH_USERS"
echo "==========================================================="

# 🧩 Verify DB files exist
for f in "$DB_PATH_USERS" "$DB_PATH_INVENTORY"; do
  if [ ! -f "$f" ]; then
    echo "[dev] ❌ Missing database file: $f"
    exit 1
  fi
done

# 🧩 Enforce DB file permissions
chmod 664 "$DB_PATH_USERS" "$DB_PATH_INVENTORY" 2>/dev/null || true
chown 53Bret:users "$DB_PATH_USERS" "$DB_PATH_INVENTORY" 2>/dev/null || true

# 🧩 Kill existing process on port
EXISTING_PID=$(netstat -tlnp 2>/dev/null | grep ":${PORT}" | awk '{print $7}' | cut -d'/' -f1 || true)
if [ -n "$EXISTING_PID" ]; then
  echo "[dev] 🧹 Port $PORT in use by PID $EXISTING_PID — stopping it..."
  kill "$EXISTING_PID" 2>/dev/null || sudo kill -9 "$EXISTING_PID" 2>/dev/null || true
  sleep 1
fi

cd "$ROOT" || exit 1

# 🧩 Dependencies check
if [ ! -d node_modules ] || [ ! -f node_modules/better-sqlite3/package.json ]; then
  echo "[dev] ⚙️ Installing dependencies..."
  npm ci --omit=dev || npm install --omit=dev
  echo "[dev] ✅ Dependencies verified."
else
  echo "[dev] 🧱 Dependencies OK — proceeding."
fi

# 🧩 Fix permissions on native modules
find node_modules -type f -name "*.node" -exec chmod 755 {} \; 2>/dev/null || true

# 🟢 Launch backend
echo "[dev] 🚀 Starting WattSun DEV backend..."
nohup env NODE_ENV=$NODE_ENV \
  SQLITE_MAIN=$SQLITE_MAIN \
  DB_PATH_USERS=$DB_PATH_USERS \
  DB_PATH_INVENTORY=$DB_PATH_INVENTORY \
  SQLITE_DB=$SQLITE_DB \
  PORT=$PORT \
  node "$ROOT/server.js" > "$LOG_FILE" 2>&1 &

echo $! > "$RUN_DIR/app.pid"
echo "[dev] ✅ WattSun DEV running (port $PORT) — logs: $LOG_FILE"

# 🩺 Health check
sleep 2
code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/health" || true)
echo "[dev] Health check → HTTP ${code}"

