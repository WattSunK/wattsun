// routes/orders.js
// Customer-facing SQL route for /api/orders
// Returns { success, orders, total, page, per }

const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const router = express.Router();
const INTL_PHONE = /^\+\d{10,15}$/;

// ---- DB wiring ----
const DB_PATH =
  process.env.DB_PATH_ORDERS ||
  process.env.SQLITE_DB ||
  path.join(process.cwd(), "data/dev/wattsun.dev.db");

function withDb(fn) {
  const db = new sqlite3.Database(DB_PATH);
  return new Promise((resolve, reject) => {
    fn(db)
      .then((v) => {
        db.close();
        resolve(v);
      })
      .catch((e) => {
        db.close();
        reject(e);
      });
  });
}

const q = (db, sql, params = []) =>
  new Promise((res, rej) =>
    db.get(sql, params, (e, row) => (e ? rej(e) : res(row || null)))
  );
const all = (db, sql, params = []) =>
  new Promise((res, rej) =>
    db.all(sql, params, (e, rows) => (e ? rej(e) : res(rows || [])))
  );

function toInt(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

// ---- core fetch ----
async function fetchOrdersFromDb({ phone, status, q, page, per }) {
  return withDb(async (db) => {
    const where = [];
    const args = [];

    // Phone normalized to digits only (same as idx_orders_phone_digits)
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
      where.push(
        "(CAST(orderNumber AS TEXT) LIKE ? OR CAST(id AS TEXT) LIKE ? OR LOWER(fullName) LIKE LOWER(?))"
      );
      args.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const totRow = await q(
      db,
      `SELECT COUNT(*) AS n FROM orders ${whereSql}`,
      args
    );
    const total = totRow?.n || 0;

    const rows = await all(
      db,
      `SELECT 
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
       LIMIT ? OFFSET ?`,
      [...args, per, (page - 1) * per]
    );

    return { orders: rows, total, page, per };
  });
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
    const out = await fetchOrdersFromDb({ phone, status, q, page, per });
    return res.json({ success: true, ...out });
  } catch (e) {
    console.error("[orders][GET] error:", e.message);
    return res.status(500).json({ success: false, message: "DB error" });
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
    const out = await fetchOrdersFromDb({ phone, status, q, page, per });
    return res.json({ success: true, ...out });
  } catch (e) {
    console.error("[orders][POST] error:", e.message);
    return res.status(500).json({ success: false, message: "DB error" });
  }
});

module.exports = router;
