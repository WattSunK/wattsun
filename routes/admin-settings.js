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

// ------------------------------------------------------------
// Security / User Management settings
//   - enforce_strong_passwords (0|1)
//   - allow_password_reset (0|1)
//   - session_timeout_minutes (integer, minimum 5)
// ------------------------------------------------------------

router.get("/security", (_req, res) => {
  ensureTable();
  const keys = ["enforce_strong_passwords", "allow_password_reset", "session_timeout_minutes"];
  const m = getMap(keys);
  const minutes = Math.max(5, Number(m.session_timeout_minutes || 5));
  res.json({
    success: true,
    security: {
      enforceStrongPasswords: /(1|true|yes)/i.test(m.enforce_strong_passwords || "1"),
      allowPasswordReset: /(1|true|yes)/i.test(m.allow_password_reset || "1"),
      sessionTimeoutMinutes: minutes,
    }
  });
});

router.put("/security", (req, res) => {
  ensureTable();
  const b = req.body || {};

  if (b.enforceStrongPasswords !== undefined) {
    upsert("enforce_strong_passwords", (/^(true|1|yes)$/i.test(String(b.enforceStrongPasswords)) ? 1 : 0));
  }
  if (b.allowPasswordReset !== undefined) {
    upsert("allow_password_reset", (/^(true|1|yes)$/i.test(String(b.allowPasswordReset)) ? 1 : 0));
  }
  if (b.sessionTimeoutMinutes !== undefined) {
    let mins = Number(b.sessionTimeoutMinutes);
    if (!Number.isFinite(mins)) return res.status(400).json({ success:false, error:{ code:"BAD_INPUT", message:"sessionTimeoutMinutes must be a number" } });
    if (mins < 5) mins = 5; // enforce minimum 5 minutes
    upsert("session_timeout_minutes", mins);
    try {
      const ms = mins * 60 * 1000;
      // allow server to adopt new timeout for subsequent requests
      req.app?.set && req.app.set('sessionMaxAgeMs', ms);
    } catch (_) {}
  }

  return res.json({ success: true });
});

// ------------------------------------------------------------
// Company Information (Company Name, Support Email/Phone, Address)
// ------------------------------------------------------------

router.get("/company", (_req, res) => {
  ensureTable();
  const keys = ["company_name", "support_email", "support_phone", "physical_address"];
  const m = getMap(keys);
  const out = {
    companyName: m.company_name || "WattSun Solar",
    supportEmail: m.support_email || "",
    supportPhone: m.support_phone || "",
    physicalAddress: m.physical_address || ""
  };
  res.json({ success: true, company: out });
});

router.put("/company", (req, res) => {
  ensureTable();
  const b = req.body || {};
  const companyName = b.companyName != null ? String(b.companyName).trim() : undefined;
  const supportEmail = b.supportEmail != null ? String(b.supportEmail).trim() : undefined;
  const supportPhone = b.supportPhone != null ? String(b.supportPhone).trim() : undefined;
  const physicalAddress = b.physicalAddress != null ? String(b.physicalAddress).trim() : undefined;

  if (supportEmail !== undefined && supportEmail && !supportEmail.includes("@")) {
    return res.status(400).json({ success:false, error:{ code:"BAD_EMAIL", message:"supportEmail must be a valid email" } });
  }

  try {
    if (companyName !== undefined) upsert("company_name", companyName);
    if (supportEmail !== undefined) {
      upsert("support_email", supportEmail);
      // Mirror to admin_email for legacy readers
      if (supportEmail) upsert("admin_email", supportEmail);
    }
    if (supportPhone !== undefined) upsert("support_phone", supportPhone);
    if (physicalAddress !== undefined) upsert("physical_address", physicalAddress);
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success:false, error:{ code:"SERVER_ERROR", message:e.message } });
  }
});

module.exports = router;
