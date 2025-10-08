-- ================================================================
-- Trigger: when a user's status changes to 'Deleted', deactivate
--          their corresponding loyalty account automatically.
-- ================================================================

DROP TRIGGER IF EXISTS trg_loyalty_deactivate_on_user_delete;

CREATE TRIGGER trg_loyalty_deactivate_on_user_delete
AFTER UPDATE OF status ON users
FOR EACH ROW
WHEN LOWER(NEW.status) = 'deleted'
BEGIN
  UPDATE loyalty_accounts
  SET active = 0
  WHERE user_id = NEW.id;
END;

-- Optional: reverse logic (reactivate)
DROP TRIGGER IF EXISTS trg_loyalty_reactivate_on_user_active;

CREATE TRIGGER trg_loyalty_reactivate_on_user_active
AFTER UPDATE OF status ON users
FOR EACH ROW
WHEN LOWER(NEW.status) = 'active'
BEGIN
  UPDATE loyalty_accounts
  SET active = 1
  WHERE user_id = NEW.id;
END;
