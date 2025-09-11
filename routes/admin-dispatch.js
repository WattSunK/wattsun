// routes/admin-dispatch.js
// Step 3: READ-ONLY scaffold for Dispatch list (SQL-only).
// - GET /api/admin/dispatches            -> list with filters + pagination
// - GET /api/admin/dispatches/_diag/ping -> simple ping
//
// Notes:
// • This router does NOT include an internal requireAdmin.
//   Your server mounts it behind the global admin guard:
//     app.use("/api/admin/dispatches", requireAdmin, require("./routes/admin-dispatch"));
//
// • Joins minimal Order fields so the UI doesn’t need a second fetch.

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const router = express.Router();

// Resolve DB path (env override → sane default)
const DB_PATH =
  process.env.WATTSUN_DB ||
  path.resolve(__dirname, "..", "data", "dev", "wattsun.dev.db");

// Per-call connection helper (enforce FKs)
function withDb(readonly = true) {
  const mode = readonly ? sqlite3.OPEN_READONLY : sqlite3.OPEN_READWRITE;
  const db = new sqlite3.Database(DB_PATH, mode);
  db.serialize(() => db.run("PRAGMA foreign_keys = ON"));
  return db;
}

// ---------------------------------------------------------------------------
// Diagnostics
router.get("/_diag/ping", (req, res) => {
  res.json({ success: true, time: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// GET /api/admin/dispatches
// Query params:
//   q              : free-text on order_id (contains)
//   status         : Created|Assigned|InTransit|Delivered|Canceled
//   driverId       : integer
//   planned_date   : YYYY-MM-DD
//   page (default 1), per (default 20, max 100)
router.get("/", (req, res) => {
  const { q, status, driverId, planned_date, page = "1", per = "20" } = req.query;

  const PER_MAX = 100;
  const perNum = Math.min(Math.max(parseInt(per, 10) || 20, 1), PER_MAX);
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const offset = (pageNum - 1) * perNum;

  const where = [];
  const params = [];

  if (q && String(q).trim() !== "") {
    where.push("(d.order_id LIKE ?)");
    params.push(`%${String(q).trim()}%`);
  }
  if (status && String(status).trim() !== "") {
    where.push("d.status = ?");
    params.push(String(status).trim());
  }
  if (driverId && /^\d+$/.test(String(driverId))) {
    where.push("d.driver_id = ?");
    params.push(parseInt(driverId, 10));
  }
  if (planned_date && /^\d{4}-\d{2}-\d{2}$/.test(String(planned_date))) {
    where.push("d.planned_date = ?");
    params.push(planned_date);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const SQL_COUNT = `
    SELECT COUNT(*) AS n
    FROM dispatches d
    ${whereSql}
  `;

  const SQL_LIST = `
    SELECT
      d.id, d.order_id, d.driver_id, d.status, d.planned_date, d.notes,
      d.created_at, d.updated_at,
      o.status        AS order_status,
      o.totalCents    AS order_totalCents,
      o.depositCents  AS order_depositCents,
      o.currency      AS order_currency,
      o.name          AS order_customerName,
      o.phone         AS order_customerPhone,
      o.email         AS order_customerEmail
    FROM dispatches d
    LEFT JOIN orders o ON o.id = d.order_id
    ${whereSql}
    ORDER BY d.updated_at DESC, d.id DESC
    LIMIT ? OFFSET ?
  `;

  const db = withDb(true);

  db.get(SQL_COUNT, params, (err, row) => {
    if (err) {
      db.close();
      return res.status(500).json({ ok: false, error: String(err.message || err) });
    }
    const total = row?.n || 0;

    const listParams = params.slice();
    listParams.push(perNum, offset);

    db.all(SQL_LIST, listParams, (err2, rows) => {
      db.close();
      if (err2) {
        return res.status(500).json({ ok: false, error: String(err2.message || err2) });
      }

      const dispatches = (rows || []).map((r) => ({
        id: r.id,
        order_id: r.order_id,
        driver_id: r.driver_id,
        status: r.status,
        planned_date: r.planned_date,
        notes: r.notes,
        created_at: r.created_at,
        updated_at: r.updated_at,
        order: {
          id: r.order_id,
          status: r.order_status ?? null,
          totalCents: r.order_totalCents ?? null,
          depositCents: r.order_depositCents ?? null,
          currency: r.order_currency ?? null,
          customerName: r.order_customerName ?? null,
          customerPhone: r.order_customerPhone ?? null,
          customerEmail: r.order_customerEmail ?? null,
        },
      }));

      res.json({ ok: true, total, page: pageNum, per: perNum, dispatches });
    });
  });
});

module.exports = router;
