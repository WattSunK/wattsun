// routes/admin-orders.js
const express = require("express");
const router = express.Router();
const Database = require("better-sqlite3");

// DB path (adjust if needed)
const DB_PATH = "/volume1/web/wattsun/data/dev/wattsun.dev.db";
const db = new Database(DB_PATH, { fileMustExist: true });

// --- DEBUG IDENT ---
const ROUTE_VERSION = "admin-orders:v3-logging-2025-10-02T19:40Z";
console.log("[admin-orders] ROUTE FILE LOADED:", __filename, "version:", ROUTE_VERSION);

// ----------------- helpers -----------------
function toNumOrNeg1(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : -1;
}
function nowIso() {
  return new Date().toISOString();
}
function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id ?? null,
    orderNumber: row.orderNumber ?? null,
    fullName: row.fullName ?? null,
    phone: row.phone ?? null,
    email: row.email ?? null,
    status: row.status ?? "Pending",
    createdAt: row.createdAt ?? null,
    totalCents: row.totalCents ?? null,
    depositCents: row.depositCents ?? null,
    currency: row.currency ?? "KES",
    notes: row.notes ?? null,
    address: row.address ?? null,
    driverId: row.driverId ?? null,
  };
}
function mergeOverlay(base, overlay) {
  if (!overlay) return base;
  const out = { ...base };
  if (overlay.statusOverlay) out.status = overlay.statusOverlay;
  if (overlay.driverIdOverlay !== null && overlay.driverIdOverlay !== undefined)
    out.driverId = overlay.driverIdOverlay;
  if (overlay.notes !== undefined) out.notes = overlay.notes;
  if (overlay.totalCentsOverlay !== null && overlay.totalCentsOverlay !== undefined)
    out.totalCents = overlay.totalCentsOverlay;
  if (overlay.depositCentsOverlay !== null && overlay.depositCentsOverlay !== undefined)
    out.depositCents = overlay.depositCentsOverlay;
  if (overlay.currencyOverlay) out.currency = overlay.currencyOverlay;
  return out;
}

// ----------------- version endpoint -----------------
router.get("/__version", (req, res) => {
  res.json({
    ok: true,
    version: ROUTE_VERSION,
    file: __filename,
    dbPath: DB_PATH,
    pid: process.pid,
  });
});

// ----------------- LIST -----------------
router.get("/", (req, res) => {
  try {
    const page = parseInt(req.query.page || "1", 10);
    const per = parseInt(req.query.per || "10", 10);
    const offset = (page - 1) * per;

    const totalRow = db.prepare("SELECT COUNT(*) AS n FROM orders").get();
    const rows = db
      .prepare("SELECT * FROM orders ORDER BY datetime(createdAt) DESC LIMIT ? OFFSET ?")
      .all(per, offset);

    res.json({
      success: true,
      page,
      per,
      total: totalRow.n,
      orders: rows.map(mapRow),
    });
  } catch (err) {
    console.error("[admin-orders] GET / failed:", err);
    res.status(500).json({ success: false, error: "SERVER_ERROR" });
  }
});

// ----------------- DETAIL with logging -----------------
router.get("/:id", (req, res) => {
  try {
    const key = String(req.params.id || "").trim();
    const byNumeric = toNumOrNeg1(key);
    console.log("[admin-orders][GET detail] key =", key, "byNumeric =", byNumeric);

    const base = db
      .prepare("SELECT * FROM orders WHERE id = ? OR orderNumber = ?")
      .get(byNumeric, key);
    console.log("[admin-orders][GET detail] base =", base);

    if (!base) {
      console.warn("[admin-orders][GET detail] NOT_FOUND for", key);
      return res.status(404).json({ success: false, error: "NOT_FOUND" });
    }

    const overlay = db
      .prepare(
        `SELECT 
           notes,
           total_cents   AS totalCentsOverlay,
           deposit_cents AS depositCentsOverlay,
           currency      AS currencyOverlay,
           driver_id     AS driverIdOverlay,
           status        AS statusOverlay,
           updated_at
         FROM admin_order_meta
         WHERE order_id = ?`
      )
      .get(base.orderNumber);
    console.log("[admin-orders][GET detail] overlay =", overlay);

    const merged = mergeOverlay(base, overlay);
    console.log("[admin-orders][GET detail] merged =", merged);

    return res.json({ success: true, order: mapRow(merged) });
  } catch (err) {
    console.error("[admin-orders][GET detail] ERROR:", err);
    res.status(500).json({ success: false, error: "SERVER_ERROR" });
  }
});

