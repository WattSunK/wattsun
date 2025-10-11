-- ================================================================
-- triggers_user_loyalty_sync.sql
-- Purpose: Keep loyalty_accounts.status in sync with users.status
-- ================================================================

PRAGMA foreign_keys = OFF;

-- 🔹 Deactivate loyalty account when user marked Deleted
DROP TRIGGER IF EXISTS trg_loyalty_deactivate_on_user_delete;

CREATE TRIGGER trg_loyalty_deactivate_on_user_delete
AFTER UPDATE OF status ON users
FOR EACH ROW
WHEN LOWER(NEW.status) = 'deleted'
BEGIN
  UPDATE loyalty_accounts
  SET status = 'Inactive',
      updated_at = datetime('now')
  WHERE user_id = NEW.id;
END;

-- 🔹 Reactivate loyalty account when user reactivated
DROP TRIGGER IF EXISTS trg_loyalty_reactivate_on_user_active;

CREATE TRIGGER trg_loyalty_reactivate_on_user_active
AFTER UPDATE OF status ON users
FOR EACH ROW
WHEN LOWER(NEW.status) = 'active'
BEGIN
  UPDATE loyalty_accounts
  SET status = 'Active',
      updated_at = datetime('now')
  WHERE user_id = NEW.id;
END;

PRAGMA foreign_keys = ON;
