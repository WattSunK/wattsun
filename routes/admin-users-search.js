
// routes/admin-users-search.js
// Admin Users Search (extended for loyalty program_name and balances)
// Mount in server.js as: app.use('/api/admin/users', require('./routes/admin-users-search'));
//
// Requires: express, better-sqlite3 (or sqlite3 wrapper), admin auth middleware `requireAdmin`
// Env: process.env.WATTSUN_DB pointing to dev/prod unified DB (wattsun.dev.db)

const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');

const router = express.Router();

// TODO: replace with your actual admin auth middleware
function requireAdmin(req, res, next) {
  if (req.isAdmin || (req.session && req.session.isAdmin)) return next();
  return res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Admin only" } });
}

// Open DB once per process
const dbPath = process.env.WATTSUN_DB || path.join(process.cwd(), 'data', 'dev', 'wattsun.dev.db');
const db = new Database(dbPath, { fileMustExist: true });

// Normalize query term
function toLikeTerm(q) {
  if (!q) return '%';
  const s = String(q).trim();
  if (!s) return '%';
  return `%${s.replace(/[%_]/g, '')}%`;
}

/**
 * GET /api/admin/users/search?q=term
 * Returns admin search results with loyalty program fields
 * Contract: { success:true, results:[ { id, name, email, phone, account_id, program_name, minWithdrawPoints, balancePoints, status } ] }
 */
router.get('/search', requireAdmin, (req, res) => {
  try {
    const q = toLikeTerm(req.query.q || '');

    // Prefer Active accounts; if multiple, choose the most recent by created_at DESC
    const sql = `
      SELECT
        u.id                         AS id,
        COALESCE(u.name, '')         AS name,
        COALESCE(u.email, '')        AS email,
        COALESCE(u.phone, '')        AS phone,
        la.id                        AS account_id,
        lp.name                      AS program_name,
        COALESCE(lp.min_withdraw_points, 0) AS minWithdrawPoints,
        COALESCE(la.balance_points, 0)      AS balancePoints,
        COALESCE(u.status, 'Unknown') AS status
      FROM users u
      LEFT JOIN loyalty_accounts la
        ON la.user_id = u.id
       AND la.status = 'Active'
      LEFT JOIN loyalty_programs lp
        ON lp.id = la.program_id
      WHERE (u.name  LIKE @term OR u.email LIKE @term OR u.phone LIKE @term)
      ORDER BY u.name ASC
      LIMIT 25;
    `;

    const stmt = db.prepare(sql);
    const rows = stmt.all({ term: q });

    return res.json({ success: true, results: rows });
  } catch (err) {
    console.error('[admin-users-search] error:', err);
    return res.status(500).json({ success: false, error: { code: "SEARCH_FAILED", message: "Failed to search users" } });
  }
});

module.exports = router;
