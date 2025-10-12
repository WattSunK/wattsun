#!/bin/bash
# ===========================================
# 🟩 WattSun Dev Environment Startup (NAS)
# ===========================================

export NODE_ENV=development
export PORT=3001

# Paths
export SQLITE_DB=./data/dev/wattsun.dev.db
export DB_PATH_USERS=./data/dev/wattsun.dev.db
export DB_PATH_INVENTORY=./data/dev/inventory.dev.db
export LOG_FILE=./logs/dev/app.out

mkdir -p logs/dev run/dev

echo "[dev] Starting WattSun Dev server on port $PORT ..."
nohup node server.js > $LOG_FILE 2>&1 &
echo $! > run/dev/app.pid
echo "[dev] WattSun Dev server running on port $PORT"
