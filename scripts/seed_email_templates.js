#!/usr/bin/env node
/**
 * scripts/seed_email_templates.js
 * Idempotently seeds core email templates used by notifications_worker.
 *
 * Usage:
 *   node scripts/seed_email_templates.js [--db path/to/db.sqlite]
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

function loadEnv() {
  try { require('dotenv').config(); } catch (_) {}
  const candidate = process.env.ENV_FILE || path.join(process.cwd(), 'env');
  if (fs.existsSync(candidate)) {
    try { require('dotenv').config({ path: candidate, override: true }); } catch (_) {}
  }
}
loadEnv();

function parseArgs(argv) {
  let db = null;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--db' && argv[i + 1]) { db = argv[++i]; continue; }
    if (a.startsWith('--db=')) { db = a.split('=', 2)[1]; continue; }
  }
  return { db };
}

function resolveDbPath() {
  const { db } = parseArgs(process.argv);
  if (db) return db;
  if (process.env.SQLITE_DB) return process.env.SQLITE_DB;
  if (process.env.DB_PATH_USERS) return process.env.DB_PATH_USERS;
  const env = String(process.env.NODE_ENV || '').toLowerCase();
  const root = process.env.ROOT || process.cwd();
  if (env === 'qa') return path.join(root, 'data/qa/wattsun.qa.db');
  return path.join(root, 'data/dev/wattsun.dev.db');
}

const DB_FILE = resolveDbPath();
const db = new sqlite3.Database(DB_FILE);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this.changes || 0);
    });
  });
}

function seedTemplates() {
  const inserts = [
    [
      "CREATE TABLE IF NOT EXISTS email_templates (\n        id INTEGER PRIMARY KEY AUTOINCREMENT,\n        code TEXT NOT NULL UNIQUE,\n        subject TEXT NOT NULL,\n        html TEXT NOT NULL,\n        updated_at TEXT NOT NULL DEFAULT (datetime('now'))\n      )",
      []
    ],
    ["INSERT OR IGNORE INTO email_templates (code,subject,html) VALUES (?,?,?)",
     ['order_created','Order {{orderNumber}} received','<p>Hello {{name}},</p><p>Your order <strong>{{orderNumber}}</strong> has been received.</p><p>Total: <strong>{{total}}</strong></p><p><em>(Copy: {{role}})</em></p>']],
    ["INSERT OR IGNORE INTO email_templates (code,subject,html) VALUES (?,?,?)",
     ['order_delivered','Order {{orderNumber}} delivered','<p>Hello {{name}},</p><p>Your order <strong>{{orderNumber}}</strong> was delivered on {{deliveredAt}}.</p><p>Thank you for choosing WattSun. <em>(Copy: {{role}})</em></p>']],
    ["INSERT OR IGNORE INTO email_templates (code,subject,html) VALUES (?,?,?)",
     ['loyalty_welcome','Welcome to WattSun Loyalty','<p>{{message}}</p><p>Account ID: <strong>{{accountId}}</strong></p><p>Enrollment: {{durationMonths}} months • Withdraw after {{withdrawWaitDays}} days.</p>']],
    ["INSERT OR IGNORE INTO email_templates (code,subject,html) VALUES (?,?,?)",
     ['penalty','Loyalty update: a penalty was applied','<p>Hello,</p><p>A penalty of <strong>{{points}}</strong> point(s) was applied to your loyalty account.</p><p>Note: {{note}}</p><p>Your new balance is <strong>{{balance}}</strong> points.</p>']],
    ["INSERT OR IGNORE INTO email_templates (code,subject,html) VALUES (?,?,?)",
     ['withdrawal_approved','Your loyalty withdrawal was approved','<p>Hello,</p><p>Your loyalty withdrawal request has been <strong>approved</strong>.</p><p>{{message}}</p>']],
    ["INSERT OR IGNORE INTO email_templates (code,subject,html) VALUES (?,?,?)",
     ['withdrawal_paid','Your loyalty withdrawal was paid','<p>Hello,</p><p>Your withdrawal has been <strong>paid</strong>.</p><p>{{message}}</p><p>Reference: {{payoutRef}}</p>']],
    ["INSERT OR IGNORE INTO email_templates (code,subject,html) VALUES (?,?,?)",
     ['withdrawal_rejected','Your loyalty withdrawal was rejected','<p>Hello,</p><p>Your loyalty withdrawal request was <strong>rejected</strong>.</p><p>{{message}}</p>']],
    ["INSERT OR IGNORE INTO email_templates (code,subject,html) VALUES (?,?,?)",
     ['user_signup','Welcome to WattSun','<p>Welcome to WattSun!</p><p>Your account has been created successfully.</p>']],
    ["INSERT OR IGNORE INTO email_templates (code,subject,html) VALUES (?,?,?)",
     ['password_reset','Password reset instructions','<p>You (or someone) requested a password reset.</p><p>If you did not request this, you can ignore this email.</p>']],
  ];
  return inserts.reduce((p, [sql, params]) => p.then(() => run(sql, params)), Promise.resolve());
}

(async function main(){
  const start = Date.now();
  console.log('[seed-templates] DB = %s', DB_FILE);
  try {
    await seedTemplates();
    console.log('[seed-templates] done in %d ms', Date.now()-start);
    process.exit(0);
  } catch (e) {
    console.error('[seed-templates] error:', e.message);
    process.exit(1);
  } finally {
    try { db.close(); } catch (_) {}
  }
})();

