// routes/reset.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const path = require('path');

// Load environment variables
require('dotenv').config();

const DB_PATH = path.join(__dirname, '../user-setup/users.db');
const db = new sqlite3.Database(DB_PATH);

const router = express.Router();

// Configure SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Request password reset
router.post('/reset-request', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const resetToken = crypto.randomBytes(20).toString('hex');
  const expireAt = Date.now() + 3600000; // 1 hour

  const sql = `UPDATE users SET reset_token = ?, reset_expiry = ? WHERE email = ?`;
  db.run(sql, [resetToken, expireAt, email], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Email not found' });

    const resetUrl = `https://wattsun.co.ke/reset-password.html?token=${resetToken}&email=${encodeURIComponent(email)}`;

    transporter.sendMail({
      from: `"WattSun Solar" <${transporter.options.auth.user}>`,
      to: email,
      subject: 'Password Reset Request',
      text: `You requested a password reset. Click below to reset your password:\n\n${resetUrl}\n\nThis link expires in 1 hour.`
    }, (err, info) => {
      if (err) {
        console.error("❌ Email send failed:", err);
        return res.status(500).json({ error: 'Failed to send email. Try again later.' });
      } else {
        console.log("✅ Email sent:", info.response);
        return res.json({ success: true, message: 'Password reset email sent.' });
      }
    });
  });
});

// Confirm password reset
router.post('/reset-password', (req, res) => {
  const { email, token, newPassword } = req.body;
  if (!email || !token || !newPassword) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const now = Date.now();
  const sql = `SELECT reset_expiry FROM users WHERE email = ? AND reset_token = ?`;
  db.get(sql, [email, token], async (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(400).json({ error: 'Invalid token or email' });
    if (row.reset_expiry < now) return res.status(400).json({ error: 'Token expired' });

    const bcrypt = require('bcrypt');
    const hashed = await bcrypt.hash(newPassword, 10);

    const updateSql = `UPDATE users SET password_hash = ?, reset_token = NULL, reset_expiry = NULL WHERE email = ?`;
    db.run(updateSql, [hashed, email], function(err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ success: true, message: 'Password has been reset.' });
    });
  });
});

module.exports = router;
