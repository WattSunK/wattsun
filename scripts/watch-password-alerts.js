const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const nodemailer = require("nodemailer");

const DB_PATH = process.env.DB_PATH_USERS || path.resolve(__dirname, "../user-setup/users.db");
const POLL_INTERVAL = Number(process.env.ALERT_POLL_MS || 30000);
const FROM = process.env.EMAIL_FROM || "no-reply@wattsun.co.ke";
const TO   = process.env.ALERT_EMAIL_TO || FROM;

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";

let lastSeenId = 0;
const db = new sqlite3.Database(DB_PATH);
const transporter = nodemailer.createTransport({
  host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
  auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
});

function check() {
  db.all(
    "SELECT id,user_id,action,changed_at FROM users_audit WHERE id > ? ORDER BY id ASC",
    [lastSeenId],
    (err, rows) => {
      if (err) return console.error("[ALERT] DB error:", err.message);
      if (!rows?.length) return;
      rows.forEach(r => {
        const subject = `[WattSun] User change: ${r.action} (#${r.id})`;
        const text = `user_id=${r.user_id}\naction=${r.action}\nwhen=${r.changed_at}`;
        if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
          transporter.sendMail({ from: FROM, to: TO, subject, text }, e => {
            if (e) console.error("[ALERT] email error:", e.message);
            else console.log("[ALERT] email sent:", subject);
          });
        } else {
          console.log("[ALERT]", subject, text);
        }
      });
      lastSeenId = rows[rows.length - 1].id;
    }
  );
}
console.log(`[ALERT] watching ${DB_PATH} every ${POLL_INTERVAL}ms → ${TO}`);
setInterval(check, POLL_INTERVAL);
