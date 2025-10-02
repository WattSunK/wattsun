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

  // GET /api/admin/orders
  router.get("/", (req, res) => {
    const q = (req.query.q || "").trim().toLowerCase();
    const status = (req.query.status || "").trim();
    const from = (req.query.from || "").trim();
    const to   = (req.query.to || "").trim();
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const per  = Math.min(100, Math.max(5, parseInt(req.query.per || "15", 10)));

    let where = [];
    let params = [];
    if (q) {
      where.push(`(
        LOWER(orderNumber) LIKE ? OR 
        LOWER(fullName) LIKE ? OR 
        LOWER(email) LIKE ? OR 
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(phone,''), '+',''), ' ', ''), '-', ''), '(', ''), ')', '') LIKE ?
      )`);
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

    res.json({ success: true, page, per, total, orders: rows.map(mapRow) });
  });

  // GET /api/admin/orders/:id
  router.get("/:id", (req, res) => {
    const id = String(req.params.id);
    const row = db.prepare(`SELECT * FROM orders WHERE id = ? OR orderNumber = ?`).get(id, id);
    if (!row) return res.status(404).json({ success: false, error: "Not found" });

    const items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(row.id);
    res.json({ success: true, order: mapRow(row), items });
  });

  // PUT /api/admin/orders/:id
  router.put("/:id", express.json(), (req, res) => {
    const id = String(req.params.id);
    const row = db.prepare(`SELECT * FROM orders WHERE id = ? OR orderNumber = ?`).get(id, id);
    if (!row) return res.status(404).json({ success: false, error: "Not found" });

    const { status, totalCents, depositCents, currency, notes } = req.body || {};
    const newStatus = status || row.status;

    db.prepare(`
      UPDATE orders
         SET status = COALESCE(?, status),
             totalCents = COALESCE(?, totalCents),
             depositCents = COALESCE(?, depositCents),
             currency = COALESCE(?, currency),
             notes = COALESCE(?, notes),
             completed_at = CASE WHEN COALESCE(?, status) = 'Completed' THEN datetime('now') ELSE completed_at END
       WHERE id = ?
    `).run(newStatus, totalCents, depositCents, currency, notes, newStatus, row.id);

    // Optional history insert
    if (newStatus && newStatus !== row.status) {
      try {
        db.prepare(`
          INSERT INTO order_status_history(
            order_id, old_order_status, new_order_status, changed_at
          )
          VALUES (?, ?, ?, datetime('now'))
        `).run(row.id, row.status || '', newStatus);
      } catch (e) {
        console.error("[admin-orders] failed to insert history", e);
      }
    }

    const updated = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(row.id);
    res.json({ success: true, order: mapRow(updated) });
  });

  return router;
};
