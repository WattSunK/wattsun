#!/usr/bin/env node
/**
 * Loyalty Daily Accrual (idempotent)
 * - Inserts 1 row per Active account per local day into loyalty_daily_log.
 * - Reads points from loyalty_program_settings key 'dailyAccrualPoints' (value_int or value). Fallback = 1.
 * - UNIQUE(account_id, accrual_date) prevents duplicates.
 * - On first insert, increments points_balance + total_earned in loyalty_accounts.
 * - Uses local date (Europe/Paris via SQLite 'localtime').
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const ROOT = process.cwd();
const DB =
  process.env.SQLITE_MAIN ||            // your .env uses this
  process.env.SQLITE_DB   ||            // fallback
  path.join(ROOT, 'data', 'dev', 'wattsun.dev.db');

let Better;
try { Better = require('better-sqlite3'); } catch { Better = null; }
const mode = Better ? 'better' : 'sqlite3';

function localISODate(d=new Date()) {
  // Convert to local midnight and format YYYY-MM-DD
  const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
  return new Date(y, m, day).toISOString().slice(0,10);
}

(async function main() {
  const todayLocal = localISODate();
  console.log('[loyalty_daily_accrual] DB =', DB);
  console.log('[loyalty_daily_accrual] accrual_date =', todayLocal);

  // SQL bits
  const ensureIndexSQL = `
    CREATE UNIQUE INDEX IF NOT EXISTS ux_loy_daily_account_date
    ON loyalty_daily_log(account_id, accrual_date);
  `;

  const getDailyPointsSQL = `
    SELECT
      COALESCE(value_int,
               CASE WHEN CAST(value AS INTEGER) IS NOT NULL
                    THEN CAST(value AS INTEGER) END) AS pts
    FROM loyalty_program_settings
    WHERE key='dailyAccrualPoints'
    ORDER BY updated_at DESC
    LIMIT 1;
  `;

  const activeAccountsSQL = `
    SELECT id AS account_id, start_date, duration_months
    FROM loyalty_accounts
    WHERE status='Active';
  `;

  const insertDailySQL = `
    INSERT OR IGNORE INTO loyalty_daily_log (account_id, accrual_points, accrual_date)
    VALUES (?, ?, DATE('now','localtime'));
  `;

  const bumpAccountSQL = `
    UPDATE loyalty_accounts
    SET points_balance = points_balance + ?,
        total_earned   = total_earned   + ?,
        updated_at     = datetime('now','localtime')
    WHERE id = ?;
  `;

  if (mode === 'better') {
    const db = new Better(DB);
    try {
      db.exec(ensureIndexSQL);

      const row = db.prepare(getDailyPointsSQL).get();
      const dailyPoints = (row && Number.isFinite(row.pts)) ? Number(row.pts) : 1;
      console.log('[loyalty_daily_accrual] dailyAccrualPoints =', dailyPoints);

      const accounts = db.prepare(activeAccountsSQL).all();
      console.log('[loyalty_daily_accrual] Active accounts =', accounts.length);

      const ins = db.prepare(insertDailySQL);
      const bump = db.prepare(bumpAccountSQL);

      let inserted = 0;
      const tx = db.transaction(() => {
        for (const a of accounts) {
          // Optional enrollment window guard (keeps your original intent):
          // only accrue if today within [start_date, start_date + duration_months)
          const ok = db.prepare(`
            SELECT
              DATE('now','localtime') >= DATE(?)
              AND DATE('now','localtime') <  DATE(?, '+' || ? || ' months') AS within
          `).get(a.start_date, a.start_date, a.duration_months).within;
          if (!ok) continue;

          const info = ins.run(a.account_id, dailyPoints);
          if (info.changes === 1) {
            inserted++;
            bump.run(dailyPoints, dailyPoints, a.account_id);
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

    const run = (sql, params=[]) => new Promise((res, rej) => {
      db.run(sql, params, function(err){ if(err) rej(err); else res(this); });
    });
    const all = (sql, params=[]) => new Promise((res, rej) => {
      db.all(sql, params, (err, rows)=> err?rej(err):res(rows));
    });
    const get = (sql, params=[]) => new Promise((res, rej) => {
      db.get(sql, params, (err, row)=> err?rej(err):res(row));
    });

    try {
      await run(ensureIndexSQL);
      const row = await get(getDailyPointsSQL);
      const dailyPoints = (row && Number.isFinite(row.pts)) ? Number(row.pts) : 1;
      console.log('[loyalty_daily_accrual] dailyAccrualPoints =', dailyPoints);

      const accounts = await all(activeAccountsSQL);
      console.log('[loyalty_daily_accrual] Active accounts =', accounts.length);

      await run('BEGIN;');
      let inserted = 0;
      for (const a of accounts) {
        const ok = await get(`
          SELECT
            DATE('now','localtime') >= DATE(?)
            AND DATE('now','localtime') <  DATE(?, '+' || ? || ' months') AS within
        `, [a.start_date, a.start_date, a.duration_months]);
        if (!ok || !ok.within) continue;

        const info = await run(insertDailySQL, [a.account_id, dailyPoints]);
        if (info && info.changes === 1) {
          inserted++;
          await run(bumpAccountSQL, [dailyPoints, dailyPoints, a.account_id]);
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
