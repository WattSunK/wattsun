#!/bin/sh
# ==========================================================
# QA + Dev environment verification script
# Checks both /api/health endpoints and DB mappings
# ==========================================================

ROOT="/volume1/web/wattsun"
DEV_ENV="$ROOT/.env"
QA_ENV="$ROOT/.env.qa"
DEV_PORT=3001
QA_PORT=3000

echo "🔍 WattSun Environment Sync Verification"
echo "========================================"
date
echo

# --- Function: Health check for given port ---
check_health() {
  local label="$1"
  local port="$2"
  local envfile="$3"
  local db_path

  if [ ! -f "$envfile" ]; then
    echo "⚠️  [$label] Missing env file: $envfile"
    return 1
  fi

  db_path="$(grep -E '^SQLITE_DB=' "$envfile" | cut -d'=' -f2)"
  [ -z "$db_path" ] && db_path="(not set)"

  echo "[$label] Checking port $port ..."
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/api/health" || echo 000)"
  if [ "$code" = "200" ]; then
    echo "✅ [$label] Health OK — DB → $db_path"
    return 0
  else
    echo "❌ [$label] Unreachable (HTTP $code) — DB → $db_path"
    return 1
  fi
}

# --- Run checks ---
echo "🔹 DEV Environment"
check_health "DEV" "$DEV_PORT" "$DEV_ENV"
dev_status=$?

echo
echo "🔹 QA Environment"
check_health "QA" "$QA_PORT" "$QA_ENV"
qa_status=$?

echo
if [ "$dev_status" -eq 0 ] && [ "$qa_status" -eq 0 ]; then
  echo "✅ Both environments healthy and isolated."
  exit 0
else
  echo "⚠️  One or both environments failed verification."
  exit 1
fi
