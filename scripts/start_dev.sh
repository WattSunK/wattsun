﻿#!/bin/bash
# ===========================================
# ðŸŸ© WattSun DEV Environment Startup (Hardened)
# ===========================================

set -euo pipefail

export ENV_FILE=/volume1/web/wattsun/.env
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

# ðŸ§© Verify DB files exist
for f in "$DB_PATH_USERS" "$DB_PATH_INVENTORY"; do
  if [ ! -f "$f" ]; then
    echo "[dev] âŒ Missing database file: $f"
    exit 1
  fi
done

# ðŸ§© Enforce DB file permissions
chmod 664 "$DB_PATH_USERS" "$DB_PATH_INVENTORY" 2>/dev/null || true
chown 53Bret:users "$DB_PATH_USERS" "$DB_PATH_INVENTORY" 2>/dev/null || true

# ðŸ§© Kill existing process on port
EXISTING_PID=$(netstat -tlnp 2>/dev/null | grep ":${PORT}" | awk '{print $7}' | cut -d'/' -f1 || true)
if [ -n "$EXISTING_PID" ]; then
  echo "[dev] ðŸ§¹ Port $PORT in use by PID $EXISTING_PID â€” stopping it..."
  kill "$EXISTING_PID" 2>/dev/null || sudo kill -9 "$EXISTING_PID" 2>/dev/null || true
  sleep 1
fi

cd "$ROOT" || exit 1

# ðŸ§© Dependencies check
if [ ! -d node_modules ] || [ ! -f node_modules/better-sqlite3/package.json ]; then
  echo "[dev] âš™ï¸ Installing dependencies..."
  npm ci --omit=dev || npm install --omit=dev
  echo "[dev] âœ… Dependencies verified."
else
  echo "[dev] ðŸ§± Dependencies OK â€” proceeding."
fi

# ðŸ§© Fix permissions on native modules
find node_modules -type f -name "*.node" -exec chmod 755 {} \; 2>/dev/null || true

# ðŸŸ¢ Launch backend
echo "[dev] ðŸš€ Starting WattSun DEV backend..."
nohup env NODE_ENV=$NODE_ENV \
  SQLITE_MAIN=$SQLITE_MAIN \
  DB_PATH_USERS=$DB_PATH_USERS \
  DB_PATH_INVENTORY=$DB_PATH_INVENTORY \
  SQLITE_DB=$SQLITE_DB \
  PORT=$PORT \
  node "$ROOT/server.js" > "$LOG_FILE" 2>&1 &

echo $! > "$RUN_DIR/app.pid"
echo "[dev] âœ… WattSun DEV running (port $PORT) â€” logs: $LOG_FILE"

# ðŸ©º Health check
sleep 2
code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/health" || true)
echo "[dev] Health check â†’ HTTP ${code}"


## ---- Notifications Worker (background) ----
export WORKER_LOG_OUT="$ROOT/logs/dev/worker.out"
export WORKER_LOG_ERR="$ROOT/logs/dev/worker.err"
export WORKER_PID="$RUN_DIR/worker.pid"

if [ -f "$WORKER_PID" ] && kill -0 "$(cat "$WORKER_PID")" 2>/dev/null; then
  echo "[dev] notifications_worker already running (PID $(cat "$WORKER_PID"))"
else
  echo "[dev] Starting notifications_worker.js..."
  cd "$ROOT"
  nohup env NODE_ENV=$NODE_ENV \
    SQLITE_MAIN=$SQLITE_MAIN \
    DB_PATH_USERS=$DB_PATH_USERS \
    DB_PATH_INVENTORY=$DB_PATH_INVENTORY \
    SQLITE_DB=$SQLITE_DB \
    PORT=$PORT \
    node "$ROOT/scripts/notifications_worker.js" >> "$WORKER_LOG_OUT" 2>> "$WORKER_LOG_ERR" &
  echo $! > "$WORKER_PID"
  echo "[dev] notifications_worker started (PID $(cat "$WORKER_PID")) — logs: $WORKER_LOG_OUT"
fi

