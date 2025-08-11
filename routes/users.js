// routes/users.db.js
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const router = express.Router();
const dbPath = path.join(__dirname, "../user-setup/users.db");
console.log("📂 Using DB path:", dbPath);
const db = new sqlite3.Database(dbPath);

// GET all users
router.get("/users", (req, res) => {
  db.all("SELECT * FROM users", (err, rows) => {
    if (err) {
      console.error("Failed to fetch users:", err);
      return res.status(500).json({ error: "Failed to fetch users" });
    }
    console.log("🧪 Users fetched:", rows);
    res.json(rows);
  });
});

// GET one user by ID
router.get("/users/:id", (req, res) => {
  db.get("SELECT * FROM users WHERE id = ?", [req.params.id], (err, row) => {
    if (err) {
      console.error("Failed to fetch user:", err);
      return res.status(500).json({ error: "Failed to fetch user" });
    }
    if (!row) return res.status(404).json({ error: "User not found" });
    res.json(row);
  });
});

module.exports = router;
