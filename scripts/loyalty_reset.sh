#!/bin/bash
set -e

# ============================================================
# 🧩 WattSun Loyalty Reset Utility (Data-Only, Final)
# ------------------------------------------------------------
# Cleans data in key tables (users, orders, dispatches,
# loyalty, notifications) and reseeds one Admin user with a
# 1000-point loyalty account.
# ============================================================

ENV="${1:-qa}"

case "$ENV" in
  qa|QA)
    DB="/volume1/web/wattsun/data/qa/wattsun.qa.db"
    ;;
  dev|DEV)
    DB="/volume1/web/wattsun/data/dev/wattsun.dev.db"
    ;;
  *)
    echo "Usage: $0 [dev|qa]"
    exit 1
    ;;
esac

echo "============================================================"
echo "🧩 WattSun Loyalty Reset Utility (Data-Only, Final)"
echo "Target environment: ${ENV^^}"
echo "Database: $DB"
echo "============================================================"

# 1️⃣ Verify database exists
if [ ! -f "$DB" ]; then
  echo "❌ Database not found at $DB"
  echo "Aborting — reset script only works on existing databases."
  exit 1
fi

# 2️⃣ Confirm action
read -p "⚠️  This will ERASE all user, order, dispatch, and loyalty data for '$ENV'. Continue? (y/N): " CONFIRM
[[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "❌ Aborted."; exit 1; }

# ============================================================
# 3️⃣ Cleanup Phase
# ============================================================
echo "🧹 Cleaning tables..."
sqlite3 "$DB" <<'SQL'
DELETE FROM notifications_queue;
DELETE FROM loyalty_ledger;
DELETE FROM loyalty_accounts;
DELETE FROM loyalty_withdrawal_meta;
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM dispatch_status_history;
DELETE FROM dispatches;
DELETE FROM users;
SQL
echo "✅ Data cleanup complete."

# ============================================================
# 4️⃣ Seeding Phase
# ============================================================
echo "👤 Creating test admin user (wattsun1@gmail.com) ..."
HASH='$2b$10$oudaFNw74GFgCCbP9BmGQeUJBhOAK3FK9sWHBWFZWRbCX.4QbE.Oe'
sqlite3 "$DB" <<SQL
INSERT INTO users (name, email, phone, type, status, password_hash)
VALUES ('WattSun Admin', 'wattsun1@gmail.com', '+254722761215', 'Admin', 'Active', '$HASH')
ON CONFLICT(email) DO UPDATE SET password_hash='$HASH', status='Active';
SQL
echo "✅ Test admin user ready (email: wattsun1@gmail.com / password: Pass123)"

echo "💎 Seeding loyalty account with 1000 points ..."
sqlite3 "$DB" <<'SQL'
INSERT INTO loyalty_accounts (
  user_id,
  program_id,
  status,
  start_date,
  end_date,
  eligible_from,
  points_balance,
  total_earned
)
VALUES (
  1,
  1,
  'Active',
  date('now'),
  date('now', '+12 months'),
  date('now'),
  1000,
  1000
);

INSERT INTO loyalty_ledger (account_id, kind, points_delta, note)
VALUES (1, 'enroll', 1000, 'Initial enrollment bonus');
SQL
echo "✅ Loyalty account seeded (1000 points)."

# ============================================================
# 5️⃣ Summary Output
# ============================================================
echo "============================================================"
echo "🏁 ${ENV^^} Loyalty Reset Complete"
echo "📊 Table counts after reset:"

for T in users orders order_items dispatches dispatch_status_history loyalty_accounts loyalty_ledger notifications_queue; do
  CNT=$(sqlite3 "$DB" "SELECT COUNT(*) FROM $T;")
  printf " - %-28s %s\n" "$T" "$CNT"
done

echo "============================================================"
sqlite3 "$DB" "SELECT id, email, phone, status FROM users WHERE email='wattsun1@gmail.com';"
sqlite3 "$DB" "SELECT id, points_balance, total_earned, program_id, start_date, end_date FROM loyalty_accounts;"
echo "============================================================"
