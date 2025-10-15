// routes/login.js
const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");   // ✅ use same sync API as rest of app

let bcrypt;
try {
  bcrypt = require("bcryptjs");
} catch {
  bcrypt = null;
}

const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const DB_PATH =
  process.env.DB_PATH_USERS ||
  process.env.SQLITE_DB ||
  path.join(__dirname, "../data/dev/wattsun.dev.db");

// open once (sync DB handle)
const db = new Database(DB_PATH);

router.post("/login", (req, res) => {
  try {
    const body = req.body || {};
    const emailOrPhone = (body.email || body.emailOrPhone || "").toString().trim().toLowerCase();
    const password = (body.password || "").toString();

    if (!emailOrPhone || !password) {
      return res.status(400).json({ success: false, error: { code: "MISSING_CREDENTIALS", message: "Missing credentials" } });
    }

    // match by email (lowercased) or phone
    const row = db.prepare(
      `SELECT id,name,email,phone,type,status,password_hash
         FROM users
        WHERE LOWER(email)=LOWER(?) OR phone=?
        LIMIT 1`
    ).get(emailOrPhone, emailOrPhone);

    if (!row) {
      return res.status(401).json({ success: false, error: { code: "INVALID", message: "Invalid credentials" } });
    }

    let ok = false;
    if (row.password_hash && bcrypt) {
      try {
        ok = bcrypt.compareSync(password, row.password_hash);
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      return res.status(401).json({ success: false, error: { code: "INVALID", message: "Invalid credentials" } });
    }

    // ✅ set session
    req.session.user = {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      type: row.type,
      role: row.type,   // normalize (role/type both available)
      status: row.status
    };

    if (req.session.save) {
      req.session.save(() => {
        console.log("[login] session saved:", req.session.user);
        // 🧩 Sanity: ensure no unintended loyalty account creation at login
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
          message: "Login successful"
        });
      });
    } else {
      console.log("[login] session set (no explicit save)", req.session.user);
      return res.json({
        success: true,
        user: req.session.user,
        message: "Login successful"
      });
    }
  } catch (err) {
    console.error("[login] unexpected error:", err);
    return res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: err.message } });
  }
});

module.exports = router;