// ----------------- CREATE -----------------
router.post("/", express.json(), (req, res) => {
  try {
    const body = req.body || {};

    const fullName = body.fullName ?? body.customerName ?? body.name;
    const phone = body.phone;
    const email = body.email ?? null;
    const status = body.status ?? "Pending";
    const currency = (body.currency || "KES").toUpperCase();
    const totalCents = Number.isFinite(+body.totalCents) ? +body.totalCents : null;
    const depositCents = Number.isFinite(+body.depositCents) ? +body.depositCents : null;
    const address = body.address ?? null;
    const driverId =
      body.driverId === undefined || body.driverId === "" ? null : body.driverId;
    const notes = body.notes ?? null;

    if (!fullName || !phone) {
      return res.status(400).json({ success: false, error: "REQUIRED_FIELDS" });
    }

    const orderNumber = "WATT" + Date.now();

    db.prepare(
      `INSERT INTO orders 
         (orderNumber, fullName, phone, email, status, totalCents, depositCents, currency, address, driverId, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(
      orderNumber,
      fullName,
      phone,
      email,
      status,
      totalCents,
      depositCents,
      currency,
      address,
      driverId
    );

    db.prepare(
      `INSERT INTO admin_order_meta (order_id, status, driver_id, notes, total_cents, deposit_cents, currency, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(order_id) DO UPDATE SET
         status        = COALESCE(excluded.status, admin_order_meta.status),
         driver_id     = COALESCE(excluded.driver_id, admin_order_meta.driver_id),
         notes         = COALESCE(excluded.notes, admin_order_meta.notes),
         total_cents   = COALESCE(excluded.total_cents, admin_order_meta.total_cents),
         deposit_cents = COALESCE(excluded.deposit_cents, admin_order_meta.deposit_cents),
         currency      = COALESCE(excluded.currency, admin_order_meta.currency),
         updated_at    = excluded.updated_at`
    ).run(
      orderNumber,
      status,
      driverId,
      notes,
      totalCents,
      depositCents,
      currency,
      nowIso()
    );

    return res.json({ success: true, orderNumber });
  } catch (err) {
    console.error("[admin-orders] POST / failed:", err);
    res.status(500).json({ success: false, error: "SERVER_ERROR" });
  }
});

// ----------------- UPDATE -----------------
router.patch("/:id", express.json(), (req, res) => {
  try {
    const key = String(req.params.id || "").trim();
    const byNumeric = toNumOrNeg1(key);
    const body = req.body || {};

    const base = db
      .prepare("SELECT id, orderNumber FROM orders WHERE id = ? OR orderNumber = ?")
      .get(byNumeric, key);
    if (!base) {
      return res.status(404).json({ success: false, error: "NOT_FOUND" });
    }

    // Base updates
    const set = [];
    const vals = [];
    if ("status" in body) { set.push("status = ?"); vals.push(body.status); }
    if ("totalCents" in body) { set.push("totalCents = ?"); vals.push(+body.totalCents || null); }
    if ("depositCents" in body) { set.push("depositCents = ?"); vals.push(+body.depositCents || null); }
    if ("currency" in body) { set.push("currency = ?"); vals.push((body.currency || "KES").toUpperCase()); }
    if ("address" in body) { set.push("address = ?"); vals.push(body.address ?? null); }
    if ("driverId" in body) { set.push("driverId = ?"); vals.push(body.driverId || null); }

    if (set.length) {
      const sql = `UPDATE orders SET ${set.join(", ")} WHERE id = ? OR orderNumber = ?`;
      db.prepare(sql).run(...vals, byNumeric, key);
    }

    // Overlay updates
    const overlaySet = [];
    const overlayVals = [];
    if ("status" in body) { overlaySet.push("status = ?"); overlayVals.push(body.status); }
    if ("driverId" in body) { overlaySet.push("driver_id = ?"); overlayVals.push(body.driverId || null); }
    if ("notes" in body) { overlaySet.push("notes = ?"); overlayVals.push(body.notes ?? null); }
    if ("totalCents" in body) { overlaySet.push("total_cents = ?"); overlayVals.push(+body.totalCents || null); }
    if ("depositCents" in body) { overlaySet.push("deposit_cents = ?"); overlayVals.push(+body.depositCents || null); }
    if ("currency" in body) { overlaySet.push("currency = ?"); overlayVals.push((body.currency || "KES").toUpperCase()); }

    if (overlaySet.length) {
      db.prepare(
        `INSERT OR IGNORE INTO admin_order_meta (order_id, status, updated_at)
         VALUES (?, ?, ?)`
      ).run(base.orderNumber, body.status ?? null, nowIso());

      const sql = `UPDATE admin_order_meta SET ${overlaySet.join(", ")}, updated_at = ? WHERE order_id = ?`;
      db.prepare(sql).run(...overlayVals, nowIso(), base.orderNumber);
    }

    const freshBase = db
      .prepare("SELECT * FROM orders WHERE id = ? OR orderNumber = ?")
      .get(byNumeric, key);
    const freshOverlay = db
      .prepare(
        `SELECT 
           notes,
           total_cents   AS totalCentsOverlay,
           deposit_cents AS depositCentsOverlay,
           currency      AS currencyOverlay,
           driver_id     AS driverIdOverlay,
           status        AS statusOverlay
         FROM admin_order_meta WHERE order_id = ?`
      )
      .get(freshBase.orderNumber);

    const merged = mergeOverlay(freshBase, freshOverlay);
    return res.json({ success: true, order: mapRow(merged) });
  } catch (err) {
    console.error("[admin-orders] PATCH /:id failed:", err);
    res.status(500).json({ success: false, error: "SERVER_ERROR" });
  }
});

module.exports = router;
