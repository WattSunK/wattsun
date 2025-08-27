// routes/admin-users.js
// Admin Users routes:
//  - GET    /api/admin/users?type=Driver   → list users
//  - POST   /api/admin/users               → create user
//  - PUT    /api/admin/users/:id           → update user (deterministic; used by admin UI)
//  - PATCH  /api/admin/users/:id           → update user (alias)

const express = require("express");
const router = express.Router();

function getDb(req) {
  const db = req.app.get("db");
  if (!db) throw new Error("SQLite database handle not found (app.set('db', ...) missing)");
  return db;
}

// Promisified sqlite helpers
function all(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (e, rows) => (e ? reject(e) : resolve(rows))));
}
function get(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (e, row) => (e ? reject(e) : resolve(row))));
}
function run(db, sql, params = []) {
  return new Promise((resolve, reject) =>
    db.run(sql, params, function (e) {
      if (e) return reject(e);
      resolve({ changes: this.changes, lastID: this.lastID });
    })
  );
}

function mapRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    type: r.type,
    status: r.status || "Active",
    createdAt: r.created_at || null,
  };
}

// GET /api/admin/users?type=Driver
router.get("/", async (req, res) => {
  const db = getDb(req);
  const { type = "" } = req.query;
  try {
    const rows = type
      ? await all(db, `SELECT id,name,email,phone,type,status,created_at FROM users WHERE type = ?`, [type])
      : await all(db, `SELECT id,name,email,phone,type,status,created_at FROM users`, []);
    return res.json({ success: true, users: rows.map(mapRow) });
  } catch (err) {
    console.error("GET /api/admin/users failed:", err);
    return res.status(500).json({ success: false, users: [] });
  }
});

// POST /api/admin/users
router.post("/", async (req, res) => {
  const db = getDb(req);
  const { name = "", email = "", phone = "", type = "", status = "Active" } = req.body || {};
  if (!name || !phone || !type) {
    return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "name, phone, type required" } });
  }
  try {
    const now = new Date().toISOString();
    const ins = await run(
      db,
      `INSERT INTO users (name,email,phone,type,status,created_at) VALUES (?,?,?,?,?,?)`,
      [name, email, phone, type, status, now]
    );
    const row = await get(db, `SELECT id,name,email,phone,type,status,created_at FROM users WHERE id = ?`, [ins.lastID]);
    return res.json({ success: true, user: mapRow(row) });
  } catch (err) {
    console.error("POST /api/admin/users failed:", err);
    return res.status(500).json({ success: false, error: { code: "SERVER", message: err.message } });
  }
});

// PUT/PATCH /api/admin/users/:id
router.put("/:id", (req, res) => updateUser(req, res, "PUT"));
router.patch("/:id", (req, res) => updateUser(req, res, "PATCH"));

async function updateUser(req, res, verb) {
  const db = getDb(req);
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "missing id" } });

  const { name, email, phone, type, status /*, password*/ } = req.body || {};
  const sets = [];
  const params = [];

  if (name != null) { sets.push("name = ?");   params.push(String(name)); }
  if (email != null){ sets.push("email = ?");  params.push(String(email)); }
  if (phone != null){ sets.push("phone = ?");  params.push(String(phone)); }
  if (type != null) { sets.push("type = ?");   params.push(String(type)); }
  if (status != null){sets.push("status = ?"); params.push(String(status)); }

  // Password handling is schema-dependent (hashing). Left intentionally as a TODO.

  if (!sets.length) {
    return res.status(400).json({ success: false, error: { code: "NO_FIELDS", message: "No updatable fields provided" } });
  }

  try {
    await run(db, `UPDATE users SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [...params, id]);
    const row = await get(db, `SELECT id,name,email,phone,type,status,created_at FROM users WHERE id = ?`, [id]);
    if (!row) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } });
    return res.json({ success: true, user: mapRow(row) });
  } catch (err) {
    console.error(`${verb} /api/admin/users/${id} failed:`, err);
    return res.status(500).json({ success: false, error: { code: "SERVER", message: err.message } });
  }
}

module.exports = router;
