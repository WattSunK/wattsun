// routes/admin-users.js
// Admin Users routes:
//  - GET    /api/admin/users?type=Driver
//  - POST   /api/admin/users
//  - PUT    /api/admin/users/:id
//  - PATCH  /api/admin/users/:id
//  - PATCH  /api/admin/users/:id/status   (status only)

const express = require("express");
const router = express.Router();

// --- Step7 guard injected (2025-08-29) ---
function requireAdmin(req, res, next) {
  const u = (req.session && req.session.user) || null;
  if (!u || (u.type !== "Admin" && u.role !== "Admin")) {
    return res.status(403).json({ success:false, error:"Forbidden" });
  }
  next();
}
router.use(requireAdmin);
// --- end guard ---


function getDb(req) {
  const db = req.app.get("db");
  if (!db) throw new Error("SQLite handle missing (app.set('db', ...) not set)");
  return db;
}

// sqlite helpers (promisified)
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

async function columnExists(db, table, name) {
  const cols = await all(db, `PRAGMA table_info(${table})`);
  return cols.some(c => String(c.name).toLowerCase() === String(name).toLowerCase());
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
    createdAt: r.created_at || r.createdAt || null,
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
    const hasCreatedAt = await columnExists(db, "users", "created_at");

    const cols = ["name", "email", "phone", "type", "status"];
    const vals = [name, email, phone, type, status];
    if (hasCreatedAt) {
      cols.push("created_at");
      vals.push(new Date().toISOString());
    }

    const placeholders = cols.map(() => "?").join(",");
    await run(db, `INSERT INTO users (${cols.join(",")}) VALUES (${placeholders})`, vals);

    const row = await get(
      db,
      `SELECT id,name,email,phone,type,status,created_at FROM users ORDER BY id DESC LIMIT 1`,
      []
    );
    return res.json({ success: true, user: mapRow(row) });
  } catch (err) {
    console.error("POST /api/admin/users failed:", err);
    return res.status(500).json({ success: false, error: { code: "SERVER", message: err.message } });
  }
});

// PUT /api/admin/users/:id  (admin UI uses this)
router.put("/:id", (req, res) => updateUser(req, res, "PUT"));

// PATCH /api/admin/users/:id (alias)
router.patch("/:id", (req, res) => updateUser(req, res, "PATCH"));

async function updateUser(req, res, verb) {
  const db = getDb(req);
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "missing id" } });

  const { name, email, phone, type, status /*, password*/ } = req.body || {};
  const sets = [];
  const params = [];

  if (name != null)   { sets.push("name = ?");   params.push(String(name)); }
  if (email != null)  { sets.push("email = ?");  params.push(String(email)); }
  if (phone != null)  { sets.push("phone = ?");  params.push(String(phone)); }
  if (type != null)   { sets.push("type = ?");   params.push(String(type)); }
  if (status != null) { sets.push("status = ?"); params.push(String(status)); }

  // Optional timestamp column — only if it exists
  const hasUpdatedAt = await columnExists(db, "users", "updated_at");
  if (hasUpdatedAt) sets.push("updated_at = CURRENT_TIMESTAMP");

  if (!sets.length) {
    return res.status(400).json({ success: false, error: { code: "NO_FIELDS", message: "No updatable fields provided" } });
  }

  try {
    await run(db, `UPDATE users SET ${sets.join(", ")} WHERE id = ?`, [...params, id]);
    const row = await get(db, `SELECT id,name,email,phone,type,status,created_at FROM users WHERE id = ?`, [id]);
    if (!row) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } });
    return res.json({ success: true, user: mapRow(row) });
  } catch (err) {
    console.error(`${verb} /api/admin/users/${id} failed:`, err);
    return res.status(500).json({ success: false, error: { code: "SERVER", message: err.message } });
  }
}

// PATCH /api/admin/users/:id/status  (used by “Deactivate” flow)
router.patch("/:id/status", async (req, res) => {
  const db = getDb(req);
  const id = String(req.params.id || "").trim();
  const { status = "Inactive" } = req.body || {};
  if (!id) return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "missing id" } });

  try {
    await run(db, `UPDATE users SET status = ? WHERE id = ?`, [String(status), id]);
    const row = await get(db, `SELECT id,name,email,phone,type,status,created_at FROM users WHERE id = ?`, [id]);
    if (!row) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } });
    return res.json({ success: true, user: mapRow(row) });
  } catch (err) {
    console.error(`PATCH /api/admin/users/${id}/status failed:`, err);
    return res.status(500).json({ success: false, error: { code: "SERVER", message: err.message } });
  }
});

module.exports = router;
