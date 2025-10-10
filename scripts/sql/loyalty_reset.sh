#!/bin/bash
# ================================================================
#  Script: loyalty_reset.sh
#  Purpose: Reset all loyalty data and seed one sample account
#  Location: /volume1/web/wattsun/scripts/loyalty_reset.sh
#  Author: WattSun DevOps
#  Version: 2025-10-10
# ================================================================

set -e

DB="/volume1/web/wattsun/data/dev/wattsun.dev.db"

echo "============================"
echo "🧹 START: Loyalty Reset Script"
echo "============================"

# ------------------------------------------------------------
# 1️⃣  Clear loyalty and notification data
# ------------------------------------------------------------
sqlite3 "$DB" <<'SQL'
DELETE FROM loyalty_ledger;
DELETE FROM loyalty_accounts;
DELETE FROM notifications_queue
WHERE kind IN ('loyalty', 'penalty', 'withdrawal', 'bonus');
DELETE FROM sqlite_sequence
WHERE name IN ('loyalty_ledger','loyalty_accounts','notifications_queue');
SQL

echo "✅ Loyalty and notifications tables cleared."

# ------------------------------------------------------------
# 2️⃣  Seed one sample user + account
# ------------------------------------------------------------
# This assumes the users table exists and uses id, name, email, phone, etc.
# If the user already exists, we reuse it; otherwise, we create it.

USER_EMAIL="wattsu1@gmail.com"
USER_ID=$(sqlite3 "$DB" "SELECT id FROM users WHERE email='$USER_EMAIL' LIMIT 1;")

if [ -z "$USER_ID" ]; then
  echo "⚙️  Seeding user $USER_EMAIL ..."
  sqlite3 "$DB" <<SQL
  INSERT INTO users (name, email, phone, type, role, status, created_at)
  VALUES ('Wattsun Loyalty Tester', '$USER_EMAIL', '+254700000001', 'Customer', 'Customer', 'Active', datetime('now','localtime'));
SQL
  USER_ID=$(sqlite3 "$DB" "SELECT id FROM users WHERE email='$USER_EMAIL' LIMIT 1;")
  echo "✅ Created user ID: $USER_ID"
else
  echo "ℹ️  Reusing existing user ID: $USER_ID"
fi

# ------------------------------------------------------------
# 3️⃣  Create one loyalty account with initial balance
# ------------------------------------------------------------
echo "⚙️  Creating sample loyalty account for $USER_EMAIL ..."
sqlite3 "$DB" <<SQL
INSERT INTO loyalty_accounts (
  program_id, user_id, status, start_date, end_date, eligible_from,
  points_balance, total_earned, total_penalty, total_paid,
  created_at, updated_at, duration_months
)
VALUES (
  1, $USER_ID, 'Active',
  date('now'), date('now','+12 months'), date('now'),
  1000, 1000, 0, 0,
  datetime('now','localtime'), datetime('now','localtime'), 12
);
SQL

echo "✅ Seeded loyalty account for user ID: $USER_ID"

# ------------------------------------------------------------
# 4️⃣  Verification summary
# ------------------------------------------------------------
sqlite3 "$DB" <<'SQL'
.headers on
.mode column
SELECT id, user_id, points_balance, total_earned, status, created_at
FROM loyalty_accounts
ORDER BY id DESC LIMIT 3;
SQL

echo "============================"
echo "🏁 END OF RESET – One seeded account ready for testing."
echo "============================"
