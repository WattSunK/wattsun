// scripts/notifications_worker.js
// Sends queued emails from notifications_queue using SMTP.
// Usage:
//   node scripts/notifications_worker.js           # loop mode (poll every N seconds)
//   node scripts/notifications_worker.js --once   # process one batch and exit
//
// ENV (.env):
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE(=true|false), SMTP_USER, SMTP_PASS, SMTP_FROM
//   WORKER_BATCH (default 20), WORKER_INTERVAL_MS (default 60000), NOTIFY_DRY_RUN(=1 to skip send)
//
// Notes:
// - Simple {{var}} templating with values from payload JSON and email_templates.html
// - Marks rows Sent/Failed with timestamps and error text
// - Safe to run concurrently if you keep batch sizes small

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const sqlite3 = require('sqlite3').verbose();

// --- Environment Loader (override for QA) ---
const envPath =
  process.env.ENV_FILE && fs.existsSync(process.env.ENV_FILE)
    ? process.env.ENV_FILE
    : '/volume1/web/wattsun/qa/.env.qa';

console.log(`[worker:init] Loading environment from ${envPath}`);
dotenv.config({ path: envPath, override: true });

// Load .env and optional ENV_FILE overlay (e.g., .env.qa)
function loadEnv() {
  dotenv.config();
  const candidate = process.env.ENV_FILE || path.join(process.cwd(), 'env');
  if (candidate && fs.existsSync(candidate)) {
    dotenv.config({ path: candidate, override: true });
  }
}
loadEnv();

// ---------- Config ----------
const DB_PATH =
  process.env.SQLITE_MAIN ||
  process.env.DB_PATH_USERS ||
  process.env.SQLITE_DB ||
  path.join(__dirname, "../data/dev/wattsun.dev.db");

console.log(`[worker:init] Using DB_PATH=${DB_PATH}`);
const BATCH = parseInt(process.env.WORKER_BATCH || '20', 10);
const INTERVAL = parseInt(process.env.WORKER_INTERVAL_MS || '60000', 10);
const DRY_RUN = !!(process.env.NOTIFY_DRY_RUN && String(process.env.NOTIFY_DRY_RUN) !== '0' && String(process.env.NOTIFY_DRY_RUN).toLowerCase() !== 'false');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'true').toLowerCase() !== 'false';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || (SMTP_USER || 'no-reply@wattsun.local');

// ---------- DB ----------
const db = new sqlite3.Database(DB_PATH);

// ---------- Mailer ----------
let transporter = null;
async function getTransporter() {
  if (DRY_RUN) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      tls: { rejectUnauthorized: false }
    });
    // quick verify
    await transporter.verify().catch(e => {
      console.warn('[worker] SMTP verify failed:', e.message);
    });
  }
  return transporter;
}

// ---------- Template rendering ----------
function renderTemplate(html, payload) {
  return html.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const v = payload && Object.prototype.hasOwnProperty.call(payload, key) ? payload[key] : '';
    return String(v == null ? '' : v);
  });
}

// ---------- DB helpers ----------
function fetchBatch(limit) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT q.id, q.kind, q.user_id, q.email, q.payload, t.subject, t.html
       FROM notifications_queue q
       LEFT JOIN email_templates t ON t.code = q.kind
       WHERE q.status='Queued'
       ORDER BY q.id ASC
       LIMIT ?`,
      [limit],
      (err, rows) => (err ? reject(err) : resolve(rows || []))
    );
  });
}

function markSent(id) {
  return new Promise((resolve, reject) => {
    db.run(`UPDATE notifications_queue SET status='Sent', sent_at=datetime('now'), error=NULL WHERE id=?`, [id], function (err) {
      if (err) return reject(err);
      resolve(true);
    });
  });
}

function markFailed(id, errorText) {
  return new Promise((resolve, reject) => {
    db.run(`UPDATE notifications_queue SET status='Failed', sent_at=datetime('now'), error=? WHERE id=?`, [String(errorText).slice(0, 500)], function (err) {
      if (err) return reject(err);
      resolve(true);
    });
  });
}

// You likely have a users table with email; fallback to q.email when user_id missing.
function getUserEmail(userId) {
  return new Promise((resolve) => {
    if (!userId) return resolve(null);
    db.get(`SELECT email FROM users WHERE id=?`, [userId], (err, row) => {
      if (err) return resolve(null);
      resolve(row && row.email ? row.email : null);
    });
  });
}

// ---------- Core ----------
async function processOnce() {
  const rows = await fetchBatch(BATCH);
  if (!rows.length) {
    console.log('[worker] No queued notifications.');
    return 0;
  }
  const tx = await getTransporter();
  let sent = 0;
  for (const r of rows) {
    try {
      const payload = (() => { try { return JSON.parse(r.payload || '{}'); } catch { return {}; } })();
      const toEmail = r.email || (await getUserEmail(r.user_id));
      if (!toEmail) {
        await markFailed(r.id, 'No recipient email (user or queue email missing)');
        continue;
      }
      const subject = renderTemplate(r.subject || `WattSun: ${r.kind}`, payload);
      const html = renderTemplate(r.html || `<p>${r.kind}</p><pre>${JSON.stringify(payload, null, 2)}</pre>`, payload);

      if (!DRY_RUN && tx) {
        await tx.sendMail({
          from: SMTP_FROM,
          to: toEmail,
          subject,
          html
        });
      } else {
        console.log('[worker][DRY_RUN] Would send to', toEmail, 'subject:', subject);
      }
      await markSent(r.id);
      sent++;
    } catch (e) {
      console.error('[worker] send failed:', e.message);
      try { await markFailed(r.id, e.message); } catch {}
    }
  }
  console.log(`[worker] Processed ${rows.length}, sent=${sent}, dryRun=${DRY_RUN}`);
  return sent;
}

async function main() {
  const once = process.argv.includes('--once');
  if (once) {
    await processOnce();
    process.exit(0);
  }
  // loop mode
  console.log('[worker] Starting loop... batch=%d intervalMs=%d dryRun=%s db=%s', BATCH, INTERVAL, DRY_RUN, DB_PATH);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await processOnce().catch(e => console.error('[worker] batch error:', e.message));
    await new Promise(r => setTimeout(r, INTERVAL));
  }
}

main().catch(e => {
  console.error('[worker] fatal:', e);
  process.exit(1);
});
