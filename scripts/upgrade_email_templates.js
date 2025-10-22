#!/usr/bin/env node
/**
 * scripts/upgrade_email_templates.js
 * Replaces existing basic email templates with more polished, responsive HTML.
 *
 * Usage:
 *   node scripts/upgrade_email_templates.js [--db path/to/wattsun.db]
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

function resolveDbPath() {
  const arg = process.argv.find(a => a.startsWith('--db='));
  if (arg) return arg.slice('--db='.length);
  const nextIdx = process.argv.indexOf('--db');
  if (nextIdx !== -1 && process.argv[nextIdx + 1]) return process.argv[nextIdx + 1];
  return process.env.SQLITE_DB || process.env.DB_PATH_USERS || path.join(process.cwd(), 'data/dev/wattsun.dev.db');
}

function layout({ title, bodyHtml }) {
  // Lightweight responsive layout with brand gradient, safe inline CSS.
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title || 'WattSun'}</title>
    <style>
      body{margin:0;padding:0;background:#faf8f2;color:#333;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;}
      .wrap{max-width:640px;margin:0 auto;padding:0 12px 32px 12px;}
      .brand{background:linear-gradient(90deg,#f7b733 0%,#fcf6ba 100%);color:#184211;text-align:center;padding:18px 6px;}
      .brand h1{margin:0;font-size:20px;letter-spacing:.2px}
      .card{background:#fff;border-radius:12px;box-shadow:0 4px 18px rgba(0,0,0,.08);padding:22px;margin-top:18px}
      .cta{display:inline-block;background:#184211;color:#fff !important;text-decoration:none;padding:10px 18px;border-radius:8px;margin-top:12px}
      .muted{color:#666;font-size:12px}
      .divider{height:1px;background:#eee;margin:18px 0}
      .table{width:100%;border-collapse:collapse}
      .table th,.table td{padding:8px 6px;border-bottom:1px solid #f0f0f0;text-align:left}
      .amount{font-weight:700;color:#184211}
    </style>
  </head>
  <body>
    <div class="brand"><div class="wrap"><h1>WattSun</h1></div></div>
    <div class="wrap"><div class="card">${bodyHtml}</div>
      <div class="muted" style="margin-top:10px">Need help? {{supportEmail}}</div>
    </div>
  </body>
  </html>`;
}

// Professional HTML bodies with {{placeholders}}
const TPL = {
  order_created: {
    subject: 'Order {{orderNumber}} received',
    html: layout({
      title: 'Order received',
      bodyHtml: `
        <p>Hello {{name}},</p>
        <p>We have received your order <strong>{{orderNumber}}</strong>.</p>
        <table class="table">
          <tr><th>Order</th><td>{{orderNumber}}</td></tr>
          <tr><th>Total</th><td class="amount">{{total}}</td></tr>
          <tr><th>Date</th><td>{{createdAt}}</td></tr>
        </table>
        <p>We will contact you shortly to confirm delivery details.</p>
        <a class="cta" href="{{ctaUrl}}">{{ctaLabel}}</a>
      `.trim() })
  },
  order_delivered: {
    subject: 'Order {{orderNumber}} delivered',
    html: layout({
      title: 'Order delivered',
      bodyHtml: `
        <p>Hello {{name}},</p>
        <p>Your order <strong>{{orderNumber}}</strong> was delivered on {{deliveredAt}}.</p>
        <p>Thank you for choosing WattSun.</p>
        <a class="cta" href="{{ctaUrl}}">View order</a>
      `.trim() })
  },
  loyalty_welcome: {
    subject: 'Welcome to WattSun Loyalty',
    html: layout({
      title: 'Welcome to Loyalty',
      bodyHtml: `
        <p>Welcome to <strong>WattSun Loyalty</strong>!</p>
        <p>Your account ID is <strong>{{accountId}}</strong>.</p>
        <p>Enrollment duration: {{durationMonths}} months. Withdrawals available after {{withdrawWaitDays}} days.</p>
        <p>{{message}}</p>
      `.trim() })
  },
  penalty: {
    subject: 'Loyalty update: a penalty was applied',
    html: layout({
      title: 'Loyalty penalty',
      bodyHtml: `
        <p>Hello,</p>
        <p>A penalty of <strong>{{points}}</strong> point(s) was applied to your account.</p>
        <p>Note: {{note}}</p>
        <p>Your new balance is <strong>{{balance}}</strong> points.</p>
      `.trim() })
  },
  withdrawal_approved: {
    subject: 'Your loyalty withdrawal was approved',
    html: layout({
      title: 'Withdrawal approved',
      bodyHtml: `
        <p>Hello,</p>
        <p>Your loyalty withdrawal request has been <strong>approved</strong>.</p>
        <p>{{message}}</p>
      `.trim() })
  },
  withdrawal_paid: {
    subject: 'Your loyalty withdrawal was paid',
    html: layout({
      title: 'Withdrawal paid',
      bodyHtml: `
        <p>Hello,</p>
        <p>Your withdrawal has been <strong>paid</strong>.</p>
        <p>{{message}}</p>
        <p>Reference: <strong>{{payoutRef}}</strong></p>
      `.trim() })
  },
  withdrawal_rejected: {
    subject: 'Your loyalty withdrawal was rejected',
    html: layout({
      title: 'Withdrawal rejected',
      bodyHtml: `
        <p>Hello,</p>
        <p>Your loyalty withdrawal request was <strong>rejected</strong>.</p>
        <p>{{message}}</p>
      `.trim() })
  },
  user_signup: {
    subject: 'Welcome to WattSun',
    html: layout({
      title: 'Welcome',
      bodyHtml: `
        <p>Welcome to <strong>WattSun</strong>!</p>
        <p>Your account has been created successfully.</p>
        <a class="cta" href="{{ctaUrl}}">Get started</a>
      `.trim() })
  },
  password_reset: {
    subject: 'Password reset instructions',
    html: layout({
      title: 'Password reset',
      bodyHtml: `
        <p>We received a request to reset your password.</p>
        <p>If this was you, click the button below to set a new password.</p>
        <a class="cta" href="{{resetUrl}}">Reset Password</a>
        <div class="divider"></div>
        <p class="muted">If you did not request this, you can ignore this email.</p>
      `.trim() })
  },
};

async function main() {
  const DB_FILE = resolveDbPath();
  const db = new sqlite3.Database(DB_FILE);
  console.log('[upgrade-templates] DB = %s', DB_FILE);

  // Ensure table exists
  await new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS email_templates (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         code TEXT NOT NULL UNIQUE,
         subject TEXT NOT NULL,
         html TEXT NOT NULL,
         updated_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
      [],
      (err) => (err ? reject(err) : resolve())
    );
  });

  // Upsert each template with professional HTML
  const stmt = db.prepare(
    `INSERT INTO email_templates (code,subject,html,updated_at)
       VALUES (?,?,?,datetime('now'))
     ON CONFLICT(code) DO UPDATE SET
       subject=excluded.subject,
       html=excluded.html,
       updated_at=excluded.updated_at`
  );

  db.serialize(() => {
    db.run('BEGIN');
    try {
      for (const [code, { subject, html }] of Object.entries(TPL)) {
        stmt.run(code, subject, html);
      }
      db.run('COMMIT');
      console.log('[upgrade-templates] done');
    } catch (e) {
      db.run('ROLLBACK');
      console.error('[upgrade-templates] error:', e.message);
      process.exitCode = 1;
    } finally {
      try { db.close(); } catch {}
    }
  });
}

main().catch(e => { console.error(e); process.exit(1); });

