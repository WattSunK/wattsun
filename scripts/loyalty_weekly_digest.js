#!/usr/bin/env node
/**
 * scripts/loyalty_weekly_digest.js
 *
 * Summarize weekly points for each active user
 * and enqueue notification rows in notifications_queue.
 */

const sqlite3 = require("sqlite3").verbose();
const path = require("path");
require("dotenv").config();

const DB = process.env.SQLITE_DB || path.join(process.cwd(), "data/dev", "wattsun.dev.db");
const db = new sqlite3.Database(DB);

// Weekly window (last 7 days)
const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

db.all(
  `
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
  GROUP BY la.id
`,
  [since],
  (err, rows) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    const stmt = db.prepare(`
      INSERT INTO notifications_queue (kind, user_id, email, payload, status)
      VALUES ('weekly_digest', ?, ?, ?, 'Queued')
    `);

    rows.forEach((r) => {
      console.log(
        `[weekly] preparing digest for user_id=${r.user_id}, email=${r.email}, balance=${r.balance}, weeklyPoints=${r.weeklyPoints}`
      );
      const payload = JSON.stringify({
        balance: r.balance,
        weeklyPoints: r.weeklyPoints,
      });
      stmt.run(r.user_id, r.email, payload, (err2) => {
        if (err2) console.error("Enqueue error:", err2.message);
        else console.log(`[weekly] enqueued digest for ${r.email}`);
      });
    });

    stmt.finalize(() => {
      console.log(`[weekly] enqueued: ${rows.length}`);
      db.close();
    });
  }
);
