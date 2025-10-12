#!/bin/bash
# ===========================================
# 🟦 WattSun QA Environment Startup
# ===========================================

export NODE_ENV=qa
export PORT=3000

export SQLITE_DB=./data/qa/wattsun.qa.db
export DB_PATH_USERS=./data/qa/wattsun.qa.db
export DB_PATH_INVENTORY=./data/qa/inventory.qa.db
export LOG_FILE=./logs/qa/app.out

mkdir -p logs/qa run/qa

echo "[qa] Starting WattSun QA server on port $PORT ..."
nohup node server.js > $LOG_FILE 2>&1 &
echo $! > run/qa/app.pid
echo "[qa] WattSun QA server running on port $PORT"
