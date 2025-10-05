// routes/login.js
const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

let bcrypt; try { bcrypt = require("bcryptjs"); } catch { bcrypt = null; }

const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const DB_PATH =
  process.env.DB_PATH_USERS ||
  process.env.SQLITE_DB ||
  path.join(__dirname, "../data/dev/wattsun.dev.db");

router.post("/login", (req, res) => {
  const body = req.body || {};
  const email = (body.email ?? "").toString().trim().toLowerCase();
  const password = (body.password ?? "").toString();

  if (!email || !password) return res.status(400).json({ ok:false, error:"Missing credentials" });

  const db = new sqlite3.Database(DB_PATH);
  db.get(
    `SELECT id,name,email,phone,type,status,password_hash
       FROM users
      WHERE LOWER(email)=LOWER(?)
      LIMIT 1`,
    [email],
    (err, row) => {
      if (err) {
        console.error("[login] query error:", err);
        return res.status(500).json({ ok:false, error:"Database error" });
      }
      if (!row) return res.status(401).json({ ok:false, error:"Invalid credentials" });

      let ok = false;
      if (row.password_hash && bcrypt) {
        try { ok = bcrypt.compareSync(password, row.password_hash); } catch { ok = false; }
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
