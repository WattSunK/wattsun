// routes/admin-settings.js
// Admin Settings: Notifications and misc key-value settings stored in admin_settings

const express = require("express");
const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const db = require("./db_users"); // better-sqlite3 shared handle

function ensureTable() {
  try {
    db.prepare(`CREATE TABLE IF NOT EXISTS admin_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`).run();
  } catch (_) {}
}

function getMap(keys) {
  const map = {};
  try {
    const rows = db.prepare(`SELECT key, value FROM admin_settings WHERE key IN (${keys.map(()=>'?').join(',')})`).all(...keys);
    for (const r of rows) map[r.key] = r.value;
  } catch (_) {}
  return map;
}

function upsert(key, value) {
  db.prepare(`INSERT INTO admin_settings (key, value, updated_at) VALUES (?,?,datetime('now','localtime'))
             ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`).run(key, String(value));
}

router.get("/settings", (_req, res) => {
  ensureTable();
  const keys = [
    "notify_order_placed",
    "notify_order_delivered",
    "low_stock_threshold",
    "alerts_email",
    "admin_email"
  ];
  const m = getMap(keys);
  const out = {
    notifyOrderPlaced: /(1|true|yes)/i.test(m.notify_order_placed || "1"),
    notifyOrderDelivered: /(1|true|yes)/i.test(m.notify_order_delivered || "1"),
    lowStockThreshold: Number(m.low_stock_threshold || 10),
    alertsEmail: m.alerts_email || m.admin_email || process.env.SMTP_USER || ""
  };
  res.json({ success: true, settings: out });
});

router.put("/settings", (req, res) => {
  ensureTable();
  const b = req.body || {};
  if (b.notifyOrderPlaced !== undefined) upsert("notify_order_placed", (/^(true|1|yes)$/i.test(String(b.notifyOrderPlaced)) ? 1 : 0));
  if (b.notifyOrderDelivered !== undefined) upsert("notify_order_delivered", (/^(true|1|yes)$/i.test(String(b.notifyOrderDelivered)) ? 1 : 0));
  if (b.lowStockThreshold !== undefined) {
    const n = Number(b.lowStockThreshold);
    if (!Number.isFinite(n) || n < 0) return res.status(400).json({ success:false, error:{ code:"BAD_INPUT", message:"lowStockThreshold must be >= 0" } });
    upsert("low_stock_threshold", n);
  }
  if (b.alertsEmail !== undefined) {
    const s = String(b.alertsEmail || "").trim();
    if (s && !s.includes("@")) return res.status(400).json({ success:false, error:{ code:"BAD_EMAIL", message:"alertsEmail must be a valid email" } });
    upsert("alerts_email", s);
  }
  return res.json({ success: true });
});

module.exports = router;

