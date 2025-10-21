#!/bin/bash
# ============================================================
# ⚡ promote_to_qa.sh — Optimized Dev → QA Promotion (Fast Local Rsync)
# ============================================================
# 1️⃣ Fetch latest origin/main
# 2️⃣ Incrementally sync code into QA environment (rsync local mode)
# 3️⃣ Copy DEV DB → QA DB
# 4️⃣ Run loyalty_reset.sh qa
# 5️⃣ Restart QA backend + verify health
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
echo -e "🚀  WattSun — Promote Dev → QA (Fast Incremental Rsync)"
echo -e "============================================================${NC}"

# --- Step 1️⃣: Fetch latest main ---
echo -e "${YELLOW}🧩 Fetching latest main from GitHub...${NC}"
cd "$ROOT" || exit 1
if [ -d .git ]; then
  sudo -u 53Bret git fetch origin main
  CURRENT_SHA=$(sudo -u 53Bret git rev-parse origin/main | cut -c1-7)
  echo -e "${GREEN}✅ Latest origin/main = ${CURRENT_SHA}${NC}"
else
  echo -e "${RED}❌ Git repository not found at $ROOT${NC}"
  exit 1
fi

# --- Step 2️⃣: Incremental Rsync (local, safe mode) ---
echo -e "${YELLOW}📦 Syncing origin/main → QA folder (incremental)...${NC}"
mkdir -p "$QA_ROOT"

RSYNC_CMD="sudo rsync -aHAX --inplace --partial --size-only --no-whole-file \
  --info=progress2 --delete \
  --exclude='qa/data/' \
  --exclude='qa/logs/' \
  --exclude='qa/run/' \
  --exclude='qa/scripts/' \
  --exclude='.git/' \
  --exclude='node_modules/' \
  \"$ROOT/\" \"$QA_ROOT/\""

echo -e "${CYAN}Running: $RSYNC_CMD${NC}"
eval $RSYNC_CMD || {
  echo -e "${YELLOW}⚠️ Rsync exited abnormally — retrying once...${NC}"
  sleep 3
  eval $RSYNC_CMD || { echo -e "${RED}❌ Rsync failed after retry. Aborting.${NC}"; exit 1; }
}

sudo chown -R 53Bret:users "$QA_ROOT"
sudo chmod -R u+rw "$QA_ROOT"
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

# --- Step 4️⃣: Run loyalty reset for QA ---
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
echo -e "${YELLOW}🚀 Restarting QA backend from $QA_ROOT ...${NC}"
export NODE_ENV=qa
export DB_PATH_USERS="$QA_DB"
export SQLITE_DB="$QA_DB"
export DB_PATH_INVENTORY="$QA_ROOT/data/qa/inventory.qa.db"
export SQLITE_MAIN="$QA_DB"

sudo bash "$QA_ROOT/scripts/stop_qa.sh" || true
sudo bash "$QA_ROOT/scripts/start_qa.sh"
sleep 5

# --- Step 6️⃣: Verify Health ---
echo -e "${YELLOW}🔍 Checking QA API health...${NC}"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/health || true)
if [ "$STATUS" = "200" ]; then
  echo -e "${GREEN}✅ QA /api/health OK — environment live.${NC}"
else
  echo -e "${RED}❌ QA health check failed (HTTP ${STATUS}).${NC}"
  exit 1
fi

echo -e "${GREEN}============================================================"
echo -e "🎯 Dev → QA Promotion complete."
echo -e "Commit (main): ${CURRENT_SHA}"
echo -e "QA DB:  $QA_DB"
echo -e "============================================================${NC}"

sudo bash "$ROOT/scripts/verify_qa_auth.sh"
