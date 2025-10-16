// routes/signup.js
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const db = require("./db_users"); // Shared better-sqlite3 users DB connection

// Bcrypt (optional) for hashing
let bcrypt = null;
try { bcrypt = require("bcryptjs"); } catch (_) { try { bcrypt = require("bcrypt"); } catch (_) { bcrypt = null; } }

const router = express.Router();

// Helper to hash passwords consistently
function hashPassword(password) {
  try {
    if (bcrypt) return bcrypt.hashSync(password, 10);
  } catch (err) {
    console.warn("[signup] bcrypt hash failed:", err?.message || err);
  }
  // Explicit fallback format supported by login verifier
  return "sha256:" + crypto.createHash("sha256").update(password).digest("hex");
}

router.post(["/", "/signup"], (req, res) => {
  try {
    const body = req.body || {};
    const name = (body.name ?? body.username ?? "").toString().trim() || "New User";
    const email = (body.email ?? "").toString().trim().toLowerCase();
    const phone = (body.phone ?? body.phoneNumber ?? "").toString().trim() || null;
    const password = (body.password ?? body.pass ?? "").toString();

    if (!email || !password) {
      return res.status(400).json({ success: false, error: { code: "MISSING_FIELDS", message: "Missing email or password" } });
    }

    const hashedPassword = hashPassword(password);

    // Check if user already exists by email (case-insensitive) or phone
    const existing = db.prepare(
      "SELECT id FROM users WHERE LOWER(email)=LOWER(?) OR phone=? LIMIT 1"
    ).get(email, phone);
    if (existing) {
      return res.status(409).json({ success: false, error: { code: "DUPLICATE_EMAIL", message: "Email or phone already registered" } });
    }

    const now = new Date().toISOString().replace("T", " ").replace("Z", "");
    const info = db.prepare(
      "INSERT INTO users (name,email,phone,type,status,password_hash,created_at) VALUES (?,?,?,?,?,?,?)"
    ).run(name, email, phone, "User", "Active", hashedPassword, now);

    console.log(`[signup] Created user ${email}`);
    return res.json({ success: true, user: { id: info.lastInsertRowid, name, email, phone, type: "User", status: "Active" }, message: "Signup successful" });
  } catch (err) {
    console.error("[signup] Unexpected error:", err);
    return res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: err.message } });
  }
});

module.exports = router;

