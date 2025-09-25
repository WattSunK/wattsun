#!/usr/bin/env node
// Minimal, idempotent migration for Phase 5.4 (Option A).
// Only ensures: decided_by, decision_note, payout_ref + status index.
// Avoids non-constant DEFAULTs; leaves legacy ledger/notifications as-is.

const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const ROOT = process.env.ROOT || process.cwd();
const DB_PATH = process.env.DB_PATH_USERS || process.env.SQLITE_DB || path.join(ROOT, "data/dev/wattsun.dev.db");
const db = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (err) { err ? reject(err) : resolve(true); }));
}
function tableCols(table) {
  return new Promise((resolve, reject) => db.all(`PRAGMA table_info(${table});`, (e, rows) => e ? reject(e) : resolve(rows.map(r => r.name))));
}
function idxExists(name) {
  return new Promise((resolve, reject) => db.get(`SELECT name FROM sqlite_master WHERE type='index' AND name=?`, [name], (e, row) => e ? reject(e) : resolve(!!row)));
}

(async () => {
  try {
    if (!fs.existsSync(DB_PATH)) { console.error(`[migration] DB not found ${DB_PATH}`); process.exit(2); }
    console.log(`[migration] DB = ${DB_PATH}`);

    // Ensure base table exists (legacy shape)
    await run(`CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      eur INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Pending',
      requested_at TEXT,
      decided_at TEXT,
      paid_at TEXT,
      note TEXT
    );`);

    let cols = await tableCols("withdrawals");
    if (!cols.includes("decided_by"))   await run(`ALTER TABLE withdrawals ADD COLUMN decided_by INTEGER`);
    cols = await tableCols("withdrawals");
    if (!cols.includes("decision_note")) await run(`ALTER TABLE withdrawals ADD COLUMN decision_note TEXT`);
    cols = await tableCols("withdrawals");
    if (!cols.includes("payout_ref"))    await run(`ALTER TABLE withdrawals ADD COLUMN payout_ref TEXT`);

    if (!(await idxExists("idx_withdrawals_status"))) {
      await run(`CREATE INDEX idx_withdrawals_status ON withdrawals(status)`);
    }

    console.log("[migration] done");
    process.exit(0);
  } catch (e) {
    console.error("[migration] ERROR", e);
    process.exit(1);
  } finally {
    db.close();
  }
})();
