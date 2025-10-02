// routes/admin-orders.js
const express = require("express");
const router = express.Router();
const db = require("../db"); // adjust path if your db.js is elsewhere

// Helper: map DB row to API response
function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    fullName: row.fullName,
    phone: row.phone,
    email: row.email,
    status: row.status,
    createdAt: row.createdAt,
    totalCents: row.totalCents,
    depositCents: row.depositCents,
    currency: row.currency,
    notes: row.notes
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
      orders: rows.map(mapRow)
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

module.exports = router;
