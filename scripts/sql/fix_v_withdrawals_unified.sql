-- ===============================================================
-- fix_v_withdrawals_unified.sql
-- Purpose: Recreate v_withdrawals_unified with clean column aliases
-- Author: Auto-generated on 2025-10-08
-- ===============================================================

PRAGMA foreign_keys = OFF;

-- 1️⃣ Drop any old/corrupt version of the view
DROP VIEW IF EXISTS v_withdrawals_unified;

-- 2️⃣ Recreate the view using fully qualified plain columns (no "w." alias)
CREATE VIEW v_withdrawals_unified AS
SELECT
  id,
  account_id,
  user_id,
  points,
  eur,
  status,
  requested_at,
  decided_at,
  paid_at,
  decision_note,
  decided_by,
  payout_ref,
  'admin' AS source
FROM withdrawals
UNION ALL
SELECT
  id,
  account_id,
  user_id,
  requested_pts  AS points,
  requested_eur  AS eur,
  status,
  requested_at,
  decided_at,
  paid_at,
  decision_note,
  decided_by,
  payout_ref,
  'customer' AS source
FROM loyalty_withdrawals;

PRAGMA foreign_keys = ON;

-- ✅ Verification helper (optional)
-- Run this manually if you wish:
--   SELECT COUNT(*) FROM v_withdrawals_unified;
