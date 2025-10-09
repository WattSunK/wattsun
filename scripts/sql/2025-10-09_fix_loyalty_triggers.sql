-- 2025-10-09_fix_loyalty_triggers.sql (patched)
PRAGMA foreign_keys = ON;

DROP TRIGGER IF EXISTS trg_loyalty_auto_create;
DROP TRIGGER IF EXISTS trg_ll_after_insert_recalc;
DROP TRIGGER IF EXISTS trg_ll_after_delete_recalc;
DROP TRIGGER IF EXISTS trg_ll_after_update_recalc;

-- Auto-create loyalty account when a new user joins
CREATE TRIGGER IF NOT EXISTS trg_loyalty_auto_create
AFTER INSERT ON users
WHEN NEW.type IN ('User','Staff','Driver')
BEGIN
  INSERT INTO loyalty_accounts (user_id, status, created_at)
  VALUES (NEW.id, 'Active', datetime('now'));
END;

-- Add points after ledger insert
CREATE TRIGGER IF NOT EXISTS trg_ll_after_insert_recalc
AFTER INSERT ON loyalty_ledger
WHEN NEW.points_delta IS NOT NULL
BEGIN
  UPDATE loyalty_accounts
  SET points_balance = COALESCE(points_balance,0) + NEW.points_delta,
      total_earned = COALESCE(total_earned,0) + NEW.points_delta
  WHERE id = NEW.account_id;
END;

-- Subtract points after ledger delete
CREATE TRIGGER IF NOT EXISTS trg_ll_after_delete_recalc
AFTER DELETE ON loyalty_ledger
WHEN OLD.points_delta IS NOT NULL
BEGIN
  UPDATE loyalty_accounts
  SET points_balance = COALESCE(points_balance,0) - OLD.points_delta
  WHERE id = OLD.account_id;
END;

-- Timestamp refresh on ledger update
CREATE TRIGGER IF NOT EXISTS trg_ll_after_update_recalc
AFTER UPDATE ON loyalty_ledger
BEGIN
  UPDATE loyalty_accounts
  SET updated_at = datetime('now')
  WHERE id = NEW.account_id;
END;

SELECT name FROM sqlite_master
WHERE type='trigger' AND name LIKE 'trg_ll%' OR name LIKE 'trg_loyalty%';
