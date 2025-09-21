#!/usr/bin/env node
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
require("dotenv").config();
const DB = process.env.SQLITE_DB || path.join(process.cwd(), "data/dev/wattsun.dev.db");
const db = new sqlite3.Database(DB);

// Minimal: enqueue weekly_digest for all Active accounts with a user email
db.all(`
  SELECT la.user_id, u.email,
         la.points_balance AS balance
  FROM loyalty_accounts la
  JOIN users u ON u.id = la.user_id
  WHERE la.status='Active'
`, [], (err, rows) => {
  if (err) { console.error(err); process.exit(1); }
  const stmt = db.prepare(`
    INSERT INTO notifications_queue (kind, user_id, email, payload, status)
    VALUES ('weekly_digest', ?, ?, ?, 'Queued')
  `);
  rows.forEach(r => {
    const payload = JSON.stringify({ balance: r.balance });
    stmt.run(r.user_id, r.email, payload);
  });
  stmt.finalize(() => { console.log(`[weekly] enqueued: ${rows.length}`); db.close(); });
});
