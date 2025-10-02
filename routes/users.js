// routes/users.js
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const router = express.Router();

// Use canonical users DB (wattsun.dev.db, not inventory.db)
const dbPath = process.env.DB_PATH_USERS || path.join(__dirname, "../data/dev/wattsun.dev.db");
console.log("📂 [users.js] Using DB path:", dbPath);
const db = new sqlite3.Database(dbPath);

// GET all users (mostly for admin/debug)
router.get("/users", (req, res) => {
  db.all("SELECT id, name, email, phone, type, status, created_at FROM users", (err, rows) => {
    if (err) {
      console.error("Failed to fetch users:", err);
      return res.status(500).json({ error: "Failed to fetch users" });
    }
    res.json({ success: true, users: rows });
  });
});

// GET one user by ID
router.get("/users/:id", (req, res) => {
  db.get(
    "SELECT id, name, email, phone, type, status, created_at FROM users WHERE id = ?",
    [req.params.id],
    (err, row) => {
      if (err) {
        console.error("Failed to fetch user:", err);
        return res.status(500).json({ error: "Failed to fetch user" });
      }
      if (!row) return res.status(404).json({ error: "User not found" });
      res.json({ success: true, user: row });
    }
  );
});

// GET current logged-in user (session-based)
router.get("/users/me", (req, res) => {
  const u = req.session?.user;
  if (!u) {
    return res.status(401).json({ success: false, error: "Not logged in" });
  }
  db.get(
    "SELECT id, name, email, phone, type, status, created_at FROM users WHERE id = ?",
    [u.id],
    (err, row) => {
      if (err) {
        console.error("Failed to fetch current user:", err);
        return res.status(500).json({ error: "Failed to fetch user" });
      }
      if (!row) return res.status(404).json({ error: "User not found" });
      res.json({ success: true, user: row });
    }
  );
});

module.exports = router;
