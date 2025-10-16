// routes/track.js
// Customer-facing tracking endpoint (SQL only)

const express = require("express");
const path = require("path");
const db = require("./db_users");

const router = express.Router();

// Shared DB via better-sqlite3

function toInt(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

router.get("/", (req, res) => {
  const {
    phone = "",
    email = "",
    orderNumber = "",
    id = "",
    status = "",
    page: pageIn,
    per: perIn,
  } = req.query || {};

  const page = toInt(pageIn, 1);
  const per = Math.min(50, toInt(perIn, 5));

  const ident = (orderNumber || id || "").trim();
  const phoneDigits = String(phone).replace(/[^\d]/g, "");
  const emailLower = String(email).toLowerCase();
  const statusLower = String(status).toLowerCase();

  let where = "WHERE 1=1";
  const args = [];

  if (ident) {
    where += " AND (orderNumber = ? OR id = ?)";
    args.push(ident, ident);
  }
  if (emailLower) {
    where += " AND LOWER(email) = ?";
    args.push(emailLower);
  }
  if (phoneDigits) {
    where +=
      " AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(phone,''), '+',''), ' ', ''), '-', ''), '(', ''), ')','') = ?";
    args.push(phoneDigits);
  }
  if (statusLower) {
    where += " AND LOWER(status) = ?";
    args.push(statusLower);
  }

  try {
    const total = db.prepare(`SELECT COUNT(*) AS n FROM orders ${where}`).get(...args)?.n || 0;
    const rows = db.prepare(`
      SELECT 
         id, orderNumber, status, totalCents, depositCents, currency,
         createdAt, fullName, email, phone, address
       FROM orders
       ${where}
       ORDER BY datetime(createdAt) DESC
       LIMIT ? OFFSET ?`).all(...args, per, (page - 1) * per);

    return res.json({ success: true, total, page, per, orders: rows });
  } catch (e) {
    console.error("[track] query error", e);
    return res.status(500).json({ success: false, message: "DB error", detail: e.message });
  }
});

module.exports = router;
