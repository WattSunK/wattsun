// routes/admin-dispatch.js
// Admin Dispatch routes
// • This router does NOT include an internal requireAdmin.
// • Mounted in server.js like:
//     app.use('/api/admin/dispatches', require('./routes/admin-dispatch'));

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const router = express.Router();

// DB path from env or default
const DB_PATH =
  process.env.DB_PATH_USERS ||
  process.env.SQLITE_DB ||
  path.resolve(__dirname, "../data/dev/wattsun.dev.db");

// Utility to run a SQL query with params, returning a Promise
function allAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}
function getAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}
function runAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

// --- Diagnostics -------------------------------------------------------------

router.get("/_diag/ping", (req, res) => {
  res.json({ success: true, time: new Date().toISOString() });
});

// --- List dispatches ---------------------------------------------------------

router.get("/", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const per = parseInt(req.query.per) || 10;
  const offset = (page - 1) * per;

  const db = new sqlite3.Database(DB_PATH);
  try {
    const totalRow = await getAsync(
      db,
      "SELECT COUNT(*) as cnt FROM dispatches"
    );
    const total = totalRow ? totalRow.cnt : 0;

    const rows = await allAsync(
      db,
      `SELECT d.*, o.orderNumber, u.name as driverName
       FROM dispatches d
       LEFT JOIN orders o ON d.order_id = o.id
       LEFT JOIN users u ON d.driver_id = u.id
       ORDER BY d.updated_at DESC
       LIMIT ? OFFSET ?`,
      [per, offset]
    );

    res.json({ success: true, page, per, total, dispatches: rows });
  } catch (err) {
    console.error("[admin-dispatch:list]", err);
    res
      .status(500)
      .json({ success: false, error: { code: "SQL_ERROR", message: err.message } });
  } finally {
    db.close();
  }
});

// --- Create dispatch ---------------------------------------------------------

router.post("/", async (req, res) => {
  const { order_id, driver_id, status, planned_date, notes } = req.body;
  const db = new sqlite3.Database(DB_PATH);
  try {
    const result = await runAsync(
      db,
      `INSERT INTO dispatches (order_id, driver_id, status, planned_date, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [order_id, driver_id || null, status || "Created", planned_date || null, notes || null]
    );
    res.json({ success: true, id: result.lastID });
  } catch (err) {
    console.error("[admin-dispatch:create]", err);
    res
      .status(500)
      .json({ success: false, error: { code: "SQL_ERROR", message: err.message } });
  } finally {
    db.close();
  }
});

// --- Update dispatch ---------------------------------------------------------

router.patch("/:id", async (req, res) => {
  const id = req.params.id;
  const { status, driver_id, notes, planned_date } = req.body;

  const db = new sqlite3.Database(DB_PATH);
  try {
    const existing = await getAsync(db, "SELECT * FROM dispatches WHERE id = ?", [id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Dispatch not found" } });
    }

    await runAsync(
      db,
      `UPDATE dispatches
       SET status = COALESCE(?, status),
           driver_id = COALESCE(?, driver_id),
           notes = COALESCE(?, notes),
           planned_date = COALESCE(?, planned_date),
           updated_at = datetime('now')
       WHERE id = ?`,
      [status, driver_id, notes, planned_date, id]
    );

    res.json({ success: true, id });
  } catch (err) {
    console.error("[admin-dispatch:update]", err);
    res
      .status(500)
      .json({ success: false, error: { code: "SQL_ERROR", message: err.message } });
  } finally {
    db.close();
  }
});

module.exports = router;
