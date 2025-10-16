// routes/users.js
const express = require("express");
const router = express.Router();

/**
 * All queries reuse the shared sqliteDb from server.js
 *   server.js: app.set("db", sqliteDb)
 *   here: req.app.get("db")
 */

// ===========================
// GET current logged-in user
// ===========================
router.get("/users/me", (req, res) => {
  const db = req.app.get("db");
  const u = req.session?.user;
  if (!u) {
    return res.status(401).json({ success: false, error: "Not logged in" });
  }

  try {
    const row = db
      .prepare("SELECT id, name, email, phone, type, status, created_at FROM users WHERE id = ?")
      .get(u.id);
    if (!row) return res.status(404).json({ error: "User not found" });
    res.json({ success: true, user: row });
  } catch (err) {
    console.error("Failed to fetch current user:", err.message);
    return res.status(500).json({
      error: "Failed to fetch user",
      detail: err.message,
      id: u.id,
    });
  }
});

// ===========================
// GET all users
// ===========================
router.get("/users", (req, res) => {
  const db = req.app.get("db");
  try {
    const rows = db
      .prepare("SELECT id, name, email, phone, type, status, created_at FROM users")
      .all();
    res.json({ success: true, users: rows });
  } catch (err) {
    console.error("Failed to fetch users:", err.message);
    return res.status(500).json({ error: "Failed to fetch users", detail: err.message });
  }
});

// ===========================
// GET one user by ID (only numeric IDs)
// ===========================
router.get("/users/:id(\\d+)", (req, res) => {
  const db = req.app.get("db");
  try {
    const row = db
      .prepare("SELECT id, name, email, phone, type, status, created_at FROM users WHERE id = ?")
      .get(req.params.id);
    if (!row) return res.status(404).json({ error: "User not found" });
    res.json({ success: true, user: row });
  } catch (err) {
    console.error("Failed to fetch user:", err.message);
    return res.status(500).json({ error: "Failed to fetch user", detail: err.message });
  }
});

module.exports = router;
