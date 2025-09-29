PRAGMA foreign_keys = ON;

BEGIN;

----------------------------------------------------------------
-- Loyalty Init — 2025-09-21 (cleaned: ledger is source of truth)
-- Program + settings + accounts + ledger + daily guard + withdrawals + metrics
-- Views & triggers to keep balances consistent (append-only ledger)
----------------------------------------------------------------

-- 0) Program catalog
CREATE TABLE IF NOT EXISTS loyalty_programs (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  code               TEXT NOT NULL UNIQUE,     -- e.g., 'STAFF'
  name               TEXT NOT NULL,            -- 'Staff Loyalty'
  active             INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO loyalty_programs (code, name, active)
VALUES ('STAFF', 'Staff Loyalty', 1);

-- 1) Admin-editable settings
CREATE TABLE IF NOT EXISTS loyalty_program_settings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id  INTEGER NOT NULL REFERENCES loyalty_programs(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(program_id, key)
);

INSERT OR IGNORE INTO loyalty_program_settings (program_id, key, value)
SELECT p.id, 'eligibleUserTypes', '["Staff"]' FROM loyalty_programs p WHERE p.code='STAFF';
INSERT OR IGNORE INTO loyalty_program_settings (program_id, key, value)
SELECT p.id, 'durationMonths', '6' FROM loyalty_programs p WHERE p.code='STAFF';
INSERT OR IGNORE INTO loyalty_program_settings (program_id, key, value)
SELECT p.id, 'withdrawWaitDays', '90' FROM loyalty_programs p WHERE p.code='STAFF';
INSERT OR IGNORE INTO loyalty_program_settings (program_id, key, value)
SELECT p.id, 'minWithdrawPoints', '100' FROM loyalty_programs p WHERE p.code='STAFF';
INSERT OR IGNORE INTO loyalty_program_settings (program_id, key, value)
SELECT p.id, 'eurPerPoint', '1' FROM loyalty_programs p WHERE p.code='STAFF';
INSERT OR IGNORE INTO loyalty_program_settings (program_id, key, value)
SELECT p.id, 'signupBonus', '100' FROM loyalty_programs p WHERE p.code='STAFF';

-- 2) Accounts (mirror of ledger via triggers)
CREATE TABLE IF NOT EXISTS loyalty_accounts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id      INTEGER NOT NULL REFERENCES loyalty_programs(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'Active',
  start_date      TEXT NOT NULL,
  end_date        TEXT NOT NULL,
  eligible_from   TEXT NOT NULL,
  points_balance  INTEGER NOT NULL DEFAULT 0,
  total_earned    INTEGER NOT NULL DEFAULT 0,
  total_penalty   INTEGER NOT NULL DEFAULT 0,
  total_paid      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(program_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_loy_acct_user ON loyalty_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_loy_acct_program ON loyalty_accounts(program_id);
CREATE INDEX IF NOT EXISTS idx_loy_acct_status ON loyalty_accounts(status);

-- 3) Ledger (append-only)
CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id    INTEGER NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
  ts            TEXT NOT NULL DEFAULT (datetime('now')),
  kind          TEXT NOT NULL,            -- enroll|daily|penalty|withdraw_paid|extend|status|manual_credit
  points_delta  INTEGER NOT NULL,         -- +100, +1, -N, 0 for extend/status
  note          TEXT,
  admin_user_id INTEGER,
  UNIQUE(account_id, ts, kind, points_delta, COALESCE(note,''))
);

CREATE INDEX IF NOT EXISTS idx_loy_led_account ON loyalty_ledger(account_id);
CREATE INDEX IF NOT EXISTS idx_loy_led_ts ON loyalty_ledger(ts);
CREATE INDEX IF NOT EXISTS idx_loy_led_kind ON loyalty_ledger(kind);

-- Guards: one enroll per account; one daily per account/day
CREATE UNIQUE INDEX IF NOT EXISTS uq_ll_enroll_once
ON loyalty_ledger(account_id, kind)
WHERE kind='enroll';

CREATE UNIQUE INDEX IF NOT EXISTS uq_ll_daily_once
ON loyalty_ledger(account_id, kind, date(ts))
WHERE kind='daily';

-- 4) Daily accrual log (optional legacy helper; safe to keep)
CREATE TABLE IF NOT EXISTS loyalty_daily_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id    INTEGER NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
  accrual_date  TEXT NOT NULL,            -- 'YYYY-MM-DD'
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(account_id, accrual_date)
);

CREATE INDEX IF NOT EXISTS idx_loy_daily_account ON loyalty_daily_log(account_id);
CREATE INDEX IF NOT EXISTS idx_loy_daily_date ON loyalty_daily_log(accrual_date);

-- 5) Withdrawals
CREATE TABLE IF NOT EXISTS loyalty_withdrawals (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id     INTEGER NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
  requested_pts  INTEGER NOT NULL,
  requested_eur  INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'Pending',
  requested_at   TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at     TEXT,
  decided_by     INTEGER,
  decision_note  TEXT,
  paid_at        TEXT,
  payout_ref     TEXT
);

CREATE INDEX IF NOT EXISTS idx_loy_wd_account ON loyalty_withdrawals(account_id);
CREATE INDEX IF NOT EXISTS idx_loy_wd_status ON loyalty_withdrawals(status);

-- 6) Shareable metrics
CREATE TABLE IF NOT EXISTS loyalty_shared_metrics (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id   INTEGER NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
  metric_code  TEXT NOT NULL,     -- 'BALANCE','DAYS_ACTIVE','PENALTIES','WITHDRAWALS'
  is_shared    INTEGER NOT NULL,  -- 0/1
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(account_id, metric_code)
);

-- 7) Views
CREATE VIEW IF NOT EXISTS v_loyalty_account_progress AS
SELECT
  la.id              AS account_id,
  la.user_id,
  la.program_id,
  la.status,
  la.start_date,
  la.end_date,
  la.eligible_from,
  la.points_balance,
  la.total_earned,
  la.total_penalty,
  la.total_paid,
  MAX(CASE WHEN ll.kind='daily' THEN ll.ts END) AS last_daily_ts
FROM loyalty_accounts la
LEFT JOIN loyalty_ledger ll ON ll.account_id = la.id
GROUP BY la.id;

CREATE VIEW IF NOT EXISTS v_loyalty_withdrawals AS
SELECT
  w.id,
  w.account_id,
  la.user_id,
  la.program_id,
  w.requested_pts,
  w.requested_eur,
  w.status,
  w.requested_at,
  w.decided_at,
  w.decided_by,
  w.decision_note,
  w.paid_at,
  w.payout_ref
FROM loyalty_withdrawals w
JOIN loyalty_accounts la ON la.id = w.account_id;

-- 8) Triggers (recalc accounts mirror from ledger)
-- Clean up any old incremental trigger names
DROP TRIGGER IF EXISTS trg_loyalty_ledger_after_insert;

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
