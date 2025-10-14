// routes/reset.js
const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const crypto = require("crypto");

let bcrypt; try { bcrypt = require("bcryptjs"); } catch { bcrypt = null; }

const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const DB_PATH =
  process.env.DB_PATH_USERS ||
  process.env.SQLITE_DB ||
  path.join(__dirname, "../data/dev/wattsun.dev.db");

function withDb(cb){ const db=new sqlite3.Database(DB_PATH); db.serialize(()=>cb(db)); }
const tokenTTL = 60 * 60; // 1 hour

function requestReset(req, res) {
  const email = (req.body?.email ?? "").toString().trim().toLowerCase();
  if (!email) return res.status(400).json({ ok:false, error:"Missing email" });

  withDb(db => {
    const token = crypto.randomBytes(24).toString("hex");
    const expiry = Math.floor(Date.now()/1000) + tokenTTL;

    db.run(
      `UPDATE users SET reset_token=?, reset_expiry=? WHERE LOWER(email)=LOWER(?)`,
      [token, expiry, email],
      function (e) {
        if (e) { console.error("[reset] request error:", e); return res.status(500).json({ ok:false, error:"Database error" }); }
        if (this.changes === 0) return res.status(404).json({ ok:false, error:"Email not found" });
        return res.json({ ok:true, token, expires: expiry }); // dev: token included
      }
    );
  });
}

function confirmReset(req, res) {
  const token = (req.body?.token ?? "").toString().trim();
  const password = (req.body?.password ?? "").toString();
  if (!token || !password) return res.status(400).json({ ok:false, error:"Missing token or password" });

  withDb(db => {
    db.get(`SELECT id, reset_expiry FROM users WHERE reset_token=? LIMIT 1`, [token], (e,row) => {
      if (e) { console.error("[reset] lookup error:", e); return res.status(500).json({ ok:false, error:"Database error" }); }
      if (!row) return res.status(400).json({ ok:false, error:"Invalid token" });
      if (!row.reset_expiry || row.reset_expiry < Math.floor(Date.now()/1000)) {
        return res.status(400).json({ ok:false, error:"Token expired" });
      }

      const hash = bcrypt ? bcrypt.hashSync(password, 10) : password;

      db.run(
        `UPDATE users
            SET password_hash=?, reset_token=NULL, reset_expiry=NULL
          WHERE id=?`,
        [hash, row.id],
        function (e2) {
          if (e2) { console.error("[reset] update error:", e2); return res.status(500).json({ ok:false, error:"Database error" }); }
          return res.json({ ok:true });
        }
      );
    });
  });
}

// Legacy + your UI aliases
router.post("/reset",          (req,res)=> (req.body && req.body.token) ? confirmReset(req,res) : requestReset(req,res));
router.post("/reset/request",  requestReset);
router.post("/reset/confirm",  confirmReset);
router.post("/reset-request",  requestReset);   // UI uses this
router.post("/reset-confirm",  confirmReset);   // UI may use this next

module.exports = router;
