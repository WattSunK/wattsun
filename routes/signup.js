// routes/signup.js
const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

let bcrypt; try { bcrypt = require("bcryptjs"); } catch { bcrypt = null; }

const router = express.Router();

const DB_PATH =
  process.env.DB_PATH_USERS ||
  process.env.SQLITE_DB ||
  path.join(__dirname, "../data/dev/wattsun.dev.db");

function withDb(cb){ const db=new sqlite3.Database(DB_PATH); db.serialize(()=>cb(db)); }

router.post(["/", "/signup"], express.json(), (req, res) => {
  const { name, email, password, phone } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ ok:false, error:"Missing name, email or password" });
  }

  const normEmail = String(email).trim().toLowerCase();
  const normPhone = phone ? String(phone).trim() : null;
  const now = new Date().toISOString().replace("T"," ").replace("Z","");

  withDb(db => {
    db.get(
      "SELECT id FROM users WHERE LOWER(email)=LOWER(?) LIMIT 1",
      [normEmail],
      (e1, row) => {
        if (e1) { console.error("[signup] select error:", e1); return res.status(500).json({ ok:false, error:"Database error" }); }
        if (row) return res.status(409).json({ ok:false, error:"Email already registered" });

        const hash = bcrypt ? bcrypt.hashSync(password, 10) : password; // bcrypt preferred

        const sql = `INSERT INTO users
          (name,email,phone,type,status,password_hash,created_at)
          VALUES (?,?,?,?,?,?,?)`;

        const vals = [name, normEmail, normPhone, "User", "Active", hash, now];

        db.run(sql, vals, function(e2){
          if (e2) { console.error("[signup] insert error:", e2); return res.status(500).json({ ok:false, error:"Database error" }); }
          return res.json({ ok:true, user:{ id:this.lastID, name, email:normEmail, phone:normPhone, type:"User", status:"Active" } });
        });
      }
    );
  });
});

module.exports = router;
