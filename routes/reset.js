// routes/reset.js
const express = require("express");
const crypto = require("crypto");

// Shared persistent users DB handle (better-sqlite3)
const db = require("./db_users");

// Optional bcrypt (prefer bcryptjs, fallback to bcrypt)
let bcrypt = null;
try { bcrypt = require("bcryptjs"); } catch (_) { try { bcrypt = require("bcrypt"); } catch (_) { bcrypt = null; } }

const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const tokenTTL = 60 * 60; // 1 hour

function hashPassword(password) {
  try {
    if (bcrypt) return bcrypt.hashSync(password, 10);
  } catch (err) {
    console.warn("[reset] bcrypt hash failed:", err?.message || err);
  }
  // Explicit fallback compatible with login verifier
  return "sha256:" + crypto.createHash("sha256").update(password).digest("hex");
}

function requestReset(req, res) {
  // Check if password resets are allowed (default: true)
  try {
    const row = db.prepare("SELECT value FROM admin_settings WHERE key='allow_password_reset' LIMIT 1").get();
    const allowed = !row || /(1|true|yes)/i.test(String(row.value || '1'));
    if (!allowed) return res.status(403).json({ ok: false, error: "Password reset is disabled by admin" });
  } catch(_) {}
  const email = (req.body?.email ?? "").toString().trim().toLowerCase();
  if (!email) return res.status(400).json({ ok: false, error: "Missing email" });

  const token = crypto.randomBytes(24).toString("hex");
  const expiry = Math.floor(Date.now() / 1000) + tokenTTL;

  try {
    const info = db
      .prepare(`UPDATE users SET reset_token=?, reset_expiry=? WHERE LOWER(email)=LOWER(?)`)
      .run(token, expiry, email);
    if (info.changes === 0) {
      return res.status(404).json({ ok: false, error: "Email not found" });
    }
    // Do not leak reset token in API response
    return res.json({ ok: true, expires: expiry });
  } catch (e) {
    console.error("[reset] request error:", e);
    return res.status(500).json({ ok: false, error: "Database error" });
  }
}

function confirmReset(req, res) {
  // Gate reset confirmation if disabled
  try {
    const row = db.prepare("SELECT value FROM admin_settings WHERE key='allow_password_reset' LIMIT 1").get();
    const allowed = !row || /(1|true|yes)/i.test(String(row.value || '1'));
    if (!allowed) return res.status(403).json({ ok: false, error: "Password reset is disabled by admin" });
  } catch(_) {}
  const token = (req.body?.token ?? "").toString().trim();
  const password = (req.body?.password ?? "").toString();
  if (!token || !password)
    return res.status(400).json({ ok: false, error: "Missing token or password" });

  try {
    const row = db
      .prepare(`SELECT id, reset_expiry FROM users WHERE reset_token=? LIMIT 1`)
      .get(token);
    if (!row) return res.status(400).json({ ok: false, error: "Invalid token" });
    if (!row.reset_expiry || row.reset_expiry < Math.floor(Date.now() / 1000)) {
      return res.status(400).json({ ok: false, error: "Token expired" });
    }

    const hash = hashPassword(password);
    db.prepare(
      `UPDATE users SET password_hash=?, reset_token=NULL, reset_expiry=NULL WHERE id=?`
    ).run(hash, row.id);
    return res.json({ ok: true });
  } catch (e) {
    console.error("[reset] update error:", e);
    return res.status(500).json({ ok: false, error: "Database error" });
  }
}

// Legacy + UI aliases
router.post("/reset", (req, res) =>
  req.body && req.body.token ? confirmReset(req, res) : requestReset(req, res)
);
router.post("/reset/request", requestReset);
router.post("/reset/confirm", confirmReset);
router.post("/reset-request", requestReset);
router.post("/reset-confirm", confirmReset);

module.exports = router;
