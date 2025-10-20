// scripts/smtp_test_send.js
// Sends a single test email using SMTP settings from .env (+ optional ENV_FILE override).

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');

function loadEnv() {
  dotenv.config();
  const candidate = process.env.ENV_FILE || path.join(process.cwd(), 'env');
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate, override: true });
  }
}

function parseBool(v, fallback = false) {
  if (v == null || v === '') return fallback;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

async function main() {
  loadEnv();

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = parseBool(process.env.SMTP_SECURE, String(port) === '465');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || process.env.EMAIL_FROM || user;
  const to = process.env.TEST_TO || user || from;

  if (!host) throw new Error('SMTP_HOST not set.');
  if (!user || !pass) throw new Error('SMTP_USER/SMTP_PASS not set.');
  if (!to) throw new Error('No recipient resolved (set TEST_TO or SMTP_USER).');

  const transporter = nodemailer.createTransport({
    host, port, secure, auth: { user, pass }, tls: { rejectUnauthorized: false }
  });

  await transporter.verify();
  const info = await transporter.sendMail({
    from,
    to,
    subject: 'WattSun QA SMTP Test',
    text: 'This is a test email from WattSun QA environment.',
    html: '<p>This is a <b>test email</b> from WattSun QA environment.</p>'
  });
  console.log('[smtp-test] sent:', info && info.messageId ? info.messageId : info);
}

main().catch(e => {
  console.error('[smtp-test] error:', e && e.message ? e.message : e);
  process.exit(1);
});

