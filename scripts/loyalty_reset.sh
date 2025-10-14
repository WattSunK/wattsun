#!/bin/bash
# ============================================================
# WattSun Loyalty Reset Utility
# ------------------------------------------------------------
# Resets user, order, dispatch, and loyalty data for QA or DEV
# ============================================================

set -e

# Detect environment
ENV="${1:-qa}"
case "$ENV" in
  qa|QA)
    DB="/volume1/web/wattsun/data/qa/wattsun.qa.db"
    ;;
  dev|DEV)
    DB="/volume1/web/wattsun/data/dev/wattsun.dev.db"
    ;;
  *)
    echo "âŒ Invalid environment. Use: qa or dev"
    exit 1
    ;;
esac

echo "============================================================"
echo "ðŸ§© WattSun Loyalty Reset Utility"
echo "Target environment: ${ENV^^}"
echo "Database: $DB"
echo "============================================================"

# 2️⃣ Check DB existence
if [ ! -f "$DB" ]; then
  echo "❌ Database not found at $DB"
  echo "Aborting — reset script only works on existing databases."
  exit 1
fi

# Confirmation prompt
read -p "This will ERASE all user, order, dispatch, and loyalty data for '$ENV'. Continue? (y/N): " CONFIRM
[[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "❌ Aborted."; exit 1; }

# Schema verification
echo "🔍 Verifying schema..."
sqlite3 "$DB" "
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT UNIQUE,
  phone TEXT,
  password_hash TEXT,
  type TEXT,
  role TEXT,
  status TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);" || true
HAS_ROLE=$(sqlite3 "$DB" "PRAGMA table_info(users);" | grep -c '|role|')
if [ "$HAS_ROLE" -eq 0 ]; then
  sqlite3 "$DB" "ALTER TABLE users ADD COLUMN role TEXT;"
  echo "ðŸ§± Added missing column 'role' to users table."
fi

sqlite3 "$DB" "
CREATE TABLE IF NOT EXISTS loyalty_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  program_id INTEGER,
  status TEXT,
  start_date TEXT,
  end_date TEXT,
  eligible_from TEXT,
  points_balance INTEGER DEFAULT 0,
  total_earned INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER,
  kind TEXT,
  points_delta INTEGER,
  note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS loyalty_withdrawal_meta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER,
  points INTEGER,
  status TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS notifications_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT,
  user_id INTEGER,
  account_id INTEGER,
  status TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderNumber TEXT,
  user_id INTEGER,
  totalCents INTEGER,
  depositCents INTEGER,
  currency TEXT,
  status TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER,
  product_id INTEGER,
  quantity INTEGER,
  priceCents INTEGER
);
CREATE TABLE IF NOT EXISTS dispatches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER,
  driver_id INTEGER,
  status TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS dispatch_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dispatch_id INTEGER,
  status TEXT,
  note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
"
echo "âœ… Schema verified."

#  Clean up data
echo "ðŸ§¹ Cleaning tables..."
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
echo "âœ… Data cleanup complete."

# Create / update test user
echo "ðŸ‘¤ Creating test admin user (wattsun1@gmail.com) ..."
HASH='$2b$10$oudaFNw74GFgCCbP9BmGQeUJBhOAK3FK9sWHBWFZWRbCX.4QbE.Oe'  # Pass123 bcrypt hash

sqlite3 "$DB" <<SQL
INSERT INTO users (name, email, phone, type, role, status, password_hash)
VALUES ('WattSun Admin', 'wattsun1@gmail.com', '+254722761215', 'Admin', 'Admin', 'Active', '$HASH')
ON CONFLICT(email) DO UPDATE SET password_hash='$HASH', status='Active', role='Admin';
SQL
echo "âœ… Test admin user ready (email: wattsun1@gmail.com / password: Pass123)"

#  Create loyalty account
echo "ðŸ’Ž Seeding loyalty account with 1000 points ..."
sqlite3 "$DB" <<'SQL'
INSERT INTO loyalty_accounts (user_id, program_id, status, start_date, end_date, eligible_from, points_balance, total_earned)
SELECT id, 1, 'Active', date('now'), date('now','+12 months'), date('now'), 1000, 1000
FROM users WHERE email='wattsun1@gmail.com';
INSERT INTO loyalty_ledger (account_id, kind, points_delta, note, created_at)
SELECT id, 'enroll', 1000, 'Enrollment seed for QA/DEV testing', datetime('now')
FROM loyalty_accounts WHERE user_id=(SELECT id FROM users WHERE email='wattsun1@gmail.com');
SQL
echo "âœ… Loyalty account seeded (1000 points)."

#  Completion summary
echo "============================================================"
echo "ðŸ ${ENV^^} Loyalty Reset Complete"
echo "ðŸ“Š Table counts after reset:"
for T in users orders order_items dispatches dispatch_status_history loyalty_accounts loyalty_ledger notifications_queue; do
  CNT=$(sqlite3 "$DB" "SELECT COUNT(*) FROM $T;")
  printf " - %-28s %s\n" "$T" "$CNT"
done
echo "============================================================"
sqlite3 "$DB" "SELECT id, email, phone, role, status FROM users WHERE email='wattsun1@gmail.com';"
sqlite3 "$DB" "SELECT id, points_balance, total_earned FROM loyalty_accounts;"
echo "============================================================"