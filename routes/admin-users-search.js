// routes/admin-users-search.js
// Admin Users Search (sqlite3 version) — no better-sqlite3 dependency
// Mounted in server.js under /api/admin/users (already gated by requireAdmin upstream).

const express = require('express');
const path = require('path');
// Use shared better-sqlite3 handle
const db = require('./db_users');

const router = express.Router();

// Resolve DB path (unified dev/prod env)
// Note: DB path selection handled by db_users / server

function toLikeTerm(q) {
  if (!q) return '%';
  const s = String(q).trim();
  if (!s) return '%';
  // remove existing wildcard chars to avoid accidental wide scans
  return `%${s.replace(/[%_]/g, '')}%`;
}

/**
 * GET /api/admin/users/search?q=term
 * Response: { success:true, results:[ { id, name, email, phone, account_id, program_name, minWithdrawPoints, balancePoints, status } ] }
 */
router.get('/search', (req, res) => {
  try {
    const like = toLikeTerm(req.query.q || '');

    const sql = `
  SELECT
  u.id                           AS id,
  COALESCE(u.name, '')           AS name,
  COALESCE(u.email, '')          AS email,
  COALESCE(u.phone, '')          AS phone,
  la.id                          AS account_id,
  lp.name                        AS program_name,
  COALESCE(la.points_balance,0)  AS balancePoints,
  COALESCE(u.status,'Unknown')   AS status,
  CAST(
  COALESCE(
    CASE WHEN TRIM(lps.value) <> '' THEN lps.value END,
    lps.value_int,
    0
  ) AS INTEGER
) AS minWithdrawPoints

FROM users u
LEFT JOIN loyalty_accounts la
  ON la.user_id = u.id
 AND la.status = 'Active'
LEFT JOIN loyalty_programs lp
  ON lp.id = la.program_id
LEFT JOIN loyalty_program_settings lps
  ON lps.program_id = lp.id
 AND lps.key = 'minWithdrawPoints'
WHERE (u.name LIKE $term OR u.email LIKE $term OR u.phone LIKE $term)
ORDER BY u.name ASC
LIMIT 25;
`;

    const rows = db.prepare(sql).all({ $term: like });
    return res.json({ success: true, results: rows || [] });
  } catch (e) {
    console.error('[admin-users-search] handler error:', e);
    return res.status(500).json({ success: false, error: { code: 'SEARCH_FAILED', message: 'Failed to search users' } });
  }
});

module.exports = router;
