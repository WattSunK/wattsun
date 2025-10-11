#!/bin/bash
ROOT=$(dirname "$0")/..
cd "$ROOT"

export NODE_ENV=qa
export PORT=3000
export SQLITE_DB=$ROOT/data/qa/wattsun.qa.db
export DB_PATH_USERS=$ROOT/data/qa/wattsun.qa.db
export DB_PATH_INVENTORY=$ROOT/data/qa/inventory.qa.db
export LOG_FILE=$ROOT/logs/qa/app.out

nohup node server.js >"$LOG_FILE" 2>&1 &
echo $! > run/qa/app.pid
echo "[qa] WattSun QA server running on port 3000"
