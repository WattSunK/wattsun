// routes/users.js
const express = require("express");
const router = express.Router();

/**
 * All queries reuse the shared sqliteDb from server.js
 *   server.js: app.set("db", sqliteDb)
 *   here: req.app.get("db")
 */

// GET all users (mostly for admin/debug)
router.get("/users", (req, res) => {
  const db = req.app.get("db");
  db.all(
    "SELECT id, name, email, phone, type, status, created_at FROM users",
    (err, rows) => {
      if (err) {
        console.error("Failed to fetch users:", err);
        return res.status(500).json({ error: "Failed to fetch users" });
      }
      res.json({ success: true, users: rows });
    }
  );
});

// GET one user by ID
router.get("/users/:id", (req, res) => {
  const db = req.app.get("db");
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
  const db = req.app.get("db");
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
