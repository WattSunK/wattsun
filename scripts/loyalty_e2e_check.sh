#!/bin/bash
# loyalty_e2e_check.sh — Automated E2E validation for Loyalty module
# Usage: bash scripts/loyalty_e2e_check.sh

set -euo pipefail

DB="/volume1/web/wattsun/data/dev/wattsun.dev.db"
API="http://127.0.0.1:3001"

echo "=== Loyalty E2E Validation Test ==="
date

echo "1) Checking foreign key & trigger setup..."
sqlite3 "$DB" "PRAGMA foreign_keys;"
sqlite3 "$DB" "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_loyalty%';"

echo "2) Creating E2E test user via signup..."
# Load password from env for E2E user (Dev env file)
if [ -f "/volume1/web/wattsun/.env" ]; then
  set -a; . "/volume1/web/wattsun/.env"; set +a
fi
E2E_PASS="${E2E_PASSWORD:-${SANITY_PASSWORD:-${ADMIN_BOOTSTRAP_PASSWORD:-}}}"
if [ -z "$E2E_PASS" ]; then
  echo "ERROR: Set E2E_PASSWORD or SANITY_PASSWORD in /volume1/web/wattsun/.env" >&2
  exit 1
fi

curl -s -X POST "$API/api/signup" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"E2EUser\",\"email\":\"e2euser@example.com\",\"phone\":\"+254711000888\",\"password\":\"$E2E_PASS\"}" | jq .

USER_ID=$(sqlite3 "$DB" "SELECT id FROM users WHERE email='e2euser@example.com';")

echo "3) Verifying loyalty account auto-creation..."
sqlite3 "$DB" "SELECT id,user_id,status FROM loyalty_accounts WHERE user_id=$USER_ID;"

echo "4) Soft deleting user (simulated)..."
sqlite3 "$DB" "UPDATE users SET status='Deleted' WHERE id=$USER_ID;"
sleep 1
sqlite3 "$DB" "SELECT id,user_id,status FROM loyalty_accounts WHERE user_id=$USER_ID;"

echo "5) Reactivating user..."
sqlite3 "$DB" "UPDATE users SET status='Active' WHERE id=$USER_ID;"
sleep 1
sqlite3 "$DB" "SELECT id,user_id,status FROM loyalty_accounts WHERE user_id=$USER_ID;"

echo "6) Hard deleting user (cascade test)..."
sqlite3 "$DB" "DELETE FROM users WHERE id=$USER_ID;"
sleep 1
sqlite3 "$DB" "SELECT * FROM loyalty_accounts WHERE user_id=$USER_ID;"

echo "7) Ledger trigger test (insert/delete)..."
ACC_ID=$(sqlite3 "$DB" "SELECT id FROM loyalty_accounts LIMIT 1;")
sqlite3 "$DB" "INSERT INTO loyalty_ledger (account_id,kind,points_delta) VALUES ($ACC_ID,'bonus',100);"
sqlite3 "$DB" "DELETE FROM loyalty_ledger WHERE account_id=$ACC_ID AND kind='bonus';"

echo "8) View integrity check..."
sqlite3 "$DB" "SELECT id,user_id,email,status FROM v_loyalty_account_progress LIMIT 10;"

echo "Cleaning test data..."
sqlite3 "$DB" "DELETE FROM users WHERE email='e2euser@example.com';"
sqlite3 "$DB" "DELETE FROM loyalty_accounts WHERE user_id NOT IN (SELECT id FROM users);"

echo "Done. Loyalty E2E validation complete."

