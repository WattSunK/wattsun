// routes/users.js
// GET /api/users?type=Driver → list users (used for driver dropdown)

const express = require("express");
const router = express.Router();

function getDb(req) {
  const db = req.app.get("db");
  if (!db) throw new Error("SQLite database handle not found");
  return db;
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (e, rows) => e ? reject(e) : resolve(rows)));
}

router.get("/", async (req, res) => {
  const db = getDb(req);
  const { type = "" } = req.query;

  try {
    let rows;
    if (type) {
      rows = await all(db, `SELECT id, name, email, phone, type, status, created_at FROM users WHERE type = ?`, [type]);
    } else {
      rows = await all(db, `SELECT id, name, email, phone, type, status, created_at FROM users`, []);
    }

    return res.json({
      success: true,
      users: rows.map(r => ({
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        type: r.type,
        status: r.status || "Active",
        createdAt: r.created_at || null,
      })),
    });
  } catch (err) {
    console.error("GET /api/users failed:", err);
    return res.status(500).json({ success: false, users: [] });
  }
});

module.exports = router;
