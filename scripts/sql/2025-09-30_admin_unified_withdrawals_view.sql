-- file: scripts/sql/2025-09-30_admin_unified_withdrawals_view.sql
CREATE VIEW IF NOT EXISTS v_withdrawals_unified AS
  SELECT
    lw.id,
    lw.account_id,
    la.user_id,
    lw.requested_pts AS points,
    lw.requested_eur AS eur,
    lw.status,
    lw.requested_at,
    lw.decided_at,
    lw.paid_at,
    lw.decision_note,
    lw.decided_by,
    lw.payout_ref,
    'customer' AS source
  FROM loyalty_withdrawals lw
  LEFT JOIN loyalty_accounts la ON la.id = lw.account_id
UNION ALL
  SELECT
    w.id,
    w.account_id,
    w.user_id,
    w.points,
    w.eur,
    w.status,
    w.requested_at,
    w.decided_at,
    w.paid_at,
    w.decision_note,
    w.decided_by,
    w.payout_ref,
    'admin' AS source
  FROM withdrawals;
