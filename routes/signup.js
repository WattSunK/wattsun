// routes/signup.js
const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

let bcrypt = null;
try { bcrypt = require("bcryptjs"); } catch (_) { /* optional */ }

const router = express.Router();

const DB_PATH =
  process.env.DB_PATH_USERS ||
  process.env.SQLITE_DB ||
  path.join(__dirname, "../data/dev/wattsun.dev.db");

function withDb(cb) {
  const db = new sqlite3.Database(DB_PATH);
  db.serialize(() => cb(db));
}

function getUserSchema(db, cb) {
  db.all("PRAGMA table_info(users);", [], (err, rows) => {
    if (err) return cb(err);
    const cols = new Set(rows.map(r => r.name));
    cb(null, {
      hasPasswordHash: cols.has("password_hash"),
      hasPasswordPlain: cols.has("password"),
      hasCreatedAt: cols.has("created_at"),
      hasCreatedAtCamel: cols.has("createdAt"),
      hasStatus: cols.has("status"),
      hasType: cols.has("type"),
      hasPhone: cols.has("phone"),
    });
  });
}

function handleSignup(req, res) {
  const { name, email, password, phone } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ ok: false, error: "Missing name, email or password" });
  }

  const normEmail = String(email).trim().toLowerCase();
  const normPhone = phone ? String(phone).trim() : null;

  withDb(db => {
    getUserSchema(db, (schemaErr, schema) => {
      if (schemaErr) {
        console.error("[signup] schema error:", schemaErr);
        return res.status(500).json({ ok: false, error: "Database error" });
      }

      db.get(
        "SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1",
        [normEmail],
        (e1, row) => {
          if (e1) {
            console.error("[signup] select error:", e1);
            return res.status(500).json({ ok: false, error: "Database error" });
          }
          if (row) {
            return res.status(409).json({ ok: false, error: "Email already registered" });
          }

          const now = new Date().toISOString().replace("T", " ").replace("Z", "");
          const hash = (schema.hasPasswordHash && bcrypt)
            ? bcrypt.hashSync(password, 10)
            : null;

          const fields = ["name", "email"];
          const marks  = ["?", "?"];
          const vals   = [name, normEmail];

          if (schema.hasPhone) { fields.push("phone");  marks.push("?"); vals.push(normPhone); }
          if (schema.hasType)  { fields.push("type");   marks.push("?"); vals.push("User"); }
          if (schema.hasStatus){ fields.push("status"); marks.push("?"); vals.push("Active"); }

          if (schema.hasPasswordHash) {
            fields.push("password_hash"); marks.push("?"); vals.push(hash ?? password);
          } else if (schema.hasPasswordPlain) {
            fields.push("password"); marks.push("?"); vals.push(password);
          } else {
            return res.status(400).json({ ok: false, error: "No password column in schema" });
          }

          if (schema.hasCreatedAt) {
            fields.push("created_at"); marks.push("?"); vals.push(now);
          } else if (schema.hasCreatedAtCamel) {
            fields.push("createdAt"); marks.push("?"); vals.push(now);
          }

          const sql = `INSERT INTO users (${fields.join(",")}) VALUES (${marks.join(",")})`;
          db.run(sql, vals, function (e2) {
            if (e2) {
              console.error("[signup] insert error:", e2);
              return res.status(500).json({ ok: false, error: "Database error" });
            }
            return res.json({
              ok: true,
              user: { id: this.lastID, name, email: normEmail, phone: normPhone, type: "User", status: "Active" }
            });
          });
        }
      );
    });
  });
}

// Support BOTH mounts:
//   app.use("/api/signup", require("./routes/signup"))
//   app.use("/api",          require("./routes/signup"))
router.post("/", express.json(), handleSignup);
router.post("/signup", express.json(), handleSignup);

module.exports = router;
