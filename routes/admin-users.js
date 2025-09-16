// routes/admin-users.js
const path = require("path");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const router = express.Router();

// --- simple admin guard (reuse your existing one if exported elsewhere)
function requireAdmin(req, res, next) {
  const u = req.session && req.session.user;
  if (!u || (u.type !== "Admin" && u.role !== "Admin")) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Admin only" } });
  }
  next();
}

const DB_PATH =
  process.env.DB_PATH_USERS ||
  process.env.SQLITE_DB ||
  path.join(__dirname, "..", "data", "dev", "wattsun.dev.db");

const db = new sqlite3.Database(DB_PATH);

// GET /api/admin/users
router.get("/users", requireAdmin, (req, res) => {
  let { page = "1", per = "10", q = "", type } = req.query;

  page = Math.max(parseInt(page, 10) || 1, 1);
  per = Math.min(Math.max(parseInt(per, 10) || 10, 1), 100);
  const offset = (page - 1) * per;

  const where = [];
  const params = {};

  if (type) {
    where.push("type = $type");
    params.$type = String(type);
  }

  if (q) {
    where.push("(name LIKE $q OR email LIKE $q OR phone LIKE $q)");
    params.$q = `%${q}%`;
  }

  const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countSQL = `SELECT COUNT(*) AS total FROM users ${whereSQL}`;
  const listSQL = `
    SELECT id, name, email, phone, type, status, created_at AS createdAt
    FROM users
    ${whereSQL}
    ORDER BY id ASC
    LIMIT $per OFFSET $offset
  `;

  db.get(countSQL, params, (err, row) => {
    if (err) {
      return res.status(500).json({ success: false, error: { code: "DB_COUNT", message: err.message } });
    }
    const total = row?.total ?? 0;

    db.all(listSQL, { ...params, $per: per, $offset: offset }, (err2, rows) => {
      if (err2) {
        return res.status(500).json({ success: false, error: { code: "DB_LIST", message: err2.message } });
      }
      return res.json({ success: true, page, per, total, users: rows });
    });
  });
});

// CREATE: POST /api/admin/users
router.post("/users", requireAdmin, express.json(), (req, res) => {
  try {
    const { name, email, phone, type, status } = req.body || {};
    // Minimal validation
    if (!name || !email || !phone) {
      return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "name, email, phone are required" } });
    }
    // DB handle (better-sqlite3 style via app context)
    const db = req.app.get("db");
    if (!db) {
      return res.status(500).json({ success: false, error: { code: "DB_UNAVAILABLE", message: "Database not available" } });
    }

    // Insert — align with your schema column names
    // Ensure your users table has: name, email, phone, type, status, created_at, updated_at
    const insert = db.prepare(`
      INSERT INTO users (name, email, phone, type, status, created_at, updated_at)
      VALUES (?, ?, ?, COALESCE(?, 'User'), COALESCE(?, 'Active'), datetime('now'), datetime('now'))
    `);
    const info = insert.run(name.trim(), email.trim(), phone.trim(), type, status);

    // Select the newly created row for response
    const row = db.prepare(`
      SELECT id, name, email, phone, type, status, created_at AS createdAt, updated_at AS updatedAt
      FROM users WHERE id = ?
    `).get(info.lastInsertRowid);

    return res.json({ success: true, user: row });
  } catch (err) {
    // likely UNIQUE constraint, etc.
    return res.status(500).json({ success: false, error: { code: "CREATE_FAILED", message: String(err && err.message || err) } });
  }
});

// PATCH /api/admin/users/:id  (keep existing behavior; optional example shown)
router.patch("/users/:id", requireAdmin, express.json(), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name, email, phone, type, status } = req.body || {};

  // build dynamic SET
  const fields = [];
  const params = { $id: id };
  if (name != null)  { fields.push("name = $name"); params.$name = name; }
  if (email != null) { fields.push("email = $email"); params.$email = email; }
  if (phone != null) { fields.push("phone = $phone"); params.$phone = phone; }
  if (type != null)  { fields.push("type = $type"); params.$type = type; }
  if (status != null){ fields.push("status = $status"); params.$status = status; }

  if (!fields.length) return res.json({ success: true, user: null });

  const sql = `UPDATE users SET ${fields.join(", ")}, updated_at=CURRENT_TIMESTAMP WHERE id=$id`;
  db.run(sql, params, function (err) {
    if (err) return res.status(500).json({ success: false, error: { code: "DB_UPDATE", message: err.message } });

    db.get(
      `SELECT id, name, email, phone, type, status, created_at AS createdAt FROM users WHERE id=$id`,
      { $id: id },
      (err2, row) => {
        if (err2) return res.status(500).json({ success: false, error: { code: "DB_READ", message: err2.message } });
        res.json({ success: true, user: row });
      }
    );
  });
});

module.exports = router;
