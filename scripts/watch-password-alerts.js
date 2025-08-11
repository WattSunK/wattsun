const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const nodemailer = require("nodemailer");

// CONFIGURE THIS
const DB_PATH = path.resolve(__dirname, "user-setup/users.db");
const POLL_INTERVAL = 30000; // 30 seconds
const EMAIL_FROM = "mainakamunyu@gmail.com";
const EMAIL_TO = "mainakamunyu@gmail.com";
const EMAIL_PASS = "wepo dlsx xwav smof"; // Gmail App Password

let lastSeenId = 0;

// DB connection
const db = new sqlite3.Database(DB_PATH);

// Configure mail transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_FROM,
    pass: EMAIL_PASS,
  },
});

function checkAlerts() {
  const sql = `
    SELECT ua.id, ua.user_id, u.email, ua.changed_at
    FROM users_audit ua
    JOIN users u ON ua.user_id = u.id
    WHERE ua.id > ? AND ua.col = 'password_hash'
    ORDER BY ua.id ASC
  `;

  db.all(sql, [lastSeenId], (err, rows) => {
    if (err) {
      console.error("[ALERT WATCHER] DB error:", err);
      return;
    }

    if (rows.length > 0) {
      rows.forEach(row => {
        console.log(`[ALERT WATCHER] Password change detected for ${row.email} at ${row.changed_at}`);

        const mailOptions = {
          from: EMAIL_FROM,
          to: EMAIL_TO,
          subject: `Password Change Alert for ${row.email}`,
          text: `Password for user ${row.email} (ID ${row.user_id}) was changed at ${row.changed_at}.`,
        };

        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.error("[ALERT WATCHER] Email error:", error);
          } else {
            console.log("[ALERT WATCHER] Email sent:", info.response);
          }
        });
      });

      lastSeenId = rows[rows.length - 1].id;
    }
  });
}

console.log(`[ALERT WATCHER] Monitoring ${DB_PATH} for password changes via users_audit...`);
setInterval(checkAlerts, POLL_INTERVAL);
