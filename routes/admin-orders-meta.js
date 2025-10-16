// routes/admin-orders-meta.js
// GET /api/admin/orders/meta?ids=1&ids=2 → overlay meta for those order IDs

const express = require("express");
const router = express.Router();

function getDb(req) {
  const db = req.app.get("db");
  if (!db) throw new Error("SQLite db not set (app.set('db', ...))");
  return db;
}

// supports repeated ids or comma-separated ids
router.get("/", async (req, res) => {
  const ids = []
    .concat(req.query.ids || [])
    .flatMap(v => String(v).split(","))
    .map(s => s.trim())
    .filter(Boolean);

  if (ids.length === 0) return res.json({ success: true, meta: [] });

  // build (?, ?, ?) list
  const placeholders = ids.map(() => "?").join(",");
  const db = getDb(req);

  try {
    const rows = db
      .prepare(`SELECT m.order_id AS id, m.status, m.driver_id AS driverId, m.notes, m.updated_at AS updatedAt,
                       u.name AS driverName
                  FROM admin_order_meta m
                  LEFT JOIN users u ON u.id = m.driver_id
                 WHERE m.order_id IN (${placeholders})`)
      .all(...ids);
    return res.json({ success: true, meta: rows });
  } catch (e) {
    console.error("GET /api/admin/orders/meta failed:", e);
    return res.status(500).json({ success: false, meta: [] });
  }
});

module.exports = router;
