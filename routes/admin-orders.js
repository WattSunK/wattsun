// routes/admin-orders.js
const express = require("express");
const router = express.Router();

module.exports = function makeAdminOrders(db) {
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

  router.get("/admin/orders", (req, res) => {
    const q = (req.query.q || "").trim().toLowerCase();
    const status = (req.query.status || "").trim();
    const from = (req.query.from || "").trim();
    const to   = (req.query.to || "").trim();
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const per  = Math.min(100, Math.max(5, parseInt(req.query.per || "15", 10)));

    let where = [];
    let params = [];
    if (q) {
      where.push(`(LOWER(orderNumber) LIKE ? OR LOWER(fullName) LIKE ? OR LOWER(email) LIKE ? OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(phone,''), '+',''), ' ', ''), '-', ''), '(', ''), ')', '') LIKE ?)`);
      const qlike = `%${q}%`;
      const qdigits = q.replace(/\D/g, "");
      params.push(qlike, qlike, qlike, `%${qdigits}%`);
    }
    if (status) { where.push(`status = ?`); params.push(status); }
    if (from)   { where.push(`datetime(createdAt) >= datetime(?)`); params.push(from); }
    if (to)     { where.push(`datetime(createdAt) < datetime(?)`);  params.push(to); }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = db.prepare(`SELECT COUNT(*) AS n FROM orders ${whereSql}`).get(...params).n;
    const off = (page - 1) * per;

    const rows = db.prepare(`
      SELECT * FROM orders
      ${whereSql}
      ORDER BY datetime(createdAt) DESC
      LIMIT ? OFFSET ?
    `).all(...params, per, off);

    res.json({ success: true, total, orders: rows.map(mapRow) });
  });

  router.get("/admin/orders/:id", (req, res) => {
    const id = String(req.params.id);
    const row = db.prepare(`SELECT * FROM orders WHERE id = ? OR orderNumber = ?`).get(id, id);
    if (!row) return res.status(404).json({ success: false, error: "Not found" });
    const items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(row.id);
    res.json({ success: true, order: mapRow(row), items });
  });

  router.put("/admin/orders/:id", express.json(), (req, res) => {
    const id = String(req.params.id);
    const row = db.prepare(`SELECT * FROM orders WHERE id = ? OR orderNumber = ?`).get(id, id);
    if (!row) return res.status(404).json({ success: false, error: "Not found" });

    const { status, totalCents, depositCents, currency, notes } = req.body || {};
    const newStatus = status || row.status;

    const upd = db.prepare(`
      UPDATE orders
         SET status = COALESCE(?, status),
             totalCents = COALESCE(?, totalCents),
             depositCents = COALESCE(?, depositCents),
             currency = COALESCE(?, currency),
             notes = COALESCE(?, notes),
             completed_at = CASE WHEN COALESCE(?, status) = 'Completed' THEN datetime('now') ELSE completed_at END
       WHERE id = ?
    `);
    upd.run(newStatus, totalCents, depositCents, currency, notes, newStatus, row.id);

    if (newStatus && newStatus !== row.status) {
      try {
        db.prepare(`
          INSERT INTO order_status_history(order_id, from_status, to_status, changed_at)
          VALUES (?, ?, ?, datetime('now'))
        `).run(row.id, row.status || '', newStatus);
      } catch {}
    }
    const updated = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(row.id);
    res.json({ success: true, order: mapRow(updated) });
  });

  return router;
};
