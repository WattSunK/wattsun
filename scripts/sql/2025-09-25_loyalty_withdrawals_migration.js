#!/usr/bin/env node
/**
 * Idempotent migration for Phase 5.4 – Withdrawals: add decision & payout cols and indexes.
 * DB target: data/dev/wattsun.dev.db (env-driven; falls back to this path).
 *
 * Columns ensured on table `withdrawals`:
 *   decided_at TEXT, decided_by INTEGER, decision_reason TEXT,
 *   paid_at TEXT, paid_tx_ref TEXT
 * Indexes ensured:
 *   idx_withdrawals_status(status), idx_withdrawals_created(created_at), idx_withdrawals_user(user_id)
 *
 * Safe to re-run. Only ALTERs when columns are missing; only creates indexes when absent.
 */
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const ROOT = process.env.ROOT || process.cwd();
const DB_PATH = process.env.DB_PATH_USERS || process.env.SQLITE_DB ||
  path.join(ROOT, "data/dev/wattsun.dev.db");

function colExists(db, table, name) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${table});`, (err, rows) => {
      if (err) return reject(err);
      resolve(rows.some(r => r.name === name));
    });
  });
}
function idxExists(db, name) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT name FROM sqlite_master WHERE type='index' AND name=?;`, [name], (err, row) => {
      if (err) return reject(err);
      resolve(!!row);
    });
  });
}
function run(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (err) {
    if (err) return reject(err);
    resolve(true);
  }));
}

(async () => {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`[migration] DB not found at ${DB_PATH}`);
    process.exit(2);
  }
  const db = new sqlite3.Database(DB_PATH);
  try {
    console.log(`[migration] DB = ${DB_PATH}`);

    // Ensure table exists minimally (no-op if it already exists).
    await run(db, `
      CREATE TABLE IF NOT EXISTS withdrawals (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id       INTEGER NOT NULL,
        account_id    INTEGER,
        amount_cents  INTEGER NOT NULL,
        status        TEXT NOT NULL DEFAULT 'Pending',
        created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Conditionally add columns.
    const ensureColumn = async (name, ddl) => {
      if (!(await colExists(db, "withdrawals", name))) {
        console.log(`[migration] ADD COLUMN ${name}`);
        await run(db, `ALTER TABLE withdrawals ADD COLUMN ${ddl};`);
      } else {
        console.log(`[migration] column ${name} OK`);
      }
    };
    await ensureColumn("decided_at", "decided_at TEXT");
    await ensureColumn("decided_by", "decided_by INTEGER");
    await ensureColumn("decision_reason", "decision_reason TEXT");
    await ensureColumn("paid_at", "paid_at TEXT");
    await ensureColumn("paid_tx_ref", "paid_tx_ref TEXT");

    // Indexes
    const ensureIndex = async (name, sql) => {
      if (!(await idxExists(db, name))) {
        console.log(`[migration] CREATE INDEX ${name}`);
        await run(db, sql);
      } else {
        console.log(`[migration] index ${name} OK`);
      }
    };
    await ensureIndex("idx_withdrawals_status",
      "CREATE INDEX idx_withdrawals_status  ON withdrawals(status)");
    await ensureIndex("idx_withdrawals_created",
      "CREATE INDEX idx_withdrawals_created ON withdrawals(created_at)");
    await ensureIndex("idx_withdrawals_user",
      "CREATE INDEX idx_withdrawals_user    ON withdrawals(user_id)");

    // Minimal supporting tables (no-op if exist) used in the route:
    // loyalty_ledger (append-only) and notifications_queue (email queue).
    await run(db, `
      CREATE TABLE IF NOT EXISTS loyalty_ledger (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id      INTEGER NOT NULL,
        account_id   INTEGER,
        ref_type     TEXT NOT NULL,     -- e.g., 'WITHDRAWAL'
        ref_id       INTEGER NOT NULL,  -- withdrawal.id
        entry_type   TEXT NOT NULL,     -- e.g., 'WITHDRAWAL_APPROVED'
        amount_cents INTEGER NOT NULL,  -- positive magnitude
        note         TEXT,
        created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await run(db, `
      CREATE TABLE IF NOT EXISTS notifications_queue (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id      INTEGER,
        channel      TEXT NOT NULL DEFAULT 'email',
        template     TEXT NOT NULL,
        "to"         TEXT,
        payload_json TEXT,
        status       TEXT NOT NULL DEFAULT 'queued',
        created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await ensureIndex("idx_nq_status",
      "CREATE INDEX IF NOT EXISTS idx_nq_status ON notifications_queue(status)");
    await ensureIndex("idx_nq_user",
      "CREATE INDEX IF NOT EXISTS idx_nq_user ON notifications_queue(user_id)");

    console.log("[migration] done");
    process.exit(0);
  } catch (e) {
    console.error("[migration] ERROR", e);
    process.exit(1);
  } finally {
    db.close();
  }
})();
