const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DB_PATH_USERS || path.resolve(__dirname, '../user-setup/users.db');
const LOG_FILE = process.env.PID_ALERT_LOG || path.resolve(__dirname, '../logs/alerts.log');
const POLL_MS = Number(process.env.AUDIT_POLL_MS || 60000);

function log(msg){ const t=new Date().toISOString(); fs.appendFileSync(LOG_FILE, `[${t}] ${msg}\n`); console.log(`[${t}] ${msg}`); }

function pollAudit(){
  const db = new sqlite3.Database(DB_PATH);
  db.all(
    "SELECT id,user_id,action,changed_at FROM users_audit WHERE changed_at >= datetime('now','-5 minutes') ORDER BY id DESC LIMIT 20",
    [],
    (err, rows) => {
      if (err) log(`[QUERY ERROR] ${err.message}`);
      else rows?.forEach(r => log(`[AUDIT] id=${r.id} user_id=${r.user_id} action=${r.action} at=${r.changed_at}`));
      db.close();
    }
  );
}

log(`[PID ALERT] polling ${DB_PATH} every ${POLL_MS}ms; logging to ${LOG_FILE}`);
setInterval(pollAudit, POLL_MS);
