# ==========================================
# 🟨 qa_restart_cycle.sh (patched)
# ==========================================
#!/bin/bash
# QA restart cycle script with enforced QA environment


ROOT="/volume1/web/wattsun"


# --- Environment context for QA ---
export NODE_ENV=qa
export DB_PATH_USERS="$ROOT/data/qa/wattsun.qa.db"
export SQLITE_DB="$ROOT/data/qa/wattsun.qa.db"
export DB_PATH_INVENTORY="$ROOT/data/qa/inventory.qa.db"


echo "🧭 QA Environment Context:"
echo "NODE_ENV=$NODE_ENV"
echo "DB_PATH_USERS=$DB_PATH_USERS"
echo "SQLITE_DB=$SQLITE_DB"
echo "------------------------------------------------------------"


cd "$ROOT" || exit 1


echo "==========================================================="
echo "🔁 WattSun QA Restart Cycle"
echo "==========================================================="


# Stop any running instances
sudo pkill -f "node server.js" || true
sleep 2


# Git sync (optional)
if [ -d .git ]; then
echo "🧩 Pulling latest code..."
git fetch --all && git reset --hard origin/main
fi


# Restart QA
sudo bash "$ROOT/scripts/start_qa.sh"


echo "✅ QA environment restarted with NODE_ENV=qa"