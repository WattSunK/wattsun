/**
 * scripts/loyalty_daily_accrual.js
 *
 * Adds note to daily ledger entries to prevent blank notes.
 * Safe for repeat runs (idempotent via uq_ll_daily_once).
 */

const path = require("path");
const sqlite3 = require("sqlite3").verbose();

function dbPath() {
  const ROOT = process.env.ROOT || process.cwd();
  return process.env.SQLITE_DB || process.env.DB_PATH_USERS || path.join(ROOT, "data/dev/wattsun.dev.db");
}
function openDb() { return new sqlite3.Database(dbPath()); }

function all(db, sql, p = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, p, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}
function run(db, sql, p = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, p, function (err) {
      if (err) return reject(err);
      resolve(this.changes || 0);
    });
  });
}

(async function main() {
  const db = openDb();
  const start = Date.now();
  const todayLocal = new Date().toISOString().slice(0, 10);
  const head = (msg) => console.log(`[loyalty_daily_accrual] ${msg}`);

  try {
    head(`DB = ${dbPath()}`);
    head(`accrual_date = ${todayLocal}`);

    const accounts = await all(
      db,
      `SELECT id
       FROM loyalty_accounts
       WHERE status='Active'
         AND (
              (start_date IS NOT NULL AND end_date IS NOT NULL AND date('now','localtime') BETWEEN date(start_date) AND date(end_date))
              OR (start_date IS NOT NULL AND end_date IS NULL AND date('now','localtime') >= date(start_date))
              OR (start_date IS NULL AND end_date IS NOT NULL AND date('now','localtime') <= date(end_date))
              OR (start_date IS NULL AND end_date IS NULL)
         )`
    );

    head(`eligible_accounts = ${accounts.length}`);

    let inserted = 0, skipped = 0, errors = 0;

    for (const row of accounts) {
      const accountId = row.id;
      const note = `Daily accrual for ${todayLocal}`;

      try {
        const changes = await run(
          db,
          `INSERT OR IGNORE INTO loyalty_ledger(account_id, kind, points_delta, note, created_at)
           VALUES (?, 'daily', 1, ?, datetime('now','localtime'))`,
          [accountId, note]
        );
        // 💡 Update account totals if a new daily entry was added
        if (changes > 0) {
          await run(
            db,
            `UPDATE loyalty_accounts
                SET points_balance = COALESCE(points_balance, 0) + 1,
                    total_earned   = COALESCE(total_earned,   0) + 1
              WHERE id = ?`,
            [accountId]
          );
        }

        if (changes > 0) inserted++; else skipped++;
      } catch (e) {
        errors++;
        console.error(`[loyalty_daily_accrual] account ${accountId} -> ERROR: ${e.message}`);
      }
    }

    const ms = Date.now() - start;
    head(`done: inserted=${inserted}, skipped=${skipped}, errors=${errors}, ms=${ms}`);
    process.exitCode = errors > 0 ? 1 : 0;
  } catch (e) {
    console.error(`[loyalty_daily_accrual] FATAL: ${e.message}`);
    process.exitCode = 1;
  } finally {
    db.close();
  }
})();