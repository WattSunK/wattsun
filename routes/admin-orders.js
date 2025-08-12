// routes/admin-orders.js
// PATCH /api/admin/orders/:id  → persist status/driver/notes in SQLite overlay table

const express = require("express");
const router = express.Router();

const ALLOWED_STATUS = new Set(["Pending", "Processing", "Delivered", "Cancelled"]);

function getDb(req) {
  const db = req.app.get("db");
  if (!db) throw new Error("SQLite database handle not found (app.set('db', db))");
  return db;
}

// Ensure overlay table exists once
function ensureMetaTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS admin_order_meta (
      order_id   TEXT PRIMARY KEY,
      status     TEXT NOT NULL,
      driver_id  INTEGER,
      notes      TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}
function get(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (e, row) => e ? reject(e) : resolve(row)));
}

router.patch("/:id", async (req, res) => {
  const db = getDb(req);
  ensureMetaTable(db);

  const orderId = String(req.params.id || "").trim();
  let { status, driverId = null, notes = "" } = req.body || {};

  if (!orderId) return res.status(400).json({ success: false, error: "Missing order id" });
  if (!status || !ALLOWED_STATUS.has(String(status))) {
    return res.status(400).json({ success: false, error: "Invalid status" });
  }

  // Coerce driverId → integer or null
  if (driverId === "" || driverId === undefined || driverId === null) {
    driverId = null;
  } else {
    const n = parseInt(driverId, 10);
    driverId = Number.isFinite(n) ? n : null;
  }

  try {
    // Optional validation: if a driver is provided, ensure the user exists and is a Driver
    let driver = null;
    if (driverId !== null) {
      driver = await get(db, "SELECT id, name, type FROM users WHERE id = ?", [driverId]);
      if (!driver) {
        return res.status(400).json({ success: false, error: "Selected driver not found" });
      }
      if (String(driver.type).toLowerCase() !== "driver") {
        return res.status(400).json({ success: false, error: "Selected user is not a Driver" });
      }
    }

    // Manual insert-or-update (compatible with older SQLite)
    const existing = await get(db, "SELECT order_id FROM admin_order_meta WHERE order_id = ?", [orderId]);
    if (existing) {
      await run(
        db,
        "UPDATE admin_order_meta SET status = ?, driver_id = ?, notes = ?, updated_at = datetime('now') WHERE order_id = ?",
        [String(status), driverId, String(notes || ""), orderId]
      );
    } else {
      await run(
        db,
        "INSERT INTO admin_order_meta (order_id, status, driver_id, notes, updated_at) VALUES (?, ?, ?, ?, datetime('now'))",
        [orderId, String(status), driverId, String(notes || "")]
      );
    }

    return res.json({
      success: true,
      order: {
        id: orderId,
        status: String(status),
        driverId,
        driverName: driver ? driver.name : null,
        notes: String(notes || ""),
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("PATCH /api/admin/orders/:id failed:", err);
    return res.status(500).json({ success: false, error: "Database error" });
  }
});

module.exports = router;
