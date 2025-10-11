-- 2025-10-08  Add user.status column and soft-delete helper view
PRAGMA foreign_keys = ON;

-- ✅ 1. Ensure the users table has a status column
ALTER TABLE users
  ADD COLUMN status TEXT NOT NULL DEFAULT 'Active';

-- ✅ 2. Optional index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- ✅ 3. Helper view to see only active users
CREATE VIEW IF NOT EXISTS v_active_users AS
SELECT * FROM users WHERE LOWER(status)='active';
