// routes/orders.js
// Customer-facing SQL route for /api/orders
// Returns { success, orders, total, page, per }

const express = require("express");
const path = require("path");
const db = require("./db_users");

const router = express.Router();
const INTL_PHONE = /^\+\d{10,15}$/;

// Shared DB handle via better-sqlite3

function toInt(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

// ---- core fetch ----
function fetchOrdersFromDb({ phone, status, q, page, per }) {
  const where = [];
  const args = [];

  if (phone) {
    where.push(
      `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(phone,''), '+',''), ' ', ''), '-', ''), '(', ''), ')', '')
       = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(?,'+',''),' ',''),'-',''),'(',''),')','')`
    );
    args.push(phone);
  }
  if (status) {
    where.push("LOWER(status) = LOWER(?)");
    args.push(status);
  }
  if (q) {
    where.push("(CAST(orderNumber AS TEXT) LIKE ? OR CAST(id AS TEXT) LIKE ? OR LOWER(fullName) LIKE LOWER(?))");
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const countSql = `SELECT COUNT(*) AS n FROM orders ${whereSql}`;
  const total = (db.prepare(countSql).get(...args)?.n) || 0;

  const rows = db.prepare(`
    SELECT 
      id,
      orderNumber,
      fullName,
      email,
      phone,
      address,
      status,
      totalCents,
      depositCents,
      currency,
      createdAt,
      completed_at,
      driverId
    FROM orders
    ${whereSql}
    ORDER BY datetime(createdAt) DESC
    LIMIT ? OFFSET ?
  `).all(...args, per, (page - 1) * per);

  return { orders: rows, total, page, per };
}

// ---- Routes ----
// GET /api/orders?phone=+254...&page=1&per=5
router.get("/", async (req, res) => {
  const { phone, status, q } = req.query;
  const page = toInt(req.query.page, 1);
  const per = Math.min(50, toInt(req.query.per, 5));

  if (!phone)
    return res.status(400).json({ success: false, message: "phone is required" });
  if (!INTL_PHONE.test(phone)) {
    return res.status(400).json({
      success: false,
      message:
        "Invalid phone format. Use + and 10–15 digits, e.g. +254712345678",
    });
  }

  try {
    const out = fetchOrdersFromDb({ phone, status, q, page, per });
    return res.json({ success: true, ...out });
  } catch (e) {
    console.error("[orders][GET] error:", e);
    return res
      .status(500)
      .json({ success: false, message: "DB error", detail: e.message });
  }
});

// POST /api/orders { phone, status?, q?, page?, per? }
router.post("/", async (req, res) => {
  const { phone, status, q, page: pIn, per: perIn } = req.body || {};
  const page = toInt(pIn, 1);
  const per = Math.min(50, toInt(perIn, 5));

  if (!phone)
    return res.status(400).json({ success: false, message: "phone is required" });
  if (!INTL_PHONE.test(phone)) {
    return res.status(400).json({
      success: false,
      message:
        "Invalid phone format. Use + and 10–15 digits, e.g. +254712345678",
    });
  }

  try {
    const out = fetchOrdersFromDb({ phone, status, q, page, per });
    return res.json({ success: true, ...out });
  } catch (e) {
    console.error("[orders][POST] error:", e);
    return res
      .status(500)
      .json({ success: false, message: "DB error", detail: e.message });
  }
});

module.exports = router;
