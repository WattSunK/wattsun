#!/bin/bash
# WattSun Environment Sync Verification
# Checks health and DB paths for Dev and QA environments
# Automatically resolves variable references (e.g. ${SQLITE_MAIN})

set -e

GREEN='\033[1;32m'
RED='\033[1;31m'
CYAN='\033[1;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}🔍 WattSun Environment Sync Verification${NC}"
echo "========================================"
date
echo

check_env() {
  local label="$1"
  local envfile="$2"
  local port="$3"

  echo -e "\n🔹 ${YELLOW}${label} Environment${NC}"
  echo "[${label}] Checking port ${port} ..."

  # Load DB path (supports SQLITE_DB or SQLITE_MAIN)
  local db_path
  db_path="$(grep -E '^(SQLITE_DB|SQLITE_MAIN)=' "$envfile" | cut -d'=' -f2 | head -n1 || true)"
  eval "db_path=$db_path"

  # Ping health endpoint
  local status
  status="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}/api/health" || true)"

  if [ "$status" = "200" ]; then
    echo -e "${GREEN}✅ [${label}] Health OK${NC} — DB → ${db_path:-unknown}"
  else
    echo -e "${RED}❌ [${label}] Unreachable${NC} (HTTP ${status})"
  fi
}

# Run checks for both environments
check_env "DEV" ".env" "3001"
check_env "QA"  ".env.qa" "3000"

echo
echo -e "${CYAN}Verification complete.${NC}"
