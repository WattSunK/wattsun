PRAGMA foreign_keys = ON;
BEGIN;

-- Remove legacy incremental trigger if it exists
DROP TRIGGER IF EXISTS trg_loyalty_ledger_after_insert;

-- Guards (safe if already present)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ll_enroll_once
ON loyalty_ledger(account_id, kind)
WHERE kind='enroll';

CREATE UNIQUE INDEX IF NOT EXISTS uq_ll_daily_once
ON loyalty_ledger(account_id, kind, date(ts))
WHERE kind='daily';

-- Recalc triggers (drop+create to guarantee alignment)
DROP TRIGGER IF EXISTS trg_ll_after_insert_recalc;
DROP TRIGGER IF EXISTS trg_ll_after_update_recalc;
DROP TRIGGER IF EXISTS trg_ll_after_delete_recalc;

CREATE TRIGGER trg_ll_after_insert_recalc
AFTER INSERT ON loyalty_ledger
BEGIN
  UPDATE loyalty_accounts
  SET
    total_earned = COALESCE((SELECT SUM(CASE WHEN points_delta > 0 THEN points_delta ELSE 0 END)
                             FROM loyalty_ledger WHERE account_id=NEW.account_id),0),
    total_penalty = COALESCE((SELECT SUM(CASE WHEN kind='penalty' THEN ABS(points_delta) ELSE 0 END)
                              FROM loyalty_ledger WHERE account_id=NEW.account_id),0),
    total_paid = COALESCE((SELECT SUM(CASE WHEN kind='withdraw_paid' THEN ABS(points_delta) ELSE 0 END)
                           FROM loyalty_ledger WHERE account_id=NEW.account_id),0),
    points_balance = MAX(0,
       COALESCE((SELECT SUM(CASE WHEN points_delta > 0 THEN points_delta ELSE 0 END)
                 FROM loyalty_ledger WHERE account_id=NEW.account_id),0)
     - COALESCE((SELECT SUM(CASE WHEN kind='penalty' THEN ABS(points_delta) ELSE 0 END)
                 FROM loyalty_ledger WHERE account_id=NEW.account_id),0)
     - COALESCE((SELECT SUM(CASE WHEN kind='withdraw_paid' THEN ABS(points_delta) ELSE 0 END)
                 FROM loyalty_ledger WHERE account_id=NEW.account_id),0)
    )
  WHERE id=NEW.account_id;
END;

CREATE TRIGGER trg_ll_after_update_recalc
AFTER UPDATE ON loyalty_ledger
BEGIN
  UPDATE loyalty_accounts
  SET
    total_earned = COALESCE((SELECT SUM(CASE WHEN points_delta > 0 THEN points_delta ELSE 0 END)
                             FROM loyalty_ledger WHERE account_id=NEW.account_id),0),
    total_penalty = COALESCE((SELECT SUM(CASE WHEN kind='penalty' THEN ABS(points_delta) ELSE 0 END)
                              FROM loyalty_ledger WHERE account_id=NEW.account_id),0),
    total_paid = COALESCE((SELECT SUM(CASE WHEN kind='withdraw_paid' THEN ABS(points_delta) ELSE 0 END)
                           FROM loyalty_ledger WHERE account_id=NEW.account_id),0),
    points_balance = MAX(0,
       COALESCE((SELECT SUM(CASE WHEN points_delta > 0 THEN points_delta ELSE 0 END)
                 FROM loyalty_ledger WHERE account_id=NEW.account_id),0)
     - COALESCE((SELECT SUM(CASE WHEN kind='penalty' THEN ABS(points_delta) ELSE 0 END)
                 FROM loyalty_ledger WHERE account_id=NEW.account_id),0)
     - COALESCE((SELECT SUM(CASE WHEN kind='withdraw_paid' THEN ABS(points_delta) ELSE 0 END)
                 FROM loyalty_ledger WHERE account_id=NEW.account_id),0)
    )
  WHERE id=NEW.account_id;

  UPDATE loyalty_accounts
  SET
    total_earned = COALESCE((SELECT SUM(CASE WHEN points_delta > 0 THEN points_delta ELSE 0 END)
                             FROM loyalty_ledger WHERE account_id=OLD.account_id),0),
    total_penalty = COALESCE((SELECT SUM(CASE WHEN kind='penalty' THEN ABS(points_delta) ELSE 0 END)
                              FROM loyalty_ledger WHERE account_id=OLD.account_id),0),
    total_paid = COALESCE((SELECT SUM(CASE WHEN kind='withdraw_paid' THEN ABS(points_delta) ELSE 0 END)
                           FROM loyalty_ledger WHERE account_id=OLD.account_id),0),
    points_balance = MAX(0,
       COALESCE((SELECT SUM(CASE WHEN points_delta > 0 THEN points_delta ELSE 0 END)
                 FROM loyalty_ledger WHERE account_id=OLD.account_id),0)
     - COALESCE((SELECT SUM(CASE WHEN kind='penalty' THEN ABS(points_delta) ELSE 0 END)
                 FROM loyalty_ledger WHERE account_id=OLD.account_id),0)
     - COALESCE((SELECT SUM(CASE WHEN kind='withdraw_paid' THEN ABS(points_delta) ELSE 0 END)
                 FROM loyalty_ledger WHERE account_id=OLD.account_id),0)
    )
  WHERE id=OLD.account_id AND NEW.account_id<>OLD.account_id;
END;

CREATE TRIGGER trg_ll_after_delete_recalc
AFTER DELETE ON loyalty_ledger
BEGIN
  UPDATE loyalty_accounts
  SET
    total_earned = COALESCE((SELECT SUM(CASE WHEN points_delta > 0 THEN points_delta ELSE 0 END)
                             FROM loyalty_ledger WHERE account_id=OLD.account_id),0),
    total_penalty = COALESCE((SELECT SUM(CASE WHEN kind='penalty' THEN ABS(points_delta) ELSE 0 END)
                              FROM loyalty_ledger WHERE account_id=OLD.account_id),0),
    total_paid = COALESCE((SELECT SUM(CASE WHEN kind='withdraw_paid' THEN ABS(points_delta) ELSE 0 END)
                           FROM loyalty_ledger WHERE account_id=OLD.account_id),0),
    points_balance = MAX(0,
       COALESCE((SELECT SUM(CASE WHEN points_delta > 0 THEN points_delta ELSE 0 END)
                 FROM loyalty_ledger WHERE account_id=OLD.account_id),0)
     - COALESCE((SELECT SUM(CASE WHEN kind='penalty' THEN ABS(points_delta) ELSE 0 END)
                 FROM loyalty_ledger WHERE account_id=OLD.account_id),0)
     - COALESCE((SELECT SUM(CASE WHEN kind='withdraw_paid' THEN ABS(points_delta) ELSE 0 END)
                 FROM loyalty_ledger WHERE account_id=OLD.account_id),0)
    )
  WHERE id=OLD.account_id;
END;

COMMIT;
