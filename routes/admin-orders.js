// routes/admin-orders.js
// Phase 6.5 — polish: accept driverId in PATCH, validate statuses

const express = require("express");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const router = express.Router();

const USERS_DB = process.env.DB_PATH_USERS || process.env.SQLITE_DB || path.join(__dirname, "../data/dev/wattsun.dev.db");
// Overlay table lives in Users DB (see SSOT). 
const db = new sqlite3.Database(USERS_DB);

const ALLOWED_STATUSES = [
  "Pending",
  "Confirmed",
  "Dispatched",
  "Delivered",
  "Closed",
  "Cancelled",
]; // ADR-001 

// Ensure overlay table
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS admin_order_meta (
      order_id   TEXT PRIMARY KEY,
      status     TEXT NOT NULL,
      driver_id  INTEGER,
      notes      TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// Middleware: require admin (simple cookie/session guard placeholder)
function requireAdmin(req, res, next) {
  try {
    const u = req.session?.user || req.user || null;
    if (!u || String((u.role || u.type || "")).toLowerCase() !== "admin") {
      return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Admin only" } });
    }
    next();
  } catch {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Admin only" } });
  }
}

router.use(express.json(), express.urlencoded({ extended: true }));
router.use(requireAdmin);

// --- List (kept minimal; assumes an upstream order source already exists) ---
router.get("/orders", async (req, res) => {
  // This endpoint’s existing logic is assumed; keeping behavior unchanged intentionally.
  // If you’ve got a facade/adapter merging overlay + base orders, keep it as-is.
  res.status(501).json({ success: false, error: { code: "NOT_IMPLEMENTED", message: "Delegated in server.js / existing route." } });
});

// --- PATCH /api/admin/orders/:id  (status, driverId, notes) ---
router.patch("/orders/:id", (req, res) => {
  const orderId = String(req.params.id || "").trim();
  let { status, driverId, notes } = req.body || {};

  // Validation (surgical and explicit)
  if (status && !ALLOWED_STATUSES.includes(status)) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_STATUS", message: `Status must be one of: ${ALLOWED_STATUSES.join(", ")}` },
    });
  }

  if (driverId !== undefined && driverId !== null && driverId !== "") {
    const n = Number(driverId);
    if (!Number.isInteger(n) || n < 0) {
      return res.status(400).json({
        success: false,
        error: { code: "BAD_DRIVER", message: "driverId must be a positive integer" },
      });
    }
    driverId = n;
  } else {
    driverId = null;
  }

  notes = typeof notes === "string" ? notes.trim() : null;

  // Upsert overlay
  const upsertSql = `
    INSERT INTO admin_order_meta (order_id, status, driver_id, notes, updated_at)
    VALUES (?, COALESCE(?, 'Pending'), ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(order_id) DO UPDATE SET
      status = COALESCE(excluded.status, admin_order_meta.status),
      driver_id = excluded.driver_id,
      notes = COALESCE(excluded.notes, admin_order_meta.notes),
      updated_at = CURRENT_TIMESTAMP
  `;

  db.run(upsertSql, [orderId, status || "Pending", driverId, notes], function (err) {
    if (err) {
      return res.status(500).json({ success: false, error: { code: "DB_ERROR", message: err.message } });
    }
    // Respond in the shape we’ve been using in admin UI (success + minimal order patch)
    return res.json({
      success: true,
      order: { id: orderId, orderNumber: orderId, status: status || "Pending", driverId, notes: notes || null },
      message: "Order updated",
    });
  });
});

module.exports = router;
