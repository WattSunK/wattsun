#!/bin/bash
# ===========================================
# 🟨 WattSun QA Environment Startup
# ===========================================

export NODE_ENV=qa
export PORT=3000

ROOT="/volume1/web/wattsun"
export SQLITE_DB="$ROOT/data/qa/wattsun.qa.db"
export DB_PATH_USERS="$ROOT/data/qa/wattsun.qa.db"
export DB_PATH_INVENTORY="$ROOT/data/qa/inventory.qa.db"
export LOG_FILE="$ROOT/logs/qa/app.out"

cd "$ROOT" || {
  echo "❌ Failed to enter $ROOT"
  exit 1
}

mkdir -p "$ROOT/logs/qa" "$ROOT/run/qa"

echo "[qa] Starting WattSun QA server on port $PORT ..."
nohup node server.js > "$LOG_FILE" 2>&1 &
echo $! > "$ROOT/run/qa/app.pid"
echo "[qa] WattSun QA server running on port $PORT"
