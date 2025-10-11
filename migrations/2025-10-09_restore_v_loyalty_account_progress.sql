-- 2025-10-09_restore_v_loyalty_account_progress.sql
-- Recreates the loyalty account progress view to ensure only valid linked users are shown

DROP VIEW IF EXISTS v_loyalty_account_progress;

CREATE VIEW v_loyalty_account_progress AS
SELECT
  la.id AS account_id,
  la.user_id,
  u.email,
  u.name,
  la.points_balance,
  la.total_earned,
  la.status,
  la.created_at
FROM loyalty_accounts la
INNER JOIN users u ON la.user_id = u.id
WHERE u.status IN ('Active','Deleted');
