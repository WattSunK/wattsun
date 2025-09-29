/**
 * scripts/loyalty_daily_accrual.js
 *
 * Single source of truth: write DAILY accruals to loyalty_ledger only.
 * No direct writes to loyalty_accounts. Triggers will recompute mirrors.
 *
 * Idempotency: relies on unique index:
 *   CREATE UNIQUE INDEX IF NOT EXISTS uq_ll_daily_once
 *     ON loyalty_ledger(account_id, kind, date(created_at))
 *     WHERE kind='daily';
 *
 * Running:
 *   node scripts/loyalty_daily_accrual.js
 */

const path = require("path");
const sqlite3 = require("sqlite3").verbose();

function dbPath() {
  const ROOT = process.env.ROOT || process.cwd();
  // Keep using unified dev DB path unless overridden
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

    // 1) Eligible accounts (status Active and within (start_date..end_date] if present)
    const accounts = await all(
      db,
      `
      SELECT id
      FROM loyalty_accounts
      WHERE status='Active'
        AND (
              -- if both dates present, restrict to window
              (start_date IS NOT NULL AND end_date IS NOT NULL AND date('now','localtime') BETWEEN date(start_date) AND date(end_date))
              OR
              -- if only start_date present
              (start_date IS NOT NULL AND end_date IS NULL AND date('now','localtime') >= date(start_date))
              OR
              -- if only end_date present
              (start_date IS NULL AND end_date IS NOT NULL AND date('now','localtime') <= date(end_date))
              OR
              -- if none present, just Active is enough
              (start_date IS NULL AND end_date IS NULL)
            )
      `
    );

    head(`eligible_accounts = ${accounts.length}`);

    // 2) Insert-or-ignore daily rows to ledger (no account math!)
    let inserted = 0, skipped = 0, errors = 0;

    for (const row of accounts) {
      const accountId = row.id;

      try {
        // INSERT OR IGNORE avoids duplicate for same account/day via uq_ll_daily_once
        const changes = await run(
          db,
          `
          INSERT OR IGNORE INTO loyalty_ledger(account_id, kind, points_delta, note, created_at)
          VALUES (?, 'daily', 1, NULL, datetime('now','localtime'))
          `,
          [accountId]
        );

        if (changes > 0) {
          inserted += 1;
        } else {
          skipped += 1; // already had a daily today (guard worked)
        }
      } catch (e) {
        errors += 1;
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
