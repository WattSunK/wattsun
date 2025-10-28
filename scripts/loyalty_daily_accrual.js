/**
 * scripts/loyalty_daily_accrual.js
 *
 * Adds one daily accrual per active account, with an informative note.
 * Safe for repeat runs:
 *  - Prefers unique guard `uq_ll_daily_once` on loyalty_ledger (ts-based)
 *  - Falls back to loyalty_daily_log(account_id, accrual_date) guard if needed
 *
 * Enhancements:
 *  - `--db <path>` flag to pick DB explicitly
 *  - Defaults DB by env: SQLITE_DB/DB_PATH_USERS > NODE_ENV(qa/dev)
 *  - Detects ledger timestamp column: `ts` or `created_at`
 */

const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

// Load .env and optional overlay file at ./env or ENV_FILE
function loadEnv() {
  try { require("dotenv").config(); } catch (_) {}
  const candidate = process.env.ENV_FILE || path.join(process.cwd(), "env");
  if (fs.existsSync(candidate)) {
    try { require("dotenv").config({ path: candidate, override: true }); } catch (_) {}
  }
}
loadEnv();

function parseArgs(argv) {
  let db = null;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--db" && argv[i + 1]) { db = argv[++i]; continue; }
    if (a.startsWith("--db=")) { db = a.split("=", 2)[1]; continue; }
  }
  return { db };
}

function resolveDbPath() {
  const { db } = parseArgs(process.argv);
  if (db) return db;
  const envKeys = [
    "SQLITE_MAIN",
    "SQLITE_DB",
    "DB_PATH_USERS",
    "WATTSUN_DB_PATH",
    "DB_PATH_ADMIN"
  ];
  for (const key of envKeys) {
    if (process.env[key]) return process.env[key];
  }
  const ROOT = process.env.ROOT ? path.resolve(process.env.ROOT) : path.resolve(__dirname, "..");
  const env = String(process.env.NODE_ENV || "").toLowerCase();
  if (env === "qa") {
    const qaCandidates = [
      path.resolve(ROOT, "data/qa/wattsun.qa.db"),
      path.resolve(ROOT, "../data/qa/wattsun.qa.db"),
      path.resolve(ROOT, "../../data/qa/wattsun.qa.db")
    ];
    for (const candidate of qaCandidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return qaCandidates[0];
  }
  return path.join(ROOT, "data/dev/wattsun.dev.db");
}

function openDb(dbFile) { return new sqlite3.Database(dbFile); }

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

async function detectLedgerTsColumn(db) {
  const cols = await all(db, "PRAGMA table_info(loyalty_ledger);");
  const hasTs = cols.some((c) => c.name === "ts");
  const hasCreatedAt = cols.some((c) => c.name === "created_at");
  return hasTs ? "ts" : (hasCreatedAt ? "created_at" : "ts");
}

async function hasDailyUniqueGuard(db) {
  const idx = await all(db, "PRAGMA index_list('loyalty_ledger');");
  return idx.some((r) => r.name === "uq_ll_daily_once");
}

async function hasDailyLogTable(db) {
  const rows = await all(
    db,
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='loyalty_daily_log'"
  );
  return rows.length > 0;
}

(async function main() {
  const head = (msg) => console.log(`[loyalty_daily_accrual] ${msg}`);
  const DB_FILE = resolveDbPath();
  head(`resolved_db_path = ${DB_FILE}`);
  const db = openDb(DB_FILE);
  const start = Date.now();
  const todayLocal = new Date().toISOString().slice(0, 10);

  try {
    const tsCol = await detectLedgerTsColumn(db);
    let hasUqDaily = await hasDailyUniqueGuard(db);
    const hasDailyLog = await hasDailyLogTable(db);

    // Best-effort: ensure daily unique guard exists for this schema
    if (!hasUqDaily) {
      try {
        await run(db, `CREATE UNIQUE INDEX IF NOT EXISTS uq_ll_daily_once ON loyalty_ledger(account_id, kind, date(${tsCol})) WHERE kind='daily'`);
        hasUqDaily = await hasDailyUniqueGuard(db);
      } catch (_) {
        // ignore if column mismatch or permission issues; we'll fall back to daily_log if present
      }
    }

    head(`accrual_date = ${todayLocal}`);
    head(`ledger_ts_column = ${tsCol}`);
    head(`guard_uq_daily = ${hasUqDaily}`);
    head(`guard_daily_log = ${hasDailyLog}`);

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
        let proceed = true;
        if (!hasUqDaily && hasDailyLog) {
          // Guard via daily_log unique(account_id, accrual_date)
          const guardChanges = await run(
            db,
            `INSERT OR IGNORE INTO loyalty_daily_log(account_id, accrual_date) VALUES (?, ?)`,
            [accountId, todayLocal]
          );
          proceed = guardChanges > 0; // if 0, already accrued today
        }

        let changes = 0;
        if (proceed) {
          const sql = `INSERT OR IGNORE INTO loyalty_ledger(account_id, kind, points_delta, note, ${tsCol})
                       VALUES (?, 'daily', 1, ?, datetime('now','localtime'))`;
          changes = await run(db, sql, [accountId, note]);
        }

        // 	 Update account totals if a new daily entry was added
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
