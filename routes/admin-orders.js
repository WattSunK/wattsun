// routes/admin-orders.js
const express = require("express");
const router = express.Router();
const Database = require("better-sqlite3");

// Direct DB connection (adjust path if needed)
const db = new Database("/volume1/web/wattsun/data/dev/wattsun.dev.db");

// Helper: safely map a DB row to API response
function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id ?? null,
    orderNumber: row.orderNumber ?? null,
    fullName: row.fullName ?? row.customerName ?? null,
    phone: row.phone ?? null,
    email: row.email ?? null,
    status: row.status ?? "Pending",
    createdAt: row.createdAt ?? null,
    totalCents: row.totalCents ?? null,
    depositCents: row.depositCents ?? null,
    currency: row.currency ?? "KES",
    notes: row.notes ?? null,
  };
}

// GET /api/admin/orders?page=&per=
router.get("/", (req, res) => {
  console.log("[admin-orders] GET / orders hit");
  try {
    const page = parseInt(req.query.page || "1", 10);
    const per = parseInt(req.query.per || "10", 10);
    const offset = (page - 1) * per;

    const totalRow = db.prepare("SELECT COUNT(*) AS n FROM orders").get();
    const rows = db
      .prepare("SELECT * FROM orders ORDER BY datetime(createdAt) DESC LIMIT ? OFFSET ?")
      .all(per, offset);

    console.log("[admin-orders] returning", rows.length, "rows");

    res.json({
      success: true,
      page,
      per,
      total: totalRow.n,
      orders: rows.map(mapRow),
    });
  } catch (e) {
    console.error("[admin-orders] GET / failed:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/admin/orders/:id
router.get("/:id", (req, res) => {
  try {
    const id = req.params.id;
    console.log("[admin-orders] detail lookup for", id);

    const row = db
      .prepare("SELECT * FROM orders WHERE id = ? OR orderNumber = ?")
      .get(id, id);

    if (!row) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    res.json({ success: true, order: mapRow(row) });
  } catch (e) {
    console.error("[admin-orders] GET /:id failed:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/admin/orders
router.post("/", express.json(), (req, res) => {
  try {
    const { fullName, phone, email, status, totalCents, depositCents, currency, notes } = req.body;
    const orderNumber = "WATT" + Date.now(); // simple generator

    db.prepare(
      `INSERT INTO orders 
        (orderNumber, fullName, phone, email, status, totalCents, depositCents, currency, notes, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(orderNumber, fullName, phone, email, status, totalCents, depositCents, currency, notes);

    console.log("[admin-orders] inserted order", orderNumber);
    res.json({ success: true, orderNumber });
  } catch (e) {
    console.error("[admin-orders] POST / failed:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// PATCH /api/admin/orders/:id
router.patch("/:id", express.json(), (req, res) => {
  try {
    const id = req.params.id;
    const { status, totalCents, depositCents, currency, notes, driverId } = req.body;

    const result = db.prepare(
      `UPDATE orders 
       SET status = ?, totalCents = ?, depositCents = ?, currency = ?, notes = ?, driverId = ?
       WHERE id = ? OR orderNumber = ?`
    ).run(status, totalCents, depositCents, currency, notes, driverId, id, id);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    console.log("[admin-orders] updated order", id);
    res.json({ success: true });
  } catch (e) {
    console.error("[admin-orders] PATCH /:id failed:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
