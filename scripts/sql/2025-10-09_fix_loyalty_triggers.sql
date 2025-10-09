-- 2025-10-09_fix_loyalty_triggers.sql  (v2)
-- Purpose: Restore loyalty triggers with correct column names and default program_id.

PRAGMA foreign_keys = ON;

-- Drop existing triggers to avoid duplication
DROP TRIGGER IF EXISTS trg_loyalty_auto_create;
DROP TRIGGER IF EXISTS trg_ll_after_insert_recalc;
DROP TRIGGER IF EXISTS trg_ll_after_delete_recalc;
DROP TRIGGER IF EXISTS trg_ll_after_update_recalc;

------------------------------------------------------------
-- 1️⃣  Auto-create loyalty account on new user insertion
------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_loyalty_auto_create
AFTER INSERT ON users
WHEN NEW.type IN ('User','Staff','Driver')
BEGIN
  INSERT INTO loyalty_accounts (program_id, user_id, status, created_at)
  VALUES (1, NEW.id, 'Active', datetime('now'));
END;

------------------------------------------------------------
-- 2️⃣  Update balance after ledger insert
------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_ll_after_insert_recalc
AFTER INSERT ON loyalty_ledger
WHEN NEW.points_delta IS NOT NULL
BEGIN
  UPDATE loyalty_accounts
  SET points_balance = COALESCE(points_balance,0) + NEW.points_delta,
      total_earned  = COALESCE(total_earned,0)  + NEW.points_delta,
      updated_at    = datetime('now')
  WHERE id = NEW.account_id;
END;

------------------------------------------------------------
-- 3️⃣  Update balance after ledger delete
------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_ll_after_delete_recalc
AFTER DELETE ON loyalty_ledger
WHEN OLD.points_delta IS NOT NULL
BEGIN
  UPDATE loyalty_accounts
  SET points_balance = COALESCE(points_balance,0) - OLD.points_delta,
      updated_at    = datetime('now')
  WHERE id = OLD.account_id;
END;

------------------------------------------------------------
-- 4️⃣  Maintain timestamps when ledger updated
------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_ll_after_update_recalc
AFTER UPDATE ON loyalty_ledger
BEGIN
  UPDATE loyalty_accounts
  SET updated_at = datetime('now')
  WHERE id = NEW.account_id;
END;

------------------------------------------------------------
-- Verification list
------------------------------------------------------------
SELECT name
FROM sqlite_master
WHERE type='trigger'
  AND (name LIKE 'trg_ll%' OR name LIKE 'trg_loyalty%');
