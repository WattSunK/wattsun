#!/usr/bin/env node
/**
 * scripts/loyalty_weekly_digest.js
 *
 * Adds note to weekly digests and safely ensures the note column exists.
 */

const sqlite3 = require("sqlite3").verbose();
const path = require("path");
require("dotenv").config();

const DB = process.env.SQLITE_DB || path.join(process.cwd(), "data/dev", "wattsun.dev.db");
const db = new sqlite3.Database(DB);

function ensureNoteColumn(callback) {
  db.get("PRAGMA table_info(notifications_queue);", (err, row) => {
    if (err) return callback(err);
    db.all("PRAGMA table_info(notifications_queue);", (err2, rows) => {
      if (err2) return callback(err2);
      const hasNote = rows.some((r) => r.name === "note");
      if (hasNote) return callback();
      console.log("[weekly_digest] Adding 'note' column to notifications_queue...");
      db.run("ALTER TABLE notifications_queue ADD COLUMN note TEXT;", callback);
    });
  });
}

function main() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  console.log(`[weekly_digest] DB = ${DB}`);
  console.log(`[weekly_digest] since = ${since}`);

  db.all(
    `SELECT la.id AS account_id, la.user_id, u.email, la.points_balance AS balance, IFNULL(SUM(ll.points_delta), 0) AS weeklyPoints
     FROM loyalty_accounts la
     JOIN users u ON u.id = la.user_id
     LEFT JOIN loyalty_ledger ll ON ll.account_id = la.id AND ll.created_at >= ?
     WHERE la.status='Active'
     GROUP BY la.id`,
    [since],
    (err, rows) => {
      if (err) {
        console.error(err);
        return db.close();
      }

      const stmt = db.prepare(`
        INSERT INTO notifications_queue (kind, user_id, email, payload, status, note)
        VALUES ('weekly_digest', ?, ?, ?, 'Queued', ?)
      `);

      const noteBase = `Weekly digest for week ending ${new Date().toISOString().slice(0, 10)}`;

      rows.forEach((r) => {
        const payload = JSON.stringify({ balance: r.balance, weeklyPoints: r.weeklyPoints });
        stmt.run(r.user_id, r.email, payload, noteBase, (err2) => {
          if (err2) console.error("[weekly_digest] Enqueue error:", err2.message);
          else console.log(`[weekly_digest] Enqueued digest for ${r.email}`);
        });
      });

      stmt.finalize(() => {
        console.log(`[weekly_digest] Enqueued: ${rows.length}`);
        db.close();
      });
    }
  );
}

ensureNoteColumn((err) => {
  if (err) {
    console.error("[weekly_digest] Error ensuring note column:", err.message);
    db.close();
  } else {
    main();
  }
});