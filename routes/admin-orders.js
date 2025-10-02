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

  // tracer ping
  router.get("/_ping", (req, res) => {
    console.log("[admin-orders] _ping route hit, session.user:", req.session?.user);
    res.json({ success: true, message: "admin-orders router alive" });
  });

  // GET /
  router.get("/", (req, res) => {
    console.log("[admin-orders] GET / orders hit");
    try {
      const totalRow = db.prepare("SELECT COUNT(*) AS n FROM orders").get();
      const rows = db
        .prepare("SELECT * FROM orders ORDER BY datetime(createdAt) DESC LIMIT 5")
        .all();

      console.log("[admin-orders] returning", rows.length, "rows");
      res.json({ success: true, total: totalRow.n, orders: rows.map(mapRow) });
    } catch (e) {
      console.error("[admin-orders] GET / failed:", e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  return router;
};
