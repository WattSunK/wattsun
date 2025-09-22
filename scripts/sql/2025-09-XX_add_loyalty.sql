-- 2025-09-XX_add_loyalty.sql
-- Minimal schema to support daily accrual + weekly digest

PRAGMA foreign_keys = ON;

BEGIN;

-- Loyalty Accounts
CREATE TABLE IF NOT EXISTS loyalty_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  start_date TEXT NOT NULL,                -- YYYY-MM-DD
  duration_months INTEGER NOT NULL DEFAULT 12,
  points_balance INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Ledger: append-only history of point changes
CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  kind TEXT NOT NULL,                      -- 'daily', 'manual', etc.
  points_delta INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES loyalty_accounts(id)
);

-- Notifications queue: worker will process these
CREATE TABLE IF NOT EXISTS notifications_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                      -- 'weekly_digest'
  user_id INTEGER,
  email TEXT,
  payload TEXT,
  status TEXT DEFAULT 'Queued',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMIT;
