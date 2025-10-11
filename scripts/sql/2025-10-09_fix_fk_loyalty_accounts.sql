-- ===============================================================
-- Fix FK direction: loyalty_accounts.user_id → users.id
-- Enables proper ON DELETE CASCADE behavior
-- ===============================================================

PRAGMA foreign_keys = OFF;

ALTER TABLE loyalty_accounts RENAME TO loyalty_accounts_old;

CREATE TABLE loyalty_accounts (
  id INTEGER PRIMARY KEY,
  program_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
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
  duration_months INTEGER NOT NULL DEFAULT 12,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Copy all existing rows
INSERT INTO loyalty_accounts
SELECT * FROM loyalty_accounts_old;

-- Drop the old miswired version
DROP TABLE loyalty_accounts_old;

PRAGMA foreign_keys = ON;

-- Verify new FK direction
PRAGMA foreign_key_list(loyalty_accounts);
