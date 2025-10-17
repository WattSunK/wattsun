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
// UPDATE current logged-in user
// ===========================
router.put("/users/me", (req, res) => {
  const db = req.app.get("db");
  const u = req.session?.user;
  if (!u) {
    return res.status(401).json({ success: false, error: "Not logged in" });
  }

  const { name, email, phone } = req.body || {};

  // Basic validation (soft)
  const nameVal = typeof name === "string" ? name.trim() : undefined;
  const emailVal = typeof email === "string" ? email.trim() : undefined;
  const phoneVal = typeof phone === "string" ? phone.trim() : undefined;

  try {
    const row = db
      .prepare("SELECT id, name, email, phone, type, status, created_at FROM users WHERE id = ?")
      .get(u.id);
    if (!row) return res.status(404).json({ success: false, error: "User not found" });

    const newName = nameVal !== undefined ? nameVal : row.name;
    const newEmail = emailVal !== undefined ? emailVal : row.email;
    const newPhone = phoneVal !== undefined ? phoneVal : row.phone;

    db.prepare("UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?")
      .run(newName, newEmail, newPhone, u.id);

    const updated = db
      .prepare("SELECT id, name, email, phone, type, status, created_at FROM users WHERE id = ?")
      .get(u.id);

    // Update session snapshot for convenience
    try { req.session.user = { ...(req.session.user||{}), ...updated }; } catch {}

    return res.json({ success: true, user: updated });
  } catch (err) {
    console.error("[users][PUT /users/me] error:", err);
    return res.status(500).json({ success: false, error: "DB error", detail: err.message });
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
