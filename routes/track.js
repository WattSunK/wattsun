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
         createdAt, completed_at, fullName, email, phone, address
       FROM orders
       ${where}
       ORDER BY datetime(createdAt) DESC
       LIMIT ? OFFSET ?`).all(...args, per, (page - 1) * per);

    // Harmonize fields for track.html
    const itemStmt = db.prepare(
      `SELECT name, qty, priceCents, depositCents FROM order_items WHERE order_id = ?`
    );
    const orders = rows.map((r) => {
      let cartSummary = "";
      try {
        const items = itemStmt.all(r.id) || [];
        cartSummary = items
          .map((it) => {
            const price = (Number(it.priceCents || 0) / 100) || 0;
            const dep = (Number(it.depositCents || 0) / 100) || 0;
            return `${it.name || ''} (x${it.qty || 1}): Price ${price}, Deposit ${dep}`.trim();
          })
          .filter(Boolean)
          .join("\n");
      } catch (_) {}

      const totalNum = (Number(r.totalCents) || 0) / 100;
      const depositNum = (Number(r.depositCents) || 0) / 100;

      return {
        // raw identifiers
        id: r.id,
        orderNumber: r.orderNumber || r.id,

        // status + timestamps
        status: r.status || "Pending",
        createdAt: r.createdAt,
        updatedAt: r.completed_at || r.updatedAt || r.createdAt,

        // customer
        fullName: r.fullName || r.name || "",
        email: r.email,
        phone: r.phone,

        // address/payment
        address: r.address,
        deliveryAddress: r.address,
        paymentType: r.paymentType || r.payment_method || r.payment || null,

        // money
        currency: r.currency || "KES",
        total: totalNum,
        deposit: depositNum,

        // items summary for UI
        cart_summary: cartSummary,
      };
    });

    return res.json({ success: true, total, page, per, orders });
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
