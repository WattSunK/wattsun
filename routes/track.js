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

function buildQueryParts(params = {}) {
  const {
    phone = "",
    email = "",
    orderNumber = "",
    order = "", // alias from client
    id = "",
    status = "",
    page: pageIn,
    per: perIn,
  } = params;

  const page = toInt(pageIn, 1);
  const per = Math.min(50, toInt(perIn, 5));

  const ident = (orderNumber || order || id || "").trim();
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

  return { where, args, page, per };
}

function runQuery({ where, args, page, per }, res) {
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
}

router.get("/", (req, res) => {
  const qp = req.query || {};
  return runQuery(buildQueryParts(qp), res);
});

// Support POST from existing clients: body JSON with { phone, status, order }
router.post("/", (req, res) => {
  const body = req.body || {};
  // Allow email to be supplied via header as well
  const emailHeader = req.get("X-WS-Email") || req.get("x-ws-email") || "";
  const qp = { ...body };
  if (!qp.email && emailHeader) qp.email = emailHeader;
  return runQuery(buildQueryParts(qp), res);
});

module.exports = router;
