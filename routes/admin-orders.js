// routes/admin-orders.js — with tracer logs
const express = require("express");

module.exports = function makeAdminOrders(db) {
  const router = express.Router();

  function mapRow(row) {
    return {
      id: row.id,
      orderNumber: row.orderNumber || row.id,
      fullName: row.fullName,
      email: row.email,
      phone: row.phone,
      status: row.status,
      totalCents: row.totalCents,
      depositCents: row.depositCents,
      currency: row.currency || "KES",
      createdAt: row.createdAt,
      completed_at: row.completed_at
    };
  }

   // GET /
 router.get("/", (req, res) => {
  console.log("[admin-orders] GET / orders hit");
  try {
    const page = parseInt(req.query.page || "1", 10);
    const per = parseInt(req.query.per || "10", 10); // default 10
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

  return router;
};
