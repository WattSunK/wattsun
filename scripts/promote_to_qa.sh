#!/bin/bash
# ============================================================
# 🚀 promote_to_qa.sh — Dev → QA Promotion (Optimized Local Rsync)
# ============================================================
# 1️⃣ Fetch latest origin/main (no branch switching)
# 2️⃣ Incremental local rsync to QA (fast, same-volume optimized)
# 3️⃣ Copy Dev DB → QA DB (/data/qa/)
# 4️⃣ Optionally run loyalty_reset.sh qa (with confirmation)
# 5️⃣ Restart QA backend and verify health
# ============================================================

set -euo pipefail

ROOT="/volume1/web/wattsun"
DEV_DB="$ROOT/data/dev/wattsun.dev.db"
QA_ROOT="$ROOT/qa"
QA_DB="$ROOT/data/qa/wattsun.qa.db"

GREEN='\033[1;32m'
RED='\033[1;31m'
YELLOW='\033[1;33m'
CYAN='\033[1;36m'
NC='\033[0m'

echo -e "${CYAN}============================================================"
echo -e "🚀  WattSun — Promote Dev → QA (Optimized Local Rsync)"
echo -e "============================================================${NC}"

# ============================================================
# 🧩 Step 1 of 6 — Fetch latest main from GitHub
# ============================================================
echo -e "${CYAN}============================================================"
echo -e "🧩 Step 1 of 6 — Fetching latest main branch from GitHub..."
echo -e "============================================================${NC}"
cd "$ROOT" || exit 1

# Safety guard: enforce expected QA path layout
if [[ "$QA_ROOT" != "$ROOT/qa" ]]; then
  echo -e "${RED}QA_ROOT must be $ROOT/qa (got $QA_ROOT). Aborting to avoid recursion.${NC}"
  exit 1
fi

# Optional one-time cleanup: enable with DELETE_EXCLUDED_ONCE=1
DELETE_EXCLUDED_FLAG=""
if [ "${DELETE_EXCLUDED_ONCE:-0}" = "1" ]; then
  DELETE_EXCLUDED_FLAG="--delete-excluded"
  echo -e "${YELLOW}Enabling one-time cleanup with --delete-excluded (DELETE_EXCLUDED_ONCE=1)${NC}"
fi

# Pre-flight summary
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

  # Ensure local working tree matches latest origin/main before rsync
  echo -e "${YELLOW}🔄 Updating local working tree to match origin/main...${NC}"
  sudo -u 53Bret git checkout main
  sudo -u 53Bret git reset --hard origin/main
  echo -e "${GREEN}✅ Local working tree now matches origin/main${NC}"
else
  echo -e "${RED}❌ Git repository not found at $ROOT${NC}"
  exit 1
fi

# ============================================================
# 📦 Step 2 of 6 — Copying files to QA (optimized rsync)
# ============================================================
echo -e "${CYAN}============================================================"
echo -e "📦 Step 2 of 6 — Copying files to QA (optimized rsync)..."
echo -e "============================================================${NC}"

sudo -u 53Bret rsync -a --whole-file --no-compress \
  --delete --delete-delay --omit-dir-times --info=progress2 --prune-empty-dirs ${DELETE_EXCLUDED_FLAG} \
  --exclude='qa/***' \
  --exclude='qa/' \
  --exclude='qa/data/' \
  --exclude='qa/logs/' \
  --exclude='qa/run/' \
  --exclude='qa/scripts/' \
  --exclude='.git/' \
  --exclude='node_modules/' \
  "$ROOT/" "$QA_ROOT/" || {
    echo -e "${RED}❌ Rsync failed (possible broken pipe or disk issue).${NC}"
    exit 1
  }
echo -e "${GREEN}✅ Incremental rsync completed successfully.${NC}"

# ============================================================
# 🗄️ Step 3 of 6 — Copy Dev → QA database
# ============================================================
echo -e "${CYAN}============================================================"
echo -e "🗄️ Step 3 of 6 — Copying Dev → QA database..."
echo -e "============================================================${NC}"

if [ "${SKIP_DB_COPY:-0}" = "1" ]; then
  echo -e "${YELLOW}⚠️  SKIP_DB_COPY=1 → Skipping database replacement.${NC}"
else
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
fi

# ============================================================
# 🧹 Step 4 of 6 — Optional loyalty reset confirmation
# ============================================================
echo -e "${CYAN}============================================================"
echo -e "🧹 Step 4 of 6 — Loyalty reset confirmation..."
echo -e "============================================================${NC}"

if [ ! -x "$ROOT/scripts/loyalty_reset.sh" ]; then
  echo -e "${RED}❌ loyalty_reset.sh not found or not executable.${NC}"
  exit 1
fi

if [ "${AUTO_RESET:-0}" = "1" ]; then
  echo -e "${YELLOW}AUTO_RESET=1 → Running loyalty_reset.sh without confirmation.${NC}"
  DB_OVERRIDE="$QA_DB"
  export DB_OVERRIDE
  sudo --preserve-env=DB_OVERRIDE bash "$ROOT/scripts/loyalty_reset.sh" qa
  echo -e "${GREEN}✅ QA loyalty tables cleaned and reseeded.${NC}"
else
  echo -e "${YELLOW}⚠️  Do you want to run loyalty_reset.sh for QA?${NC}"
  echo -e "${YELLOW}   This will ERASE users, orders, and loyalty data in QA.${NC}"
  read -p "Type 'yes' to confirm reset, or press Enter to skip: " CONFIRM_RESET

  if [[ "$CONFIRM_RESET" =~ ^[Yy][Ee][Ss]$ ]]; then
    echo -e "${YELLOW}🧹 Running loyalty_reset.sh qa (targeting QA DB)...${NC}"
    DB_OVERRIDE="$QA_DB"
    export DB_OVERRIDE
    sudo --preserve-env=DB_OVERRIDE bash "$ROOT/scripts/loyalty_reset.sh" qa
    echo -e "${GREEN}✅ QA loyalty tables cleaned and reseeded.${NC}"
  else
    echo -e "${CYAN}➡️  Skipping loyalty_reset.sh (QA data preserved).${NC}"
  fi
fi

# ============================================================
# 🚀 Step 5 of 6 — Restart QA backend
# ============================================================
echo -e "${CYAN}============================================================"
echo -e "🚀 Step 5 of 6 — Restarting QA backend..."
echo -e "============================================================${NC}"

export NODE_ENV=qa
export DB_PATH_USERS="$QA_DB"
export SQLITE_DB="$QA_DB"
export DB_PATH_INVENTORY="$ROOT/data/qa/inventory.qa.db"
export SQLITE_MAIN="$QA_DB"
sudo bash "$ROOT/scripts/stop_qa.sh" || true
sudo bash "$ROOT/scripts/start_qa.sh"
sleep 5

# ============================================================
# 🔍 Step 6 of 6 — Verify QA health
# ============================================================
echo -e "${CYAN}============================================================"
echo -e "🔍 Step 6 of 6 — Verifying QA backend health..."
echo -e "============================================================${NC}"

QA_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/health || true)
if ! USERS_TABLE_METADATA=$(sqlite3 "$QA_DB" "SELECT 1 FROM sqlite_master WHERE type='table' AND name='users' LIMIT 1;" 2>/dev/null); then
  echo -e "${RED}Failed to inspect users table metadata in QA database.${NC}"
  exit 1
fi

if [ -n "$USERS_TABLE_METADATA" ]; then
  QA_USERS=$(sqlite3 "$QA_DB" "SELECT COUNT(*) FROM users;")
else
  QA_USERS="missing"
fi

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
