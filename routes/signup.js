// routes/signup.js
const express = require("express");
const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const router = express.Router();
const db = new sqlite3.Database(path.resolve(__dirname, "../user-setup/users.db"));

// Normalize phone consistently
function normalizePhone(phone) {
  if (!phone) return "";
  let p = String(phone).trim().replace(/\s+/g, "");
  if (p.startsWith("0")) p = p.slice(1);
  if (!p.startsWith("+254")) p = p.startsWith("254") ? ("+" + p) : ("+254" + p);
  return p;
}

// Mounted as: app.use("/api/signup", require("./routes/signup"));
// Endpoint becomes: POST /api/signup
router.post("/", async (req, res) => {
  try {
    let { name, email, phone, password, type } = req.body || {};
    name = (name || "").trim();
    email = (email || "").trim().toLowerCase();   // normalize email
    phone = normalizePhone(phone);                // normalize phone
    type = (type || "Customer").trim();

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }
    if (!/^\+\d{10,15}$/.test(phone)) {
      return res.status(400).json({ error: "Invalid phone format. Use +254712345678 style." });
    }

    // Block duplicate email/phone
    const dupeSql = `SELECT id,email,phone FROM users WHERE lower(email)=lower(?) OR phone=? LIMIT 1`;
    db.get(dupeSql, [email, phone], async (err, row) => {
      if (err) return res.status(500).json({ error: "Database error" });
      if (row) {
        return res.status(409).json({
          error: row.email.toLowerCase() === email ? "Email already registered" : "Phone already registered"
        });
      }

      let hashed;
      try {
        hashed = await bcrypt.hash(String(password), 10);
      } catch {
        return res.status(500).json({ error: "Internal error" });
      }

      const ins = `
        INSERT INTO users (name,email,phone,type,password_hash,status,createdAt,updatedAt)
        VALUES (?,?,?,?,?,'Active',datetime('now'),datetime('now'))
      `;
      db.run(ins, [name, email, phone, type, hashed], function (insErr) {
        if (insErr) {
          if (/UNIQUE/i.test(insErr.message)) {
            return res.status(409).json({ error: "Email or phone already registered" });
          }
          return res.status(500).json({ error: "Failed to create user" });
        }
        return res.status(201).json({ success: true, user: { id: this.lastID, name, email, phone, type } });
      });
    });
  } catch {
    return res.status(500).json({ error: "Unexpected error" });
  }
});

module.exports = router;
