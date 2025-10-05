
PRAGMA foreign_keys = ON;

BEGIN;

----------------------------------------------------------------
-- Loyalty Init — 2025-09-21
-- Program + settings + accounts + ledger + daily guard + withdrawals + metrics
-- Views & trigger to keep balances consistent (append-only ledger)
----------------------------------------------------------------

-- 0) Program catalog
CREATE TABLE IF NOT EXISTS loyalty_programs (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  code               TEXT NOT NULL UNIQUE,     -- e.g., 'STAFF'
  name               TEXT NOT NULL,            -- 'Staff Loyalty'
  active             INTEGER NOT NULL DEFAULT 1, -- 0/1
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO loyalty_programs (code, name, active)
VALUES ('STAFF', 'Staff Loyalty', 1);

-- 1) Admin-editable settings (key/value; JSON-friendly)
CREATE TABLE IF NOT EXISTS loyalty_program_settings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id  INTEGER NOT NULL REFERENCES loyalty_programs(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,    -- 'eligibleUserTypes','durationMonths','minWithdrawPoints','withdrawWaitDays','eurPerPoint','signupBonus'
  value       TEXT NOT NULL,    -- JSON or scalar (TEXT); parse in app layer or with JSON1
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(program_id, key)
);

-- Defaults for STAFF program
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

-- 2) Accounts (one per user per program)
CREATE TABLE IF NOT EXISTS loyalty_accounts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id      INTEGER NOT NULL REFERENCES loyalty_programs(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL,                 -- FK to users(id) in users DB
  status          TEXT NOT NULL DEFAULT 'Active',   -- Active|Paused|Closed
  start_date      TEXT NOT NULL,                    -- ISO date
  end_date        TEXT NOT NULL,                    -- start + durationMonths
  eligible_from   TEXT NOT NULL,                    -- start + withdrawWaitDays
  points_balance  INTEGER NOT NULL DEFAULT 0,       -- denormalized; maintained by trigger
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
  kind          TEXT NOT NULL,            -- enroll|daily|penalty|withdraw|extend|status|adjust
  points_delta  INTEGER NOT NULL,         -- +100, +1, -1, -N, 0 for extend/status
  note          TEXT,
  admin_user_id INTEGER,                  -- set for admin actions
  UNIQUE(account_id, ts, kind, points_delta, COALESCE(note,''))
);

CREATE INDEX IF NOT EXISTS idx_loy_led_account ON loyalty_ledger(account_id);
CREATE INDEX IF NOT EXISTS idx_loy_led_ts ON loyalty_ledger(ts);
CREATE INDEX IF NOT EXISTS idx_loy_led_kind ON loyalty_ledger(kind);

-- 4) Daily accrual idempotency
CREATE TABLE IF NOT EXISTS loyalty_daily_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id    INTEGER NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
  accrual_date  TEXT NOT NULL,            -- 'YYYY-MM-DD'
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(account_id, accrual_date)
);

CREATE INDEX IF NOT EXISTS idx_loy_daily_account ON loyalty_daily_log(account_id);
CREATE INDEX IF NOT EXISTS idx_loy_daily_date ON loyalty_daily_log(accrual_date);

-- 5) Withdrawals (approval & payment flow)
CREATE TABLE IF NOT EXISTS loyalty_withdrawals (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id     INTEGER NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
  requested_pts  INTEGER NOT NULL,        -- >= minWithdrawPoints
  requested_eur  INTEGER NOT NULL,        -- eurPerPoint * requested_pts
  status         TEXT NOT NULL DEFAULT 'Pending',  -- Pending|Approved|Rejected|Paid
  requested_at   TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at     TEXT,
  decided_by     INTEGER,                 -- admin_user_id
  decision_note  TEXT,
  paid_at        TEXT,
  payout_ref     TEXT
);

CREATE INDEX IF NOT EXISTS idx_loy_wd_account ON loyalty_withdrawals(account_id);
CREATE INDEX IF NOT EXISTS idx_loy_wd_status ON loyalty_withdrawals(status);

-- 6) Shareable metrics toggles
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

-- 8) Trigger to keep balances consistent (append-only)
CREATE TRIGGER IF NOT EXISTS trg_loyalty_ledger_after_insert
AFTER INSERT ON loyalty_ledger
BEGIN
  UPDATE loyalty_accounts
  SET
    points_balance = points_balance + NEW.points_delta,
    total_earned   = total_earned + CASE
                                      WHEN NEW.points_delta > 0 AND NEW.kind IN ('enroll','daily','adjust') THEN NEW.points_delta
                                      ELSE 0
                                    END,
    total_penalty  = total_penalty + CASE
                                      WHEN NEW.points_delta < 0 AND NEW.kind='penalty' THEN ABS(NEW.points_delta)
                                      ELSE 0
                                    END,
    total_paid     = total_paid + CASE
                                      WHEN NEW.kind='withdraw' AND NEW.points_delta < 0 THEN ABS(NEW.points_delta)
                                      ELSE 0
                                    END,
    updated_at     = (datetime('now'))
  WHERE id = NEW.account_id;

  -- Clamp floor at zero
  UPDATE loyalty_accounts
  SET points_balance = CASE WHEN points_balance < 0 THEN 0 ELSE points_balance END
  WHERE id = NEW.account_id;
END;

COMMIT;
