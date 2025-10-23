#!/bin/bash
# ============================================================
# 🚀 promote_to_qa.sh — Dev → QA Promotion (Optimized Local Rsync)
# ============================================================
# 1️⃣ Fetch latest origin/main (no branch switching)
# 2️⃣ Incremental local rsync to QA (fast, same-volume optimized)
# 3️⃣ Copy Dev DB → QA DB (/qa/data/)
# 4️⃣ Run loyalty_reset.sh qa (cleanup + reseed)
# 5️⃣ Restart QA backend and verify health
# ============================================================

set -e

ROOT="/volume1/web/wattsun"
DEV_DB="$ROOT/data/dev/wattsun.dev.db"
QA_ROOT="$ROOT/qa"
QA_DB="$QA_ROOT/data/qa/wattsun.qa.db"

GREEN='\033[1;32m'
RED='\033[1;31m'
YELLOW='\033[1;33m'
CYAN='\033[1;36m'
NC='\033[0m'

echo -e "${CYAN}============================================================"
echo -e "🚀  WattSun — Promote Dev → QA (Optimized Local Rsync)"
echo -e "============================================================${NC}"

# --- Step 1️⃣: Fetch latest main ---
echo -e "${YELLOW}🧩 Fetching latest main from GitHub...${NC}"
cd "$ROOT" || exit 1

# Pre-flight: Git SHA + clean status + health ping (non-fatal)
LOCAL_SHA=$(sudo -u 53Bret git rev-parse HEAD 2>/dev/null | cut -c1-7 || true)
GIT_STATUS=$(sudo -u 53Bret git status --porcelain 2>/dev/null || true)
if [ -z "$GIT_STATUS" ]; then
  CLEAN_STATUS="CLEAN"
else
  CHANGES=$(printf "%s" "$GIT_STATUS" | wc -l | tr -d '[:space:]')
  CLEAN_STATUS="DIRTY (${CHANGES} changes)"
fi
PRE_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/health || true)
echo -e "${CYAN}Pre-flight summary:${NC}"
echo -e " - Local HEAD: ${LOCAL_SHA:-unknown}"
echo -e " - Working tree: ${CLEAN_STATUS}"
echo -e " - QA health (pre): HTTP ${PRE_HEALTH}"
if [ -d .git ]; then
  sudo -u 53Bret git fetch origin main
  CURRENT_SHA=$(sudo -u 53Bret git rev-parse origin/main | cut -c1-7)
  echo -e "${GREEN}✅ Latest origin/main = ${CURRENT_SHA}${NC}"
else
  echo -e "${RED}❌ Git repository not found at $ROOT${NC}"
  exit 1
fi

# --- Step 2️⃣: Optimized local rsync (no compression, no socket IO) ---
echo -e "${YELLOW}📦 Syncing origin/main → QA folder (optimized)...${NC}"
sudo rsync -a --whole-file --no-compress \
  --delete --delete-delay --omit-dir-times --info=progress2 \
  --exclude='qa/data/' \
  --exclude='qa/logs/' \
  --exclude='qa/run/' \
  --exclude='qa/scripts/' \
  --exclude='/qa/***' \
  --exclude='.git/' \
  --exclude='node_modules/' \
  "$ROOT/" "$QA_ROOT/" || {
    echo -e "${RED}❌ Rsync failed (possible broken pipe or disk issue).${NC}"
    exit 1
  }
echo -e "${GREEN}✅ Incremental rsync completed successfully.${NC}"

# --- Step 3️⃣: Copy Dev → QA database ---
echo -e "${YELLOW}📦 Copying DEV → QA database ...${NC}"
if [ ! -f "$DEV_DB" ]; then
  echo -e "${RED}❌ DEV DB not found at $DEV_DB${NC}"
  exit 1
fi

mkdir -p "$(dirname "$QA_DB")"
if [ -f "$QA_DB" ]; then
  BACKUP_FILE="${QA_DB}.bak_$(date +%F_%H-%M-%S)"
  echo -e "${YELLOW}🗄️  Creating QA backup: ${BACKUP_FILE}${NC}"
  sudo cp "$QA_DB" "$BACKUP_FILE"
  sudo chown 53Bret:users "$BACKUP_FILE"
fi

sudo cp "$DEV_DB" "$QA_DB"
sudo chown 53Bret:users "$QA_DB"
sudo chmod 664 "$QA_DB"
echo -e "${GREEN}✅ QA database replaced from DEV baseline.${NC}"

# --- Step 4️⃣: Run loyalty reset for QA (new DB path) ---
if [ ! -x "$ROOT/scripts/loyalty_reset.sh" ]; then
  echo -e "${RED}❌ loyalty_reset.sh not found or not executable.${NC}"
  exit 1
fi
echo -e "${YELLOW}🧹 Running loyalty_reset.sh qa (targeting new QA DB)...${NC}"
DB_OVERRIDE="$QA_DB"
export DB_OVERRIDE
sudo --preserve-env=DB_OVERRIDE bash "$ROOT/scripts/loyalty_reset.sh" qa <<<'y'
echo -e "${GREEN}✅ QA loyalty tables cleaned and reseeded.${NC}"

# --- Step 5️⃣: Restart QA backend ---
echo -e "${YELLOW}🚀 Restarting QA backend ...${NC}"
export NODE_ENV=qa
export DB_PATH_USERS="$QA_DB"
export SQLITE_DB="$QA_DB"
export DB_PATH_INVENTORY="$QA_ROOT/data/qa/inventory.qa.db"
export SQLITE_MAIN="$QA_DB"
sudo bash "$ROOT/scripts/stop_qa.sh" || true
sudo bash "$ROOT/scripts/start_qa.sh"
sleep 5

# --- Step 6️⃣: Verify Health + DB Sync ---
echo -e "${YELLOW}🔍 Running post-promotion health and DB sync check...${NC}"
QA_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/health || true)
QA_USERS=$(sqlite3 "$QA_DB" "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "?")

if [ "$QA_HEALTH" = "200" ]; then
  echo -e "${GREEN}✅ QA backend /api/health OK${NC}"
else
  echo -e "${RED}❌ QA health check failed (HTTP $QA_HEALTH).${NC}"
fi

echo -e "${CYAN}📊 QA user table count: ${QA_USERS}${NC}"

echo -e "${GREEN}============================================================"
echo -e "🎯 Dev → QA Promotion complete."
echo -e "Commit (main): ${CURRENT_SHA}"
echo -e "QA DB:  $QA_DB"
echo -e "============================================================${NC}"
