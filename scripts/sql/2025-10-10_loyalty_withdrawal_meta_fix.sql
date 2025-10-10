-- ================================================================
--  Migration: 2025-10-10_loyalty_withdrawal_meta_fix.sql
--  Purpose   : Fix missing schema fields in loyalty_withdrawal_meta
--               (adds admin_user_id and created_at columns)
--  Author    : WattSun DevOps
--  Version   : 2025-10-10
-- ================================================================

-- 1️⃣  Add admin_user_id column if it does not exist
ALTER TABLE loyalty_withdrawal_meta ADD COLUMN admin_user_id INTEGER;

-- 2️⃣  Add created_at column if it does not exist (no default allowed in ALTER)
ALTER TABLE loyalty_withdrawal_meta ADD COLUMN created_at TEXT;

-- 3️⃣  Backfill created_at for existing rows
UPDATE loyalty_withdrawal_meta
SET created_at = datetime('now','localtime')
WHERE created_at IS NULL;

-- 4️⃣  Verification output
SELECT 
  '✅ loyalty_withdrawal_meta fix applied' AS status,
  COUNT(*) AS existing_rows,
  MAX(created_at) AS latest_created
FROM loyalty_withdrawal_meta;
