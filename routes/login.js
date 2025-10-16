// routes/login.js
const express = require("express");
const path = require("path");
const Database = require("better-sqlite3"); // Use same sync API as rest of app

// Try to load a bcrypt implementation; fall back gracefully if missing
let bcrypt = null;
try {
  // Preferred lightweight, pure JS implementation
  bcrypt = require("bcryptjs");
} catch (_) {
  try {
    // Fallback to native module if present
    bcrypt = require("bcrypt");
  } catch (_) {
    bcrypt = null;
  }
}

const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const DB_PATH =
  process.env.SQLITE_MAIN ||
  process.env.DB_PATH_USERS ||
  process.env.SQLITE_DB ||
  path.join(__dirname, "../data/dev/wattsun.dev.db");

// Open once (sync DB handle)
const db = new Database(DB_PATH);

// Password verification helpers
const crypto = require("crypto");
function isBcryptHash(hash) {
  return typeof hash === "string" && /^\$2[aby]?\$/.test(hash);
}
function verifyPassword(password, passwordHash) {
  if (!passwordHash) return false;

  // Support explicit dev/legacy formats when prefixed
  if (typeof passwordHash === "string") {
    if (passwordHash.startsWith("plain:")) {
      return password === passwordHash.slice("plain:".length);
    }
    if (passwordHash.startsWith("sha256:")) {
      const digest = crypto.createHash("sha256").update(password).digest("hex");
      return digest === passwordHash.slice("sha256:".length);
    }
  }

  // Bcrypt hashes
  if (isBcryptHash(passwordHash)) {
    if (!bcrypt) return "BCRYPT_MISSING";
    try {
      return !!bcrypt.compareSync(password, passwordHash);
    } catch (_) {
      return false;
    }
  }

  // Unknown/unsupported format
  return false;
}

router.post("/login", (req, res) => {
  try {
    const body = req.body || {};
    const emailOrPhone = (body.email || body.emailOrPhone || "").toString().trim().toLowerCase();
    const password = (body.password || "").toString();

    if (!emailOrPhone || !password) {
      return res.status(400).json({ success: false, error: { code: "MISSING_CREDENTIALS", message: "Missing credentials" } });
    }

    // Match by email (lowercased) or phone
    const row = db.prepare(
      `SELECT id,name,email,phone,type,status,password_hash
         FROM users
        WHERE LOWER(email)=LOWER(?) OR phone=?
        LIMIT 1`
    ).get(emailOrPhone, emailOrPhone);

    if (!row) {
      return res.status(401).json({ success: false, error: { code: "INVALID", message: "Invalid credentials" } });
    }

    const verify = verifyPassword(password, row.password_hash);
    if (verify === "BCRYPT_MISSING") {
      console.error("[login] bcrypt not available to verify stored bcrypt hash. Install 'bcryptjs' or 'bcrypt'.");
      return res.status(500).json({ success: false, error: { code: "AUTH_MISCONFIGURED", message: "Password verification unavailable. Contact administrator." } });
    }
    if (!verify) {
      return res.status(401).json({ success: false, error: { code: "INVALID", message: "Invalid credentials" } });
    }

    // Set session
    if (!req.session) {
      console.error("[login] session middleware not configured");
      return res.status(500).json({ success: false, error: { code: "SESSION_NOT_CONFIGURED", message: "Session unavailable." } });
    }
    req.session.user = {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      type: row.type,
      role: row.type, // normalize (role/type both available)
      status: row.status,
    };

    if (typeof req.session.save === "function") {
      req.session.save((err) => {
        if (err) {
          console.warn("[login] session save warning:", err.message);
        }
        console.log("[login] session saved:", req.session.user);
        // Sanity: ensure no unintended loyalty account creation at login
        try {
          const chk = db.prepare(
            "SELECT COUNT(*) AS cnt FROM loyalty_accounts WHERE user_id=?"
          ).get(req.session.user.id);
          if (chk.cnt > 1) console.warn("[login] duplicate loyalty accounts detected for user:", req.session.user.id);
        } catch (e) {
          console.warn("[login] loyalty check skipped:", e.message);
        }

        return res.json({
          success: true,
          user: req.session.user,
          message: "Login successful",
        });
      });
    } else {
      console.log("[login] session set (no explicit save)", req.session.user);
      return res.json({
        success: true,
        user: req.session.user,
        message: "Login successful",
      });
    }
  } catch (err) {
    console.error("[login] unexpected error:", err);
    return res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: err.message } });
  }
});

module.exports = router;

