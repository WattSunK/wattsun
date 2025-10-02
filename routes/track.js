// routes/track.js
const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const router = express.Router();

const DB_PATH =
  process.env.WATTSUN_DB ||
  path.join(__dirname, "../data/dev/wattsun.dev.db");

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error("[track] DB open error:", err);
});

// Public tracking endpoint
router.get("/", (req, res) => {
  const { phone = "", email = "", orderNumber = "", id = "" } = req.query || {};
  const ident = (orderNumber || id || "").trim();
  const phoneDigits = String(phone).replace(/[^\d]/g, "");
  const emailLower = String(email).toLowerCase();

  // Select only the needed fields — avoid alias conflicts
  let sql = `
    SELECT id, orderNumber, status, totalCents, depositCents, currency,
           createdAt, fullName, email, phone, address
    FROM orders
    WHERE 1=1
  `;
  const args = [];

  if (ident) {
    sql += ` AND (orderNumber=? OR id=?) `;
    args.push(ident, ident);
  }
  if (emailLower) {
    sql += ` AND LOWER(email)=? `;
    args.push(emailLower);
  }
  if (phoneDigits) {
    sql += ` AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(phone,''), '+',''), ' ', ''), '-', ''), '(', ''), ')', '')=? `;
    args.push(phoneDigits);
  }

  sql += ` ORDER BY datetime(createdAt) DESC LIMIT 1`;

  db.get(sql, args, (err, row) => {
    if (err) {
      console.error("[track] error", err);
      return res.status(500).json({ success: false, message: "DB error" });
    }
    if (!row) return res.json({ success: true, found: false, order: null });

    return res.json({
      success: true,
      found: true,
      order: {
        orderNumber: row.orderNumber,
        status: row.status,
        totalCents: row.totalCents,
        depositCents: row.depositCents,
        currency: row.currency,
        createdAt: row.createdAt,
        fullName: row.fullName,
        email: row.email,
        phone: row.phone,
        address: row.address
      }
    });
  });
});

module.exports = router;
