// routes/track.js
// Customer-facing tracking endpoint (SQL only)

const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const router = express.Router();

const DB_PATH =
  process.env.WATTSUN_DB ||
  path.join(__dirname, "../data/dev/wattsun.dev.db");

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

  const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error("[track] DB open error:", err);
      return res.status(500).json({ success: false, message: "DB error" });
    }
  });

  // Count
  db.get(`SELECT COUNT(*) AS n FROM orders ${where}`, args, (err, row) => {
    if (err) {
      console.error("[track] count error", err);
      db.close();
      return res.status(500).json({ success: false, message: "DB error" });
    }
    const total = row?.n || 0;

    db.all(
      `SELECT 
         id, orderNumber, status, totalCents, depositCents, currency,
         createdAt, fullName, email, phone, address
       FROM orders
       ${where}
       ORDER BY datetime(createdAt) DESC
       LIMIT ? OFFSET ?`,
      [...args, per, (page - 1) * per],
      (err2, rows) => {
        db.close();
        if (err2) {
          console.error("[track] fetch error", err2);
          return res
            .status(500)
            .json({ success: false, message: "DB error", detail: err2.message });
        }

        return res.json({
          success: true,
          total,
          page,
          per,
          orders: rows,
        });
      }
    );
  });
});

module.exports = router;
