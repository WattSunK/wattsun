-- ===============================================================
-- Migration: 2025-10-08_add_fk_loyalty_user.sql
-- Purpose : Add foreign key on loyalty_accounts.user_id → users.id
-- ===============================================================

PRAGMA foreign_keys = OFF;

-- 1️⃣ Rename current table
ALTER TABLE loyalty_accounts RENAME TO loyalty_accounts_old;

-- 2️⃣ Recreate with the new FK constraint
CREATE TABLE loyalty_accounts (
  id INTEGER PRIMARY KEY,
  program_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'Active',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  eligible_from TEXT NOT NULL,
  points_balance INTEGER NOT NULL DEFAULT 0,
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_penalty INTEGER NOT NULL DEFAULT 0,
  total_paid INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  duration_months INTEGER NOT NULL DEFAULT 12
);

-- 3️⃣ Copy valid rows back (skip any orphaned rows)
INSERT INTO loyalty_accounts
SELECT *
FROM loyalty_accounts_old
WHERE user_id IN (SELECT id FROM users);

-- 4️⃣ Drop old table
DROP TABLE loyalty_accounts_old;

PRAGMA foreign_keys = ON;

-- ✅ Done
