// routes/login.js (debug-enhanced)
const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3").verbose();

const router = express.Router();
const dbPath = path.resolve(__dirname, "../user-setup/users.db");
console.log("[DEBUG] Using DB file:", dbPath);  // startup DB path
const db = new sqlite3.Database(dbPath);

const AUTH_DEBUG = process.env.WS_AUTH_DEBUG === "1";

// Normalize phone consistently
function normalizePhone(phone) {
  if (!phone) return "";
  let p = String(phone).trim().replace(/\s+/g, "");
  if (p.startsWith("0")) p = p.slice(1);
  if (!p.startsWith("+254")) p = p.startsWith("254") ? ("+" + p) : ("+254" + p);
  return p;
}

// POST /api/login
router.post("/login", (req, res) => {
  console.log("[DEBUG] Login attempt DB file:", dbPath);
  const b = req.body || {};
  console.log("[DEBUG] Incoming email from frontend:", b.email);

  // Accept lots of possible field names from the client
  const candidates = [
    b.email, b.phone, b.identity, b.username, b.login, b.loginEmail, b.user
  ].filter(v => v != null && String(v).trim() !== "");

  if (candidates.length === 0 || !b.password) {
    return res.status(400).json({ error: "Email/phone and password required" });
  }

  // Prefer the first non-empty value as "identity"
  const identityRaw = String(candidates[0]).trim();
  const looksLikeEmail = identityRaw.includes("@");
  const normEmail = identityRaw.toLowerCase();
  const normPhone = normalizePhone(identityRaw);

  if (AUTH_DEBUG) {
    console.log("[login] identityRaw=", identityRaw,
      "looksLikeEmail=", looksLikeEmail,
      "normEmail=", normEmail,
      "normPhone=", normPhone);
  }

  // We’ll try a robust lookup that covers both
  const sql = `
    SELECT id, name, email, phone, type, password_hash, status
    FROM users
    WHERE lower(email) = lower(?)
       OR phone = ?
    LIMIT 1
  `;

  db.get(sql, [normEmail, normPhone], async (err, row) => {
    if (err) {
      console.error("[DEBUG] DB error:", err);
      if (AUTH_DEBUG) console.error("[login] DB error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    console.log("[DEBUG] DB returned user:", row);

    if (!row) {
      if (AUTH_DEBUG) console.log("[login] no user found");
      return res.status(401).json({ error: "Invalid credentials" });
    }

    try {
      // Log the hash we are comparing (shortened)
      const shortHash = String(row.password_hash || "").slice(0, 40);
      console.log("[DEBUG] Comparing password against hash prefix:", shortHash + (String(row.password_hash || "").length > 40 ? '...' : ''));

      const ok = await bcrypt.compare(String(b.password), row.password_hash || "");
      console.log("[DEBUG] Password compare result:", ok);

      if (!ok) {
        if (AUTH_DEBUG) console.log("[login] password mismatch for user id", row.id);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Optional: extra status checks (log them)
      if (row.status && String(row.status).toLowerCase() !== 'active') {
        console.log('[DEBUG] User status blocks login:', row.status);
        return res.status(403).json({ error: 'Account not active' });
      }

      const { password_hash, ...user } = row;
      if (AUTH_DEBUG) console.log("[login] success user id", row.id);
      return res.json({ success: true, user });
    } catch (e) {
      if (AUTH_DEBUG) console.error("[login] bcrypt error:", e);
      console.error('[DEBUG] Auth error during bcrypt compare', e);
      return res.status(500).json({ error: "Auth error" });
    }
  });
});

module.exports = router;
