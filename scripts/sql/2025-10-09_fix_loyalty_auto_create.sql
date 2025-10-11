PRAGMA foreign_keys = ON;

DROP TRIGGER IF EXISTS trg_loyalty_auto_create;

CREATE TRIGGER trg_loyalty_auto_create
AFTER INSERT ON users
WHEN NEW.type IN ('User','Staff','Driver')
BEGIN
  INSERT INTO loyalty_accounts (
    program_id,
    user_id,
    status,
    start_date,
    end_date,
    eligible_from,
    created_at
  )
  VALUES (
    1,
    NEW.id,
    'Active',
    datetime('now'),
    datetime('now','+12 months'),
    datetime('now'),
    datetime('now')
  );
END;
