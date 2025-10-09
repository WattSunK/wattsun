#!/bin/bash
# loyalty_e2e_check.sh — Automated E2E validation for Loyalty module
# Usage: bash scripts/loyalty_e2e_check.sh

DB="/volume1/web/wattsun/data/dev/wattsun.dev.db"
API="http://127.0.0.1:3001"

echo "=== 🧩 Loyalty E2E Validation Test ==="
date

echo "1️⃣ Checking foreign key & trigger setup..."
sqlite3 $DB "PRAGMA foreign_keys;"

sqlite3 $DB "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_loyalty%';"

echo "2️⃣ Creating E2E test user via signup..."
curl -s -X POST $API/api/signup   -H "Content-Type: application/json"   -d '{"name":"E2EUser","email":"e2euser@example.com","phone":"+254711000888","password":"Pass123"}' | jq .

USER_ID=$(sqlite3 $DB "SELECT id FROM users WHERE email='e2euser@example.com';")

echo "3️⃣ Verifying loyalty account auto-creation..."
sqlite3 $DB "SELECT id,user_id,status FROM loyalty_accounts WHERE user_id=$USER_ID;"

echo "4️⃣ Soft deleting user (simulated)..."
sqlite3 $DB "UPDATE users SET status='Deleted' WHERE id=$USER_ID;"
sleep 1
sqlite3 $DB "SELECT id,user_id,status FROM loyalty_accounts WHERE user_id=$USER_ID;"

echo "5️⃣ Reactivating user..."
sqlite3 $DB "UPDATE users SET status='Active' WHERE id=$USER_ID;"
sleep 1
sqlite3 $DB "SELECT id,user_id,status FROM loyalty_accounts WHERE user_id=$USER_ID;"

echo "6️⃣ Hard deleting user (cascade test)..."
sqlite3 $DB "DELETE FROM users WHERE id=$USER_ID;"
sleep 1
sqlite3 $DB "SELECT * FROM loyalty_accounts WHERE user_id=$USER_ID;"

echo "7️⃣ Ledger trigger test (insert/delete)..."
ACC_ID=$(sqlite3 $DB "SELECT id FROM loyalty_accounts LIMIT 1;")
sqlite3 $DB "INSERT INTO loyalty_ledger (account_id,kind,points) VALUES ($ACC_ID,'bonus',100);"
sqlite3 $DB "DELETE FROM loyalty_ledger WHERE account_id=$ACC_ID AND kind='bonus';"

echo "8️⃣ View integrity check..."
sqlite3 $DB "SELECT id,user_id,email,status FROM v_loyalty_account_progress LIMIT 10;"

echo "🧹 Cleaning test data..."
sqlite3 $DB "DELETE FROM users WHERE email='e2euser@example.com';"
sqlite3 $DB "DELETE FROM loyalty_accounts WHERE user_id NOT IN (SELECT id FROM users);"

echo "✅ Loyalty E2E validation complete."
