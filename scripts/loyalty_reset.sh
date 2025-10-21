#!/bin/bash
set -e

# ============================================================
# 🧩 WattSun Loyalty Reset Utility (Auto-Link + Autoincrement Fix)
# ------------------------------------------------------------
# Cleans key tables, resets AUTOINCREMENT counters, reseeds
# one Admin user, and ensures loyalty account ↔ user linkage.
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
echo "🧩 WattSun Loyalty Reset Utility (Auto-Link + Autoincrement Fix)"
echo "Target environment: ${ENV^^}"
echo "Database: $DB"
echo "============================================================"

# 1️⃣ Verify database exists
if [ ! -f "$DB" ]; then
  echo "❌ Database not found at $DB"
  exit 1
fi

# 2️⃣ Confirm action
read -p "⚠️  This will ERASE all user, order, dispatch, and loyalty data for '$ENV'. Continue? (y/N): " CONFIRM
[[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "❌ Aborted."; exit 1; }

# ============================================================
# 3️⃣ Cleanup Phase
# ============================================================
echo "🧹 Cleaning tables..."
if ! sqlite3 "$DB" "PRAGMA user_version;" >/dev/null 2>&1; then
  echo "❌ Database $DB is not accessible or locked – aborting."
  exit 1
fi

sqlite3 "$DB" <<SQL
DELETE FROM notifications_queue;
DELETE FROM loyalty_ledger;
DELETE FROM loyalty_accounts;
DELETE FROM loyalty_withdrawal_meta;
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM dispatch_status_history;
DELETE FROM dispatches;
DELETE FROM users;
DELETE FROM sqlite_sequence;
SQL
echo "✅ Data cleanup + AUTOINCREMENT reset complete."

# ============================================================
# 4️⃣ Seeding Phase — Insert Admin user normally
# ============================================================
HASH='$2b$10$Wh1kGGTja8uQWLp9DZhdQusf5Yc4HZAbiOkVdqOzWrM.kSnJDfHLu'

echo "👤 Creating test admin user (wattsun1@gmail.com)..."
sqlite3 "$DB" <<SQL
INSERT INTO users (name, email, phone, type, status, password_hash)
VALUES ('WattSun Admin', 'wattsun1@gmail.com', '+254722761215', 'Admin', 'Active', '$HASH');
SQL

ADMIN_ID=$(sqlite3 "$DB" "SELECT id FROM users WHERE email='wattsun1@gmail.com' LIMIT 1;")
if [ -z "$ADMIN_ID" ]; then
  echo "❌ Admin user creation failed — aborting."
  exit 1
fi
echo "✅ Test admin user created (ID $ADMIN_ID)."

# ============================================================
# 5️⃣ Seed Loyalty Account + Ledger
# ============================================================
echo "💎 Seeding loyalty account (1000 points) linked to user ID $ADMIN_ID..."
sqlite3 "$DB" <<SQL
INSERT INTO loyalty_accounts (
  user_id, program_id, status,
  start_date, end_date, eligible_from,
  points_balance, total_earned
)
VALUES (
  $ADMIN_ID, 1, 'Active',
  date('now'), date('now', '+12 months'), date('now'),
  1000, 1000
);

INSERT INTO loyalty_ledger (account_id, kind, points_delta, note)
VALUES (
  (SELECT id FROM loyalty_accounts WHERE user_id=$ADMIN_ID LIMIT 1),
  'enroll', 1000, 'Initial enrollment bonus'
);
SQL
echo "✅ Loyalty account + ledger seeded for admin."

# ============================================================
# 6️⃣ Trigger + View Safeguards
# ============================================================
echo "🧩 Ensuring trigger + view integrity..."
sqlite3 "$DB" <<'SQL'
CREATE TRIGGER IF NOT EXISTS trg_loyalty_skip_inactive
BEFORE INSERT ON loyalty_accounts
WHEN (SELECT active FROM loyalty_programs WHERE id=NEW.program_id) = 0
BEGIN
  SELECT RAISE(IGNORE);
END;
SQL

# Optional: refresh view definition if missing
sqlite3 "$DB" "SELECT name FROM sqlite_master WHERE type='view' AND name='v_loyalty_account_progress';" | grep -q . || \
sqlite3 "$DB" <<'SQL'
CREATE VIEW v_loyalty_account_progress AS
SELECT
  la.id AS account_id,
  u.email AS email,
  u.phone AS phone,
  la.points_balance,
  la.total_earned,
  la.status,
  la.start_date,
  la.end_date
FROM loyalty_accounts la
JOIN users u ON la.user_id = u.id;
SQL
echo "✅ Trigger verified, view ensured."

# ============================================================
# 7️⃣ Summary Output
# ============================================================
echo "============================================================"
echo "🏁 ${ENV^^} Loyalty Reset Complete"
echo "📊 Table counts after reset:"
for T in users orders order_items dispatches dispatch_status_history loyalty_accounts loyalty_ledger notifications_queue; do
  CNT=$(sqlite3 "$DB" "SELECT COUNT(*) FROM $T;")
  printf " - %-28s %s\n" "$T" "$CNT"
done

echo "============================================================"
sqlite3 "$DB" "SELECT id, email, phone, status FROM users;"
sqlite3 "$DB" "SELECT id, user_id, points_balance, total_earned, status FROM loyalty_accounts;"
echo "============================================================"
echo "✅ All done! The '$ENV' environment has been reset."