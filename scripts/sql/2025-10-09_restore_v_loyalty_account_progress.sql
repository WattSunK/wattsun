-- Restore missing view used by /api/admin/loyalty/accounts
DROP VIEW IF EXISTS v_loyalty_account_progress;

CREATE VIEW v_loyalty_account_progress AS
SELECT
  l.id,
  l.user_id,
  u.email,
  u.status AS user_status,
  l.status,
  l.start_date AS start,
  l.end_date AS end,
  l.duration_months AS duration,
  l.points_balance AS balance,
  l.total_earned AS earned,
  l.total_penalty AS penalty,
  l.total_paid AS paid
FROM loyalty_accounts l
LEFT JOIN users u ON l.user_id = u.id;
