#!/bin/bash
# ============================================================
# 🔄 WattSun Loyalty Reset Utility
# ------------------------------------------------------------
# Resets user, order, dispatch, and loyalty data for QA or DEV
# ============================================================

set -e

# 1️⃣ Detect environment
ENV="${1:-qa}"
case "$ENV" in
  qa|QA)
    DB="/volume1/web/wattsun/data/qa/wattsun.qa.db"
    ;;
  dev|DEV)
    DB="/volume1/web/wattsun/data/dev/wattsun.dev.db"
    ;;
  *)
    echo "❌ Invalid environment. Use: qa or dev"
    exit 1
    ;;
esac

echo "============================================================"
echo "🧩 WattSun Loyalty Reset Utility"
echo "Target environment: ${ENV^^}"
echo "Database: $DB"
echo "============================================================"

# 2️⃣ Check DB existence
if [ ! -f "$DB" ]; then
  echo "⚠️  Database not found at $DB — creating new empty file."
  sqlite3 "$DB" "VACUUM;"
fi

# 3️⃣ Clean up data
echo "🧹 Cleaning tables..."
sqlite3 "$DB" <<'SQL'
DELETE FROM notifications_queue;
DELETE FROM loyalty_ledger;
DELETE FROM loyalty_accounts;
DELETE FROM loyalty_withdrawal_meta;
DELETE FROM orders;
DELETE FROM dispatches;
DELETE FROM users WHERE email LIKE 'wattsun%@gmail.com';
SQL
echo "✅ Data cleanup complete."

# 4️⃣ Create / update test user
echo "👤 Creating test user wattsun1@gmail.com ..."
HASH='$2b$10$fkDIkORHuXSjY27fd4WPE.0PJbeVvybjXxo2UKA362ZAh.ojodetS'  # Pass123 bcrypt hash

sqlite3 "$DB" <<SQL
INSERT INTO users (name, email, phone, type, role, status, password_hash)
VALUES ('WattSun QA Admin', 'wattsun1@gmail.com', '+254722761215', 'Admin', 'Admin', 'Active', '$HASH')
ON CONFLICT(email) DO UPDATE SET password_hash='$HASH', status='Active';
SQL
echo "✅ Test user ready (email: wattsun1@gmail.com / password: Pass123)"

# 5️⃣ Create loyalty account
echo "💎 Seeding loyalty account with 1000 points ..."
sqlite3 "$DB" <<'SQL'
INSERT INTO loyalty_accounts (user_id, program_id, status, start_date, end_date, eligible_from, points_balance, total_earned)
SELECT id, 1, 'Active', date('now'), date('now','+12 months'), date('now'), 1000, 1000
FROM users WHERE email='wattsun1@gmail.com';
INSERT INTO loyalty_ledger (account_id, kind, points_delta, note, created_at)
SELECT id, 'seed', 1000, 'Initial seed for QA testing', datetime('now')
FROM loyalty_accounts WHERE user_id=(SELECT id FROM users WHERE email='wattsun1@gmail.com');
SQL
echo "✅ Loyalty account seeded (1000 points)."

# 6️⃣ Completion summary
echo "============================================================"
echo "🏁 QA/DEV Loyalty Reset Complete"
sqlite3 "$DB" "SELECT id, email, phone, status FROM users WHERE email='wattsun1@gmail.com';"
sqlite3 "$DB" "SELECT id, points_balance, total_earned FROM loyalty_accounts;"
echo "============================================================"
