-- ===========================================================
-- 2025-10-09_loyalty_withdrawal_overlay.sql
-- WattSun – Loyalty Withdrawals Overlay & Daily Log Recovery
-- ===========================================================

PRAGMA foreign_keys = ON;

---------------------------------------------------------------
-- 1️⃣  Re-create withdrawal overlay (lifecycle tracking)
---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loyalty_withdrawal_meta (
    ledger_id     INTEGER PRIMARY KEY
                  REFERENCES loyalty_ledger(id)
                  ON DELETE CASCADE,
    status        TEXT NOT NULL DEFAULT 'Pending',
    decided_by    INTEGER,
    decided_at    TEXT DEFAULT (datetime('now','localtime')),
    note          TEXT,
    paid_at       TEXT,              -- optional: record payment time
    rejected_at   TEXT               -- optional: record rejection time
);

-- Helpful index for faster lookups by status
CREATE INDEX IF NOT EXISTS idx_loyalty_withdrawal_meta_status
    ON loyalty_withdrawal_meta(status);

---------------------------------------------------------------
-- 2️⃣  Backfill overlay for existing withdrawals
--     Each ledger entry with kind='withdraw' should have a meta row.
---------------------------------------------------------------
INSERT OR IGNORE INTO loyalty_withdrawal_meta (ledger_id, status)
SELECT id AS ledger_id, 'Pending'
FROM loyalty_ledger
WHERE kind = 'withdraw';

---------------------------------------------------------------
-- 3️⃣  Re-create daily accrual dedupe table
---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loyalty_daily_log (
    account_id     INTEGER NOT NULL,
    accrual_date   TEXT    NOT NULL,
    accrual_points INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT    DEFAULT (datetime('now','localtime')),
    UNIQUE(account_id, accrual_date)
);

-- Helpful index for daily job performance
CREATE INDEX IF NOT EXISTS idx_loyalty_daily_log_account_date
    ON loyalty_daily_log(account_id, accrual_date);

---------------------------------------------------------------
-- 4️⃣  Verification queries (safe to run manually after apply)
-- .tables
-- SELECT COUNT(*) FROM loyalty_withdrawal_meta;
-- SELECT COUNT(*) FROM loyalty_daily_log;
---------------------------------------------------------------

-- ✅  End of migration
