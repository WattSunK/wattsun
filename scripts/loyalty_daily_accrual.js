#!/usr/bin/env node
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
require("dotenv").config();

const DB = process.env.SQLITE_DB || path.join(process.cwd(), "data/dev/wattsun.dev.db");
const db = new sqlite3.Database(DB);

// credits +1 point if within enrollment window, once per day
db.serialize(() => {
  db.run("BEGIN");

  db.run(`
    INSERT INTO loyalty_ledger (account_id, kind, points_delta, note)
    SELECT la.id, 'daily', 1, 'Daily accrual'
    FROM loyalty_accounts la
    WHERE la.status='Active'
      AND date('now') >= date(la.start_date)
      AND date('now') < date(la.start_date, '+' || la.duration_months || ' months')
      AND NOT EXISTS (
        SELECT 1 FROM loyalty_ledger ll
        WHERE ll.account_id = la.id
          AND ll.kind='daily'
          AND date(ll.created_at) = date('now')
      )
  `, function (err) {
    if (err) {
      console.error("[daily] insert failed:", err.message);
      db.run("ROLLBACK");
      process.exit(1);
    }
    console.log(`[daily] inserted rows: ${this.changes}`);
    db.run("COMMIT", () => db.close());
  });
});
