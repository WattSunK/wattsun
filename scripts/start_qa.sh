#!/bin/bash
# ===========================================
# ðŸŸ¨ WattSun QA Environment Startup (Self-Contained)
# ===========================================

set -euo pipefail

export NODE_ENV=qa
export PORT=3000
export ROOT="/volume1/web/wattsun/qa"
ROOT_PARENT="$(dirname "$ROOT")"
WORKER_SCRIPT="$ROOT_PARENT/scripts/notifications_worker.js"
if [ ! -f "$WORKER_SCRIPT" ]; then
  echo "[qa] Missing worker script at $WORKER_SCRIPT"
  exit 1
fi
export WATTSUN_DB_ROOT="/volume1/web/wattsun/data/qa"
export DB_PATH_USERS="$WATTSUN_DB_ROOT/wattsun.qa.db"
export DB_PATH_INVENTORY="$WATTSUN_DB_ROOT/inventory.qa.db"
export SQLITE_DB="$DB_PATH_USERS"
export SQLITE_MAIN="$DB_PATH_USERS"
export LOG_FILE="$ROOT/logs/app.out"
export RUN_DIR="$ROOT/run"

mkdir -p "$ROOT/logs" "$RUN_DIR" "$WATTSUN_DB_ROOT"

echo "==========================================================="
echo "[qa] WattSun QA Startup (Self-Contained)"
echo "ROOT=$ROOT"
echo "PORT=$PORT"
echo "DB_PATH_USERS=$DB_PATH_USERS"
echo "==========================================================="

# Verify DB files exist
for f in "$DB_PATH_USERS" "$DB_PATH_INVENTORY"; do
  if [ ! -f "$f" ]; then
    echo "[qa] âŒ Missing database file: $f"
    exit 1
  fi
done

chmod 664 "$DB_PATH_USERS" "$DB_PATH_INVENTORY" 2>/dev/null || true
chown 53Bret:users "$DB_PATH_USERS" "$DB_PATH_INVENTORY" 2>/dev/null || true

# Kill any existing process on port
EXISTING_PID=$(netstat -tlnp 2>/dev/null | grep ":${PORT}" | awk '{print $7}' | cut -d'/' -f1 || true)
if [ -n "$EXISTING_PID" ]; then
  echo "[qa] ðŸ§¹ Port $PORT in use by PID $EXISTING_PID â€” stopping..."
  kill "$EXISTING_PID" 2>/dev/null || sudo kill -9 "$EXISTING_PID" 2>/dev/null || true
  sleep 1
fi

cd "$ROOT"

# Dependencies check
if [ ! -d node_modules ] || [ ! -f node_modules/better-sqlite3/package.json ]; then
  echo "[qa] Installing dependencies..."
  npm ci --omit=dev || npm install --omit=dev
  echo "[qa] Dependencies verified."
else
  echo "[qa] Dependencies OK proceeding."
fi

find node_modules -type f -name "*.node" -exec chmod 755 {} \; 2>/dev/null || true

# Launch backend
echo "[qa] ðŸš€ Starting WattSun QA backend..."
nohup env NODE_ENV=$NODE_ENV \
  SQLITE_MAIN=$SQLITE_MAIN \
  DB_PATH_USERS=$DB_PATH_USERS \
  DB_PATH_INVENTORY=$DB_PATH_INVENTORY \
  SQLITE_DB=$SQLITE_DB \
  PORT=$PORT \
  node "$ROOT/server.js" > "$LOG_FILE" 2>&1 &

echo $! > "$RUN_DIR/app.pid"
echo "[qa] âœ… WattSun QA running on port $PORT (PID $(cat "$RUN_DIR/app.pid"))"

sleep 2
code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/health" || true)
echo "[qa] Health check â†’ HTTP ${code}"

## ---- Notifications Worker (background) ----
# Prefer central .env.qa one level up from QA root
export ENV_FILE="/volume1/web/wattsun/.env.qa"
export WORKER_LOG_OUT="$ROOT/logs/worker.out"
export WORKER_LOG_ERR="$ROOT/logs/worker.err"
export WORKER_PID="$RUN_DIR/worker.pid"

if [ -f "$WORKER_PID" ] && kill -0 "$(cat "$WORKER_PID")" 2>/dev/null; then
  echo "[qa] notifications_worker already running (PID $(cat "$WORKER_PID"))"
else
  echo "[qa] Starting notifications_worker.js..."
  cd "$ROOT"
  echo "[qa] Worker DB_PATH_USERS=$DB_PATH_USERS"
  nohup env NODE_ENV="$NODE_ENV" \
    PORT="$PORT" \
    ROOT="$ROOT" \
    WATTSUN_DB_ROOT="$WATTSUN_DB_ROOT" \
    DB_PATH_USERS="$DB_PATH_USERS" \
    DB_PATH_INVENTORY="$DB_PATH_INVENTORY" \
    SQLITE_DB="$DB_PATH_USERS" \
    SQLITE_MAIN="$DB_PATH_USERS" \
    ENV_FILE="$ENV_FILE" \
    bash -c "SQLITE_MAIN=$DB_PATH_USERS DB_PATH_USERS=$DB_PATH_USERS SQLITE_DB=$DB_PATH_USERS node $WORKER_SCRIPT" \
    >> "$WORKER_LOG_OUT" 2>> "$WORKER_LOG_ERR" &
  chown -R 53Bret:users "$ROOT/logs" 2>/dev/null || true
  echo $! > "$WORKER_PID"
  echo "[qa] notifications_worker started (PID $(cat "$WORKER_PID")) - logs: $WORKER_LOG_OUT"
fi
