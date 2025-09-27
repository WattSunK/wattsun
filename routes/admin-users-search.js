// routes/admin-users-search.js
// Admin Users Search (sqlite3 version) — no better-sqlite3 dependency
// Mounted in server.js under /api/admin/users (already gated by requireAdmin upstream).

const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const router = express.Router();

// Resolve DB path (unified dev/prod env)
const dbPath = process.env.WATTSUN_DB || path.join(process.cwd(), 'data', 'dev', 'wattsun.dev.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('[admin-users-search] Failed to open DB at', dbPath, err);
  } else {
    console.log('[admin-users-search] Using DB at', dbPath);
  }
});

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
        COALESCE(lp.min_withdraw_points, 0) AS minWithdrawPoints,
        COALESCE(la.balance_points, 0)      AS balancePoints,
        COALESCE(u.status, 'Unknown')  AS status
      FROM users u
      LEFT JOIN loyalty_accounts la
        ON la.user_id = u.id
       AND la.status = 'Active'
      LEFT JOIN loyalty_programs lp
        ON lp.id = la.program_id
      WHERE (u.name LIKE $term OR u.email LIKE $term OR u.phone LIKE $term)
      ORDER BY u.name ASC
      LIMIT 25;
    `;

    db.all(sql, { $term: like }, (err, rows) => {
      if (err) {
        console.error('[admin-users-search] query error:', err);
        return res.status(500).json({ success: false, error: { code: 'SEARCH_FAILED', message: 'Failed to search users' } });
      }
      return res.json({ success: true, results: rows || [] });
    });
  } catch (e) {
    console.error('[admin-users-search] handler error:', e);
    return res.status(500).json({ success: false, error: { code: 'SEARCH_FAILED', message: 'Failed to search users' } });
  }
});

module.exports = router;
