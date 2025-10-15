# ==========================================
# 🟩 restart_wattsun.sh (patched)
# ==========================================
#!/bin/bash
# Restart both DEV and QA environments for WattSun


start_instance() {
local NAME="$1"
local PORT="$2"
local ROOT="/volume1/web/wattsun"
local LOG_FILE="$ROOT/logs/${NAME}.log"


echo "==========================================================="
echo "▶️ Launching ${NAME^^} Environment"
echo "PORT=$PORT"
echo "==========================================================="


# --- Environment context per instance ---
export NODE_ENV=$NAME
export DB_PATH_USERS="$ROOT/data/$NAME/wattsun.$NAME.db"
export DB_PATH_INVENTORY="$ROOT/data/$NAME/inventory.$NAME.db"
export SQLITE_DB="$ROOT/data/$NAME/wattsun.$NAME.db"
export SQLITE_MAIN="$ROOT/data/$NAME/wattsun.$NAME.db"



echo "🌐 Environment for ${NAME^^}:"
echo "NODE_ENV=$NODE_ENV"
echo "DB_PATH_USERS=$DB_PATH_USERS"
echo "SQLITE_DB=$SQLITE_DB"
echo "------------------------------------------------------------"


nohup env NODE_ENV=$NODE_ENV \
SQLITE_MAIN=$SQLITE_MAIN \
DB_PATH_USERS=$DB_PATH_USERS \
DB_PATH_INVENTORY=$DB_PATH_INVENTORY \
SQLITE_DB=$SQLITE_DB \
PORT=$PORT \
node server.js > "$LOG_FILE" 2>&1 &


echo $! > "/volume1/web/wattsun/run/${NAME}/app.pid"
sleep 2


if netstat -tlnp 2>/dev/null | grep -q ":$PORT"; then
echo "✅ ${NAME^^} running on port $PORT"
else
echo "❌ Failed to start ${NAME^^} — check $LOG_FILE"
fi
}

echo "♻️ Restarting WattSun DEV and QA environments..."


sudo pkill -f "node server.js" || true
sleep 2


start_instance dev 3001
start_instance qa 3000


echo "♻️ All environments restarted."