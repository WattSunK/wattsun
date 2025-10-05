
// lib/notify.js
// Minimal enqueue helper for notifications_queue (SQLite)

const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const DB_PATH = process.env.DB_PATH_USERS || process.env.SQLITE_DB || path.join(process.cwd(), "data/dev/wattsun.dev.db");
const db = new sqlite3.Database(DB_PATH);

function enqueue(kind, { userId = null, email = null, payload = {} } = {}) {
  return new Promise((resolve, reject) => {
    const jsonPayload = JSON.stringify(payload || {});
    db.run(
      `INSERT INTO notifications_queue (kind, user_id, email, payload, status) VALUES (?, ?, ?, ?, 'Queued')`,
      [String(kind), userId || null, email || null, jsonPayload],
      function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID });
      }
    );
  });
}

module.exports = { enqueue };
