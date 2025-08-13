// routes/login.js
const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

let bcrypt;
try { bcrypt = require("bcryptjs"); } catch { bcrypt = null; }

const router = express.Router();

// Users DB (same for login/signup/reset)
const DB_PATH =
  process.env.DB_PATH_USERS ||
  process.env.SQLITE_DB ||
  path.join(__dirname, "../data/dev/wattsun.dev.db");

router.post("/login", express.json(), (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ ok:false, error:"Missing credentials" });

  const db = new sqlite3.Database(DB_PATH);
  db.get(
    `SELECT id,name,email,phone,type,status,password_hash
       FROM users
      WHERE LOWER(email)=LOWER(?)
      LIMIT 1`,
    [String(email).trim()],
    (err, row) => {
      if (err) {
        console.error("[login] query error:", err);
        return res.status(500).json({ ok:false, error:"Database error" });
      }
      if (!row) return res.status(401).json({ ok:false, error:"Invalid credentials" });

      const hash = row.password_hash || null;

      let ok = false;
      if (hash && bcrypt) {
        try { ok = bcrypt.compareSync(password, hash); } catch { ok = false; }
      } else {
        // fallback only if your DB ever stored plain text (not present in your schema)
        ok = false;
      }
      if (!ok) return res.status(401).json({ ok:false, error:"Invalid credentials" });

      try {
        req.session.user = {
          id: row.id, name: row.name, email: row.email,
          phone: row.phone, type: row.type, status: row.status
        };
      } catch (e) { console.warn("[login] session set failed:", e); }

      return res.json({ ok:true, user: req.session.user || null });
    }
  );
});

module.exports = router;
