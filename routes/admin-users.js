// routes/admin-users.js
const express = require("express");
const path = require("path");
const db = require("./db_users");

const router = express.Router();

// --- simple admin guard (reuse existing global version if mounted higher)
function requireAdmin(req, res, next) {
  const u = req.session && req.session.user;
  if (!u || (u.type !== "Admin" && u.role !== "Admin")) {
    return res.status(403).json({
      success: false,
      error: { code: "FORBIDDEN", message: "Admin access required." },
    });
  }
  next();
}

// ============================================================
// GET /api/admin/users  – list users with per-user orders count
// ============================================================
router.get("/users", requireAdmin, (req, res) => {
  let { page = "1", per = "10", q = "", type, status } = req.query;
  page = Math.max(parseInt(page, 10) || 1, 1);
  per = Math.min(Math.max(parseInt(per, 10) || 10, 1), 100);
  const offset = (page - 1) * per;

  const where = [];
  const params = {};

  if (type) {
    where.push("u.type = $type");
    params.$type = String(type);
  }
  if (status) {
    where.push("u.status = $status");
    params.$status = String(status);
  }
  if (q) {
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
  const countSQL = `SELECT COUNT(*) AS total FROM users u ${whereSQL}`;

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
      CASE
        WHEN substr(pu,1,1) = '0'   THEN '254' || substr(pu, 2)
        WHEN substr(pu,1,3) = '254' THEN pu
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

  try {
    const total = db.prepare(countSQL).get(params).total ?? 0;
    const rows = db.prepare(listSQL).all({ ...params, $per: per, $offset: offset });
    return res.json({ success: true, page, per, total, users: rows });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, error: { code: "DB_LIST", message: err.message } });
  }
});

// ============================================================
// POST /api/admin/users  – create user
// ============================================================
router.post("/users", requireAdmin, express.json(), (req, res) => {
  const { name, email, phone, type, status } = req.body || {};
  if (!name || !email || !phone) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "name, email, phone are required" },
    });
  }

  const sql = `
    INSERT INTO users (name, email, phone, type, status, created_at, updated_at)
    VALUES ($name, $email, $phone, COALESCE($type,'User'), COALESCE($status,'Active'),
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `;
  const params = {
    $name: String(name).trim(),
    $email: String(email).trim(),
    $phone: String(phone).trim(),
    $type: type,
    $status: status,
  };

  try {
    const info = db.prepare(sql).run(params);
    const id = info.lastInsertRowid;
    const row = db.prepare(
      `SELECT id, name, email, phone, type, status, created_at AS createdAt, updated_at AS updatedAt
       FROM users WHERE id = $id`
    ).get({ $id: id });
    return res.json({ success: true, user: row });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, error: { code: "DB_INSERT", message: err.message } });
  }
});

// ============================================================
// PATCH /api/admin/users/:id/soft-delete  – mark user as Deleted
// ============================================================
router.patch("/users/:id/soft-delete", requireAdmin, (req, res) => {
  const { id } = req.params;
  try {
    const user = db.prepare("SELECT id, name, email, status FROM users WHERE id=?").get(id);
    if (!user) {
      return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } });
    }
    db.prepare("UPDATE users SET status='Deleted' WHERE id=?").run(id);
    return res.json({ success: true, message: `User ${user.email} marked as Deleted`, user: { ...user, status: "Deleted" } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: "DB_UPDATE", message: err.message } });
  }
});

// ============================================================
// PATCH /api/admin/users/:id  – update user fields
// ============================================================
router.patch("/users/:id", requireAdmin, express.json(), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name, email, phone, type, status } = req.body || {};

  const fields = [];
  const params = { $id: id };
  if (name != null)  { fields.push("name = $name"); params.$name = name; }
  if (email != null) { fields.push("email = $email"); params.$email = email; }
  if (phone != null) { fields.push("phone = $phone"); params.$phone = phone; }
  if (type != null)  { fields.push("type = $type"); params.$type = type; }
  if (status != null){ fields.push("status = $status"); params.$status = status; }

  if (!fields.length) return res.json({ success: true, user: null });

  const sql = `UPDATE users SET ${fields.join(", ")}, updated_at=CURRENT_TIMESTAMP WHERE id=$id`;
  try {
    db.prepare(sql).run(params);
    const row = db.prepare(
      `SELECT id, name, email, phone, type, status, created_at AS createdAt, updated_at AS updatedAt
       FROM users WHERE id=$id`
    ).get({ $id: id });
    res.json({ success: true, user: row });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, error: { code: "DB_UPDATE", message: err.message } });
  }
});

// ============================================================
// POST /api/admin/users/:id/send-reset – stub (future mailer)
// ============================================================
router.post("/users/:id/send-reset", requireAdmin, (req, res) => {
  return res.json({ success: true });
});

// ============================================================
// DELETE /api/admin/users/:id  – hard delete (fallback only)
// ============================================================
router.delete("/users/:id", requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "Invalid id" },
    });
  }

  try {
    const stmt = db.prepare("DELETE FROM users WHERE id = ?");
    const result = stmt.run(id);
    return res.json({ success: true, deleted: result.changes, id });
  } catch (err) {
    console.error("[admin-users][hard-delete]", err);
    return res
      .status(500)
      .json({ success: false, error: { code: "DB_DELETE", message: err.message } });
  }
});

module.exports = router;

