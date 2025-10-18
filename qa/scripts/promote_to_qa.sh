#!/bin/bash
# ============================================================
# 🚀 promote_to_qa.sh — Full Dev → QA Promotion Cycle
# ------------------------------------------------------------
# 1️⃣ Sync latest code from GitHub main
# 2️⃣ Copy Dev DB → QA DB
# 3️⃣ Run loyalty_reset.sh qa (cleanup + reseed)
# 4️⃣ Restart QA backend and verify health
# ============================================================

set -e
# ----------------------------------------------------------------------
# 🧩 SAFEGUARD: verify source vs target database versions before overwrite
# ----------------------------------------------------------------------
check_db_safety() {
  local SRC="$1"
  local DST="$2"
  local src_ver dst_ver src_date dst_date

  if [ ! -f "$SRC" ]; then
    echo "❌ Source DB not found: $SRC"
    exit 1
  fi
  if [ ! -f "$DST" ]; then
    echo "⚠️ Target DB does not exist yet: $DST (first-time copy allowed)"
    return 0
  fi

  src_ver=$(sqlite3 "$SRC" "PRAGMA user_version;" 2>/dev/null || echo 0)
  dst_ver=$(sqlite3 "$DST" "PRAGMA user_version;" 2>/dev/null || echo 0)
  src_date=$(stat -c %y "$SRC" 2>/dev/null | cut -d'.' -f1)
  dst_date=$(stat -c %y "$DST" 2>/dev/null | cut -d'.' -f1)

  echo "🔍 Source: $SRC (user_version=$src_ver, modified=$src_date)"
  echo "🔍 Target: $DST (user_version=$dst_ver, modified=$dst_date)"

  if [ "$src_ver" -lt "$dst_ver" ]; then
    echo "❌ Aborting: source DB user_version ($src_ver) is older than target ($dst_ver)."
    exit 1
  fi
}


ROOT="/volume1/web/wattsun"
DEV_DB="$ROOT/data/dev/wattsun.dev.db"
QA_DB="$ROOT/data/qa/wattsun.qa.db"

GREEN='\033[1;32m'
RED='\033[1;31m'
YELLOW='\033[1;33m'
CYAN='\033[1;36m'
NC='\033[0m'

echo -e "${CYAN}============================================================"
echo -e "🚀  WattSun — Promote Dev → QA"
echo -e "============================================================${NC}"

# --- Step 1️⃣: Git Sync ---
echo -e "${YELLOW}🧩 Pulling latest code from GitHub main...${NC}"
cd "$ROOT" || exit 1
if [ -d .git ]; then
  sudo -u 53Bret git fetch --all
  sudo -u 53Bret git reset --hard origin/main
  CURRENT_SHA=$(git rev-parse --short HEAD)
  echo -e "${GREEN}✅ Code synced to commit: ${CURRENT_SHA}${NC}"
else
  echo -e "${RED}❌ Git repository not found at $ROOT${NC}"
  exit 1
fi

# --- Step 2️⃣: Copy Dev → QA database ---
echo -e "${YELLOW}📦 Copying DEV → QA database ...${NC}"
if [ ! -f "$DEV_DB" ]; then
  echo -e "${RED}❌ DEV DB not found at $DEV_DB${NC}"
  exit 1
fi
if [ ! -f "$QA_DB" ]; then
  echo -e "${YELLOW}⚠️  QA DB not found — it will be created fresh.${NC}"
else
  # 🧩 Backup QA DB before overwrite
  BACKUP_FILE="${QA_DB}.bak_$(date +%F_%H-%M-%S)"
  echo -e "${YELLOW}🗄️  Creating backup: ${BACKUP_FILE}${NC}"
  sudo cp "$QA_DB" "$BACKUP_FILE"
  sudo chown 53Bret:users "$BACKUP_FILE"
fi

# 🧩 Safeguard: ensure source DB is not older than target
check_db_safety "$DEV_DB" "$QA_DB"

# ✅ Safe copy after checks
sudo cp "$DEV_DB" "$QA_DB"
sudo chown 53Bret:users "$QA_DB"
sudo chmod 664 "$QA_DB"
echo -e "${GREEN}✅ QA database replaced from DEV baseline.${NC}"


# --- Step 3️⃣: Run loyalty reset for QA ---
if [ ! -x "$ROOT/scripts/loyalty_reset.sh" ]; then
  echo -e "${RED}❌ loyalty_reset.sh not found or not executable.${NC}"
  exit 1
fi
echo -e "${YELLOW}🧹 Running loyalty_reset.sh qa ...${NC}"
sudo --preserve-env=DB,admin_id bash "$ROOT/scripts/loyalty_reset.sh" qa <<<'y'
echo -e "${GREEN}✅ QA loyalty tables cleaned and reseeded.${NC}"

# --- Step 4️⃣: Restart QA backend ---
echo -e "${YELLOW}🚀 Restarting QA backend ...${NC}"
export NODE_ENV=qa
export DB_PATH_USERS="$QA_DB"
export SQLITE_DB="$QA_DB"
export DB_PATH_INVENTORY="$ROOT/data/qa/inventory.qa.db"

export SQLITE_MAIN="$QA_DB"
sudo bash "$ROOT/scripts/start_qa.sh"
sleep 5

# --- Step 5️⃣: Verify Health ---
echo -e "${YELLOW}🔍 Checking QA API health...${NC}"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/health || true)
if [ "$STATUS" = "200" ]; then
  echo -e "${GREEN}✅ QA /api/health OK — environment live.${NC}"
else
  echo -e "${RED}❌ QA health check failed (HTTP ${STATUS}).${NC}"
  exit 1
fi

# --- Optional: Cross-verify both environments ---
if [ -x "$ROOT/scripts/qa_sync_verify.sh" ]; then
  echo -e "${CYAN}🔁 Running qa_sync_verify.sh for double-check...${NC}"
  sudo bash "$ROOT/scripts/qa_sync_verify.sh"
fi

echo -e "${GREEN}============================================================"
echo -e "🎯 Dev → QA Promotion complete."
echo -e "Commit: ${CURRENT_SHA}"
echo -e "QA DB:  $QA_DB"
echo -e "============================================================${NC}"
