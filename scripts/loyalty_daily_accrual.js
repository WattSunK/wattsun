#!/usr/bin/env node
/**
 * Loyalty Daily Accrual (idempotent) + resilient Ledger Audit
 *
 * - Inserts 1 row per Active account per local day into loyalty_daily_log.
 * - Reads points from loyalty_program_settings key 'dailyAccrualPoints' (value_int or value). Fallback = 1.
 * - UNIQUE(account_id, accrual_date) prevents duplicates.
 * - On first insert, increments points_balance + total_earned in loyalty_accounts.
 * - Uses local date (Europe/Paris via SQLite 'localtime').
 * - If table `loyalty_ledger` exists, writes an audit row, with automatic column detection:
 *     account_id:     required
 *     points column:  prefers 'points' else 'amount' else 'points_delta'
 *     kind column:    prefers 'kind' else 'type' else skipped
 *     time column:    prefers 'created_at' else 'timestamp'/'ts' else skipped (rely on default)
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const ROOT = process.cwd();
const DB =
  process.env.SQLITE_MAIN ||
  process.env.SQLITE_DB   ||
  path.join(ROOT, 'data', 'dev', 'wattsun.dev.db');

let Better;
try { Better = require('better-sqlite3'); } catch { Better = null; }
const mode = Better ? 'better' : 'sqlite3';

const SQL = {
  ensureIndex: `
    CREATE UNIQUE INDEX IF NOT EXISTS ux_loy_daily_account_date
    ON loyalty_daily_log(account_id, accrual_date);
  `,
  nowDate: `SELECT DATE('now','localtime') AS d;`,
  dailyPoints: `
    SELECT
      COALESCE(value_int,
               CASE WHEN CAST(value AS INTEGER) IS NOT NULL
                    THEN CAST(value AS INTEGER) END) AS pts
    FROM loyalty_program_settings
    WHERE key='dailyAccrualPoints'
    ORDER BY updated_at DESC
    LIMIT 1;
  `,
  activeAccounts: `
    SELECT id AS account_id, start_date, duration_months
    FROM loyalty_accounts
    WHERE status='Active';
  `,
  insertDaily: `
    INSERT OR IGNORE INTO loyalty_daily_log (account_id, accrual_points, accrual_date)
    VALUES (?, ?, DATE('now','localtime'));
  `,
  bumpAccount: `
    UPDATE loyalty_accounts
    SET points_balance = points_balance + ?,
        total_earned   = total_earned   + ?,
        updated_at     = datetime('now','localtime')
    WHERE id = ?;
  `,
  hasLedger: `
    SELECT 1 AS ok
    FROM sqlite_master
    WHERE type='table' AND name='loyalty_ledger'
    LIMIT 1;
  `,
  ledgerCols: `
    SELECT name
    FROM pragma_table_info('loyalty_ledger');
  `,
};

function pick(colNames, candidates) {
  for (const c of candidates) if (colNames.has(c)) return c;
  return null;
}

(async function main() {
  console.log('[loyalty_daily_accrual] DB =', DB);

  if (mode === 'better') {
    const db = new Better(DB);
    try {
      const accrualDate = db.prepare(SQL.nowDate).get().d;
      console.log('[loyalty_daily_accrual] accrual_date =', accrualDate);

      db.exec(SQL.ensureIndex);

      const row = db.prepare(SQL.dailyPoints).get();
      const dailyPoints = (row && Number.isFinite(row.pts)) ? Number(row.pts) : 1;
      console.log('[loyalty_daily_accrual] dailyAccrualPoints =', dailyPoints);

      const accounts = db.prepare(SQL.activeAccounts).all();
      console.log('[loyalty_daily_accrual] Active accounts =', accounts.length);

      const insDaily = db.prepare(SQL.insertDaily);
      const bumpAcc  = db.prepare(SQL.bumpAccount);

      // Detect ledger schema
      let ledgerInsert = null;
      const hasLedger = !!db.prepare(SQL.hasLedger).get();
      if (hasLedger) {
        const cols = db.prepare(SQL.ledgerCols).all().map(r => r.name);
        const set = new Set(cols);
        const colAccount = pick(set, ['account_id']);
        const colPoints  = pick(set, ['points','amount','points_delta']);
        const colKind    = pick(set, ['kind','type']);
        const colTime    = pick(set, ['created_at','timestamp','ts']);

        if (!colAccount || !colPoints) {
          console.log('[loyalty_daily_accrual] ledger present but missing required columns (account_id/points-like). Skipping audit inserts.');
        } else {
          // Build dynamic insert
          const colsList = [colAccount, colPoints];
          const valsList = ['?', '?'];
          if (colKind) { colsList.push(colKind); valsList.push("'daily'"); }
          if (colTime) { colsList.push(colTime); valsList.push("datetime('now','localtime')"); }
          const sql = `INSERT INTO loyalty_ledger (${colsList.join(', ')}) VALUES (${valsList.join(', ')});`;
          ledgerInsert = db.prepare(sql);
          console.log('[loyalty_daily_accrual] ledger insert prepared:', sql);
        }
      } else {
        console.log('[loyalty_daily_accrual] loyalty_ledger not found — skipping audit inserts (ok).');
      }

      let inserted = 0;
      const tx = db.transaction(() => {
        for (const a of accounts) {
          // enrollment window guard
          const within = db.prepare(`
            SELECT
              DATE('now','localtime') >= DATE(?)
              AND DATE('now','localtime') <  DATE(?, '+' || ? || ' months') AS ok
          `).get(a.start_date, a.start_date, a.duration_months).ok;
          if (!within) continue;

          const info = insDaily.run(a.account_id, dailyPoints);
          if (info.changes === 1) {
            inserted++;
            bumpAcc.run(dailyPoints, dailyPoints, a.account_id);
            if (ledgerInsert) {
              ledgerInsert.run(a.account_id, dailyPoints);
            }
          }
        }
      });
      tx();

      console.log('[loyalty_daily_accrual] Inserted rows =', inserted, '(idempotent)');
      db.close();
      process.exit(0);
    } catch (e) {
      console.error('[loyalty_daily_accrual] Error:', e.message);
      try { db.close(); } catch {}
      process.exit(1);
    }
  } else {
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database(DB);

    const run = (sql, params=[]) => new Promise((res, rej) => db.run(sql, params, function(err){ if(err) rej(err); else res(this); }));
    const all = (sql, params=[]) => new Promise((res, rej) => db.all(sql, params, (err, rows)=> err?rej(err):res(rows)));
    const get = (sql, params=[]) => new Promise((res, rej) => db.get(sql, params, (err, row)=> err?rej(err):res(row)));

    try {
      const todayRow = await get(SQL.nowDate);
      console.log('[loyalty_daily_accrual] accrual_date =', todayRow.d);

      await run(SQL.ensureIndex);

      const row = await get(SQL.dailyPoints);
      const dailyPoints = (row && Number.isFinite(row.pts)) ? Number(row.pts) : 1;
      console.log('[loyalty_daily_accrual] dailyAccrualPoints =', dailyPoints);

      const accounts = await all(SQL.activeAccounts);
      console.log('[loyalty_daily_accrual] Active accounts =', accounts.length);

      // Detect ledger schema
      let ledgerInsertSQL = null;
      const hasLedger = !!(await get(SQL.hasLedger));
      if (hasLedger) {
        const colRows = await all(SQL.ledgerCols);
        const set = new Set(colRows.map(r => r.name));
        const colAccount = pick(set, ['account_id']);
        const colPoints  = pick(set, ['points','amount','points_delta']);
        const colKind    = pick(set, ['kind','type']);
        const colTime    = pick(set, ['created_at','timestamp','ts']);

        if (!colAccount || !colPoints) {
          console.log('[loyalty_daily_accrual] ledger present but missing required columns (account_id/points-like). Skipping audit inserts.');
        } else {
          const colsList = [colAccount, colPoints];
          const valsList = ['?', '?'];
          if (colKind) { colsList.push(colKind); valsList.push("'daily'"); }
          if (colTime) { colsList.push(colTime); valsList.push("datetime('now','localtime')"); }
          ledgerInsertSQL = `INSERT INTO loyalty_ledger (${colsList.join(', ')}) VALUES (${valsList.join(', ')});`;
          console.log('[loyalty_daily_accrual] ledger insert prepared:', ledgerInsertSQL);
        }
      } else {
        console.log('[loyalty_daily_accrual] loyalty_ledger not found — skipping audit inserts (ok).');
      }

      await run('BEGIN;');
      let inserted = 0;
      for (const a of accounts) {
        const okRow = await get(`
          SELECT
            DATE('now','localtime') >= DATE(?)
            AND DATE('now','localtime') <  DATE(?, '+' || ? || ' months') AS ok
        `, [a.start_date, a.start_date, a.duration_months]);
        if (!okRow || !okRow.ok) continue;

        const info = await run(SQL.insertDaily, [a.account_id, dailyPoints]);
        if (info && info.changes === 1) {
          inserted++;
          await run(SQL.bumpAccount, [dailyPoints, dailyPoints, a.account_id]);
          if (ledgerInsertSQL) {
            await run(ledgerInsertSQL, [a.account_id, dailyPoints]);
          }
        }
      }
      await run('COMMIT;');

      console.log('[loyalty_daily_accrual] Inserted rows =', inserted, '(idempotent)');
      db.close();
      process.exit(0);
    } catch (e) {
      console.error('[loyalty_daily_accrual] Error:', e.message);
      await run('ROLLBACK;').catch(()=>{});
      db.close();
      process.exit(1);
    }
  }
})();
