#!/bin/bash
# ============================================================
# 🧹 Loyalty Reset Script — Full Clean + Seed One Test Account
# Location: /volume1/web/wattsun/scripts/loyalty_reset.sh
# ============================================================

set -e
DB="/volume1/web/wattsun/data/dev/wattsun.dev.db"
USER_EMAIL="wattsun1@gmail.com"

echo "============================"
echo "🧹 START: Loyalty Reset Script"
echo "============================"

# ------------------------------------------------------------
# 0️⃣  Clear all queued notifications before reset
# ------------------------------------------------------------
sqlite3 "$DB" <<'SQL'
DELETE FROM notifications_queue WHERE status='Queued';
DELETE FROM sqlite_sequence WHERE name='notifications_queue';
SQL
echo "🧹 Cleared all queued notifications."

# ------------------------------------------------------------
# 1️⃣  Clear loyalty tables
# ------------------------------------------------------------
sqlite3 "$DB" <<'SQL'
DELETE FROM loyalty_ledger;
DELETE FROM loyalty_accounts;
DELETE FROM loyalty_withdrawal_meta;
DELETE FROM sqlite_sequence WHERE name IN (
  'loyalty_ledger',
  'loyalty_accounts',
  'loyalty_withdrawal_meta'
);
SQL
echo "✅ Loyalty tables cleared."

# ------------------------------------------------------------
# 2️⃣  Create or reuse test user
# ------------------------------------------------------------
USER_ID=$(sqlite3 "$DB" "SELECT id FROM users WHERE email='$USER_EMAIL' LIMIT 1;")

if [ -z "$USER_ID" ]; then
  echo "⚙️  Seeding user $USER_EMAIL ..."
  sqlite3 "$DB" <<SQL
  INSERT INTO users (name, email, phone, type, status, password_hash, created_at)
  VALUES ('Wattsun Loyalty Tester', '$USER_EMAIL', '+254700000001', 'Customer', 'Active', '', datetime('now','localtime'));
SQL
  USER_ID=$(sqlite3 "$DB" "SELECT id FROM users WHERE email='$USER_EMAIL' LIMIT 1;")
  echo "✅ Created user ID: $USER_ID"
else
  echo "ℹ️  Reusing existing user ID: $USER_ID"
fi

# ------------------------------------------------------------
# 3️⃣  Seed loyalty account (program_id = 1)
# ------------------------------------------------------------
echo "⚙️  Creating sample loyalty account for $USER_EMAIL ..."
sqlite3 "$DB" <<SQL
INSERT INTO loyalty_accounts (
  program_id,
  user_id,
  status,
  start_date,
  end_date,
  eligible_from,
  points_balance,
  total_earned,
  total_penalty,
  total_paid,
  created_at,
  updated_at,
  duration_months
) VALUES (
  1,
  $USER_ID,
  'Active',
  date('now'),
  date('now', '+12 months'),
  date('now'),
  1000,
  1000,
  0,
  0,
  datetime('now','localtime'),
  datetime('now','localtime'),
  12
);
SQL
echo "✅ Seeded loyalty account for user ID: $USER_ID"

# ------------------------------------------------------------
# ✅ Done
# ------------------------------------------------------------
echo "🏁 END OF RESET – One seeded account ready for testing."
echo "============================"
