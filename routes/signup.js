// routes/signup.js
const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

let bcrypt; try { bcrypt = require("bcryptjs"); } catch { bcrypt = null; }

const router = express.Router();

// Accept both JSON and URL-encoded payloads
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const DB_PATH =
  process.env.DB_PATH_USERS ||
  process.env.SQLITE_DB ||
  path.join(__dirname, "../data/dev/wattsun.dev.db");

function withDb(cb) {
  const db = new sqlite3.Database(DB_PATH);
  db.serialize(() => cb(db));
}

router.post(["/", "/signup"], (req, res) => {
  const body = req.body || {};
  // allow a few common aliases from forms
  const name  = (body.name ?? body.username ?? "").toString().trim();
  const email = (body.email ?? "").toString().trim().toLowerCase();
  const phone = (body.phone ?? body.phoneNumber ?? "").toString().trim() || null;
  const password = (body.password ?? body.pass ?? "").toString();

  if (!name || !email || !password) {
    return res.status(400).json({ ok:false, error:"Missing name, email or password" });
  }

  const now = new Date().toISOString().replace("T"," ").replace("Z","");
  const hash = bcrypt ? bcrypt.hashSync(password, 10) : password; // bcrypt preferred

  withDb(db => {
    // Pre-check (best-effort); insert also guards with UNIQUE handling
    db.get(
      "SELECT id FROM users WHERE LOWER(email)=LOWER(?) LIMIT 1",
      [email],
      (e1,row) => {
        if (e1) {
          console.error("[signup] select error:", e1);
          return res.status(500).json({ ok:false, error:"Database error" });
        }
        if (row) return res.status(409).json({ ok:false, error:"Email already registered" });

        const sql = `INSERT INTO users
          (name,email,phone,type,status,password_hash,created_at)
          VALUES (?,?,?,?,?,?,?)`;
        const vals = [name, email, phone, "User", "Active", hash, now];

        db.run(sql, vals, function(e2){
          if (e2) {
            // Downgrade UNIQUE email to 409
            const msg = String(e2 && e2.message || "");
            if ((e2.code === "SQLITE_CONSTRAINT" || /constraint/i.test(msg)) && /users.*email/i.test(msg)) {
              console.warn("[signup] unique email constraint:", msg);
              return res.status(409).json({ ok:false, error:"Email already registered" });
            }
            console.error("[signup] insert error:", e2, "\n[signup] SQL:", sql, "\n[signup] VALS:", vals);
            return res.status(500).json({ ok:false, error:"Database error" });
          }
          return res.json({
            ok:true,
            user:{ id:this.lastID, name, email, phone, type:"User", status:"Active" }
          });
        });
      }
    );
  });
});

module.exports = router;
