// routes/reset.js
const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const crypto = require("crypto");

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
      hasResetToken: cols.has("reset_token"),
      hasResetExpiry: cols.has("reset_expiry"),
    });
  });
}

function makeToken() {
  return crypto.randomBytes(24).toString("hex");
}

// ---- Request token
function handleRequest(req, res) {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ ok: false, error: "Missing email" });

  const normEmail = String(email).trim().toLowerCase();

  withDb(db => {
    getUserSchema(db, (schemaErr, schema) => {
      if (schemaErr) {
        console.error("[reset] schema error:", schemaErr);
        return res.status(500).json({ ok: false, error: "Database error" });
      }
      if (!schema.hasResetToken || !schema.hasResetExpiry) {
        return res.status(400).json({ ok: false, error: "Reset not supported by schema" });
      }

      const token = makeToken();
      const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour

      db.run(
        `UPDATE users
            SET reset_token = ?, reset_expiry = ?
          WHERE LOWER(email) = LOWER(?)`,
        [token, expiry, normEmail],
        function (e) {
          if (e) {
            console.error("[reset] request update error:", e);
            return res.status(500).json({ ok: false, error: "Database error" });
          }
          if (this.changes === 0) {
            return res.status(404).json({ ok: false, error: "Email not found" });
          }
          // In production you'd email the token; here we return it for UI/testing.
          return res.json({ ok: true, token, expires: expiry });
        }
      );
    });
  });
}

// ---- Confirm reset
function handleConfirm(req, res) {
  const { token, password } = req.body || {};
  if (!token || !password) {
    return res.status(400).json({ ok: false, error: "Missing token or password" });
  }

  withDb(db => {
    getUserSchema(db, (schemaErr, schema) => {
      if (schemaErr) {
        console.error("[reset] schema error:", schemaErr);
        return res.status(500).json({ ok: false, error: "Database error" });
      }
      if (!schema.hasResetToken || !schema.hasResetExpiry) {
        return res.status(400).json({ ok: false, error: "Reset not supported by schema" });
      }

      db.get(
        `SELECT id, reset_expiry FROM users WHERE reset_token = ? LIMIT 1`,
        [token],
        (selErr, row) => {
          if (selErr) {
            console.error("[reset] select token error:", selErr);
            return res.status(500).json({ ok: false, error: "Database error" });
          }
          if (!row) return res.status(400).json({ ok: false, error: "Invalid token" });
          if (!row.reset_expiry || row.reset_expiry < Math.floor(Date.now() / 1000)) {
            return res.status(400).json({ ok: false, error: "Token expired" });
          }

          const hashed = (schema.hasPasswordHash && bcrypt)
            ? bcrypt.hashSync(password, 10)
            : null;

          const setPasswordSql = schema.hasPasswordHash
            ? `password_hash = ?`
            : schema.hasPasswordPlain
              ? `password = ?`
              : null;

          if (!setPasswordSql) {
            return res.status(400).json({ ok: false, error: "No password column in schema" });
          }

          const newValue = hashed ?? password;

          db.run(
            `UPDATE users
                SET ${setPasswordSql}, reset_token = NULL, reset_expiry = NULL
              WHERE id = ?`,
            [newValue, row.id],
            function (updErr) {
              if (updErr) {
                console.error("[reset] update password error:", updErr);
                return res.status(500).json({ ok: false, error: "Database error" });
              }
              return res.json({ ok: true });
            }
          );
        }
      );
    });
  });
}

// Backward-compatible single endpoint (decide by body)
router.post("/reset", express.json(), (req, res) => {
  if (req.body && req.body.token && req.body.password) return handleConfirm(req, res);
  return handleRequest(req, res);
});

// Explicit endpoints if your UI calls these:
router.post("/reset/request", express.json(), handleRequest);
router.post("/reset/confirm", express.json(), handleConfirm);

module.exports = router;
