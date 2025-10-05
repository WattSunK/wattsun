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

// GET /api/admin/users  — with per-user orders count
router.get("/users", requireAdmin, (req, res) => {
  let { page = "1", per = "10", q = "", type, status } = req.query;

  page = Math.max(parseInt(page, 10) || 1, 1);
  per = Math.min(Math.max(parseInt(per, 10) || 10, 1), 100);
  const offset = (page - 1) * per;

  const where = [];
  const params = {};

  // NOTE: qualify columns with "u." (users alias)
  if (type) {
    where.push("u.type = $type");
    params.$type = String(type);
  }
if (status) {
   where.push("u.status = $status");
   params.$status = String(status);
 }
 if (q) {
  // normalize the phone-like side of q to digits (best-effort)
  const qDigits = String(q).replace(/[^\d]/g, "");
  where.push(`(
    LOWER(u.name) LIKE $q
    OR LOWER(u.email) LIKE $q
    OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(u.phone, '+',''), ' ', ''), '-', ''), '(', ''), ')', '') LIKE $qDigits
  )`);
  params.$q = `%${String(q).toLowerCase()}%`;
  params.$qDigits = `%${qDigits}%`;
}

  const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // total users for pager (no join needed)
const countSQL = `SELECT COUNT(*) AS total FROM users u ${whereSQL}`;

// list with orders count via email/phone matches
const listSQL = `
WITH users_norm AS (
  SELECT
    u.id,
    u.name,
    u.email,
    u.phone,
    u.type,
    u.status,
    u.created_at AS createdAt,
    LOWER(u.email) AS u_email,
    /* strip + - ( ) and spaces to digits-only */
    CASE
      WHEN substr(pu,1,1) = '0'   THEN '254' || substr(pu, 2)   -- 07.. -> 2547..
      WHEN substr(pu,1,3) = '254' THEN pu                        -- already 254...
      ELSE pu
    END AS u_phone
  FROM (
    SELECT
      u.*,
      REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(u.phone,''), '+',''), ' ', ''), '-', ''), '(', ''), ')', '') AS pu
    FROM users u
  ) u
),
orders_norm AS (
  SELECT
    o.id,
    LOWER(o.email) AS o_email,
    CASE
      WHEN substr(po,1,1) = '0'   THEN '254' || substr(po, 2)
      WHEN substr(po,1,3) = '254' THEN po
      ELSE po
    END AS o_phone
  FROM (
    SELECT
      o.*,
      REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(o.phone,''), '+',''), ' ', ''), '-', ''), '(', ''), ')', '') AS po
    FROM orders o
  ) o
)
SELECT
  u.id,
  u.name,
  u.email,
  u.phone,
  u.type,
  u.status,
  u.createdAt,
  COUNT(o.id) AS orders
FROM users_norm u
LEFT JOIN orders_norm o
  ON (
       (u.u_email <> '' AND o.o_email = u.u_email)
       OR
       (u.u_phone <> '' AND o.o_phone = u.u_phone)
     )
${whereSQL}
GROUP BY u.id
ORDER BY u.createdAt DESC
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

// CREATE: POST /api/admin/users  (use the same sqlite3 handle as GET/PATCH)

router.post("/users", requireAdmin, express.json(), (req, res) => {
  const { name, email, phone, type, status } = req.body || {};
  if (!name || !email || !phone) {
    return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "name, email, phone are required" } });
  }

  const sql = `
    INSERT INTO users (name, email, phone, type, status, created_at, updated_at)
    VALUES ($name, $email, $phone, COALESCE($type,'User'), COALESCE($status,'Active'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `;
  const params = { $name: name.trim(), $email: email.trim(), $phone: phone.trim(), $type: type, $status: status };

  db.run(sql, params, function (err) {
    if (err) {
      return res.status(500).json({ success: false, error: { code: "DB_INSERT", message: err.message } });
    }
    const id = this.lastID;
    db.get(
      `SELECT id, name, email, phone, type, status, created_at AS createdAt, updated_at AS updatedAt FROM users WHERE id = $id`,
      { $id: id },
      (err2, row) => {
        if (err2) return res.status(500).json({ success: false, error: { code: "DB_READ", message: err2.message } });
        return res.json({ success: true, user: row });
      }
    );
  });
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
      `SELECT id, name, email, phone, type, status, created_at AS createdAt, updated_at AS updatedAt FROM users WHERE id=$id`,
      { $id: id },
      (err2, row) => {
        if (err2) return res.status(500).json({ success: false, error: { code: "DB_READ", message: err2.message } });
        res.json({ success: true, user: row });
      }
    );
  });
});
// POST /api/admin/users/:id/send-reset  — stub to quiet logs; replace with real mailer later
router.post("/users/:id/send-reset", requireAdmin, (req, res) => {
  // TODO: integrate your actual mailer; for now just OK
  return res.json({ success: true });
});

// DELETE: /api/admin/users/:id  (sqlite3 handle; same as GET/PATCH)
router.delete("/users/:id", requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Invalid id" } });
  }

  // If you enforce FK, this will fail when the user is referenced elsewhere.
  db.run(`DELETE FROM users WHERE id = $id`, { $id: id }, function (err) {
    if (err) {
      return res.status(500).json({ success: false, error: { code: "DB_DELETE", message: err.message } });
    }
    // this.changes === 1 when a row was removed
    return res.json({ success: true, deleted: this.changes, id });
  });
});

module.exports = router;
