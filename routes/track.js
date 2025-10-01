// routes/track.js
const express = require("express");
const router = express.Router();

module.exports = function makeTrack(db) {
  router.get("/track", (req, res) => {
    const phone = String(req.query.phone || "").replace(/\D/g, "");
    const email = String(req.query.email || "").toLowerCase();

    let where = [];
    let params = [];
    if (phone) {
      where.push(`REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(phone,''), '+',''), ' ', ''), '-', ''), '(', ''), ')', '') LIKE ?`);
      params.push(`%${phone}%`);
    }
    if (email) {
      where.push(`LOWER(email) = ?`);
      params.push(email);
    }
    const whereSql = where.length ? `WHERE ${where.join(" OR ")}` : "";
    const rows = db.prepare(`
      SELECT id, orderNumber, fullName, email, phone, status, totalCents, depositCents, currency, createdAt
      FROM orders
      ${whereSql}
      ORDER BY datetime(createdAt) DESC
      LIMIT 20
    `).all(...params);

    const out = rows.map(r => ({
      orderNumber: r.orderNumber || r.id,
      fullName: r.fullName,
      email: r.email,
      phone: r.phone,
      status: r.status,
      total: Math.round(r.totalCents || 0) / 100,      // optional display
      deposit: Math.round(r.depositCents || 0) / 100,  // optional display
      timestamp: r.createdAt
    }));

    res.json({ success: true, orders: out });
  });

  return router;
};
