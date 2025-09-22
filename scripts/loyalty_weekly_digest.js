#!/usr/bin/env node
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
require("dotenv").config();

const DB = process.env.SQLITE_DB || path.join(process.cwd(), "data/dev/wattsun.dev.db");
const db = new sqlite3.Database(DB);

const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

// Active accounts in valid enrollment window → weekly sum + balance
db.all(`
  SELECT la.id AS account_id,
         la.user_id,
         u.email,
         la.points_balance AS balance,
         IFNULL(SUM(ll.points_delta), 0) AS weeklyPoints
  FROM loyalty_accounts la
  JOIN users u ON u.id = la.user_id
  LEFT JOIN loyalty_ledger ll
    ON ll.account_id = la.id
   AND ll.created_at >= ?
  WHERE la.status='Active'
    AND date('now') >= date(la.start_date)
    AND date('now') < date(la.start_date, '+' || la.duration_months || ' months')
  GROUP BY la.id
`, [since], (err, rows) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  const stmt = db.prepare(`
    INSERT INTO notifications_queue (kind, user_id, email, payload, status)
    VALUES ('weekly_digest', ?, ?, ?, 'Queued')
  `);

  rows.forEach(r => {
    const payload = JSON.stringify({
      balance: r.balance,
      weeklyPoints: r.weeklyPoints
    });
    stmt.run(r.user_id, r.email, payload);
  });

  stmt.finalize(() => {
    console.log(`[weekly] enqueued: ${rows.length}`);
    db.close();
  });
});
