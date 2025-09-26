// routes/admin-users-search.js
const express = require("express");
const router = express.Router();
// If requireAdmin isn’t global, uncomment the next line and mount here.
// const { requireAdmin } = require("./_middleware"); router.use(requireAdmin);

/**
 * GET /api/admin/users/search?q=term
 * Returns [{ id, name, email, phone, account_id, status, balance, minWithdrawPoints }]
 */
router.get("/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json({ success: true, users: [] });

  try {
    const dbPath = process.env.DB_PATH_USERS || process.env.SQLITE_DB || "./data/dev/wattsun.dev.db";
    const sqlite3 = require("sqlite3").verbose();
    const db = new sqlite3.Database(dbPath);

    // Basic LIKE match on email/phone/name; paramized to avoid injection.
    const sql = `
      WITH cand AS (
        SELECT u.id, u.name, u.email, u.phone, u.status
        FROM users u
        WHERE (u.email LIKE ? OR u.phone LIKE ? OR u.name LIKE ?)
        ORDER BY u.id DESC
        LIMIT 25
      ),
      acct AS (
        SELECT a.user_id, a.id AS account_id, a.status AS account_status
        FROM loyalty_accounts a
        WHERE a.status = 'Active'
      ),
      bal AS (
        SELECT l.account_id, COALESCE(SUM(l.points_delta), 0) AS balance
        FROM loyalty_ledger l
        WHERE l.status = 'Posted'
        GROUP BY l.account_id
      ),
      prefs AS (
        SELECT p.id AS program_id, COALESCE(p.min_withdraw_points, 0) AS minWithdrawPoints
        FROM loyalty_programs p
        WHERE p.status = 'Active'
        ORDER BY p.id DESC LIMIT 1
      )
      SELECT
        c.id, c.name, c.email, c.phone, c.status,
        a.account_id,
        COALESCE(b.balance, 0) AS balance,
        (SELECT minWithdrawPoints FROM prefs) AS minWithdrawPoints
      FROM cand c
      LEFT JOIN acct a ON a.user_id = c.id
      LEFT JOIN bal  b ON b.account_id = a.account_id
      LIMIT 10;
    `;
    const like = `%${q}%`;

    db.all(sql, [like, like, like], (err, rows) => {
      db.close();
      if (err) {
        return res.status(500).json({ success: false, error: { code: "DB_ERROR", message: err.message } });
      }
      // Map to the contract expected by the frontend.
      const users = (rows || []).map(r => ({
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        status: r.status,
        account_id: r.account_id || null,
        balance: r.balance || 0,
        minWithdrawPoints: r.minWithdrawPoints || 0
      }));
      return res.json({ success: true, users });
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: e.message } });
  }
});

module.exports = router;
