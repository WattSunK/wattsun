// routes/admin-orders.js
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

  // 🔎 Test route to confirm mount + auth works
  router.get("/_ping", (req, res) => {
    console.log("[admin-orders] _ping hit, session user:", req.session?.user);
    res.json({ success: true, message: "admin-orders router is alive" });
  });

  // GET /api/admin/orders
  router.get("/", (req, res) => {
    try {
      console.log("[admin-orders] GET / hit, session user:", req.session?.user);

      const page = Math.max(1, parseInt(req.query.page || "1", 10));
      const per = Math.min(100, Math.max(5, parseInt(req.query.per || "20", 10)));
      const off = (page - 1) * per;

      const totalRow = db.prepare("SELECT COUNT(*) AS n FROM orders").get();
      const rows = db
        .prepare(
          `SELECT * FROM orders
           ORDER BY datetime(createdAt) DESC
           LIMIT ? OFFSET ?`
        )
        .all(per, off);

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
      const id = String(req.params.id);
      console.log("[admin-orders] GET /:id hit:", id);

      const row = db
        .prepare("SELECT * FROM orders WHERE id = ? OR orderNumber = ?")
        .get(id, id);

      if (!row) {
        return res.status(404).json({ success: false, error: "Not found" });
      }

      const items = db
        .prepare("SELECT * FROM order_items WHERE order_id = ?")
        .all(row.id);

      res.json({ success: true, order: mapRow(row), items });
    } catch (e) {
      console.error("[admin-orders] GET /:id failed:", e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // PUT /api/admin/orders/:id
  router.put("/:id", express.json(), (req, res) => {
    try {
      const id = String(req.params.id);
      console.log("[admin-orders] PUT /:id hit:", id);

      const row = db
        .prepare("SELECT * FROM orders WHERE id = ? OR orderNumber = ?")
        .get(id, id);
      if (!row) return res.status(404).json({ success: false, error: "Not found" });

      const { status, totalCents, depositCents, currency, notes } = req.body || {};
      const newStatus = status || row.status;

      db.prepare(
        `UPDATE orders
           SET status = COALESCE(?, status),
               totalCents = COALESCE(?, totalCents),
               depositCents = COALESCE(?, depositCents),
               currency = COALESCE(?, currency),
               notes = COALESCE(?, notes),
               completed_at = CASE WHEN COALESCE(?, status) = 'Completed'
                                   THEN datetime('now')
                                   ELSE completed_at END
         WHERE id = ?`
      ).run(newStatus, totalCents, depositCents, currency, notes, newStatus, row.id);

      if (newStatus && newStatus !== row.status) {
        try {
          db.prepare(
            `INSERT INTO order_status_history(
               order_id, old_order_status, new_order_status, changed_at
             )
             VALUES (?, ?, ?, datetime('now'))`
          ).run(row.id, row.status || "", newStatus);
        } catch (e) {
          console.error("[admin-orders] failed to insert history:", e);
        }
      }

      const updated = db.prepare("SELECT * FROM orders WHERE id = ?").get(row.id);
      res.json({ success: true, order: mapRow(updated) });
    } catch (e) {
      console.error("[admin-orders] PUT /:id failed:", e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  return router;
};
