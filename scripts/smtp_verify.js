// scripts/smtp_verify.js
// Verifies SMTP connectivity/config using env vars without sending mail.

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');

function loadEnv() {
  // Load .env first
  dotenv.config();
  // Allow override path via ENV_FILE, else try ./env if present
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

  if (!host) {
    console.error('[smtp-verify] SMTP_HOST not set. Aborting.');
    process.exit(2);
  }

  const hasAuth = !!(user && pass);
  console.log('[smtp-verify] Checking', { host, port, secure, hasAuth });

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: hasAuth ? { user, pass } : undefined,
    tls: { rejectUnauthorized: false },
  });

  try {
    await transporter.verify();
    console.log('[smtp-verify] OK: connection and config look good');
    process.exit(0);
  } catch (e) {
    console.error('[smtp-verify] FAIL:', e && e.message ? e.message : e);
    process.exit(1);
  }
}

main();

