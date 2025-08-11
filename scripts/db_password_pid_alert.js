const fs = require('fs');
const chokidar = require('chokidar');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// === Configuration ===
const DB_PATH = "/volume1/web/wattsun/user-setup/users.db";
const LOG_FILE = "/volume1/web/wattsun/db_pid_alert.log";

// === Logging helper ===
function log(message) {
    const timestamp = new Date().toISOString();
    const fullMessage = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(LOG_FILE, fullMessage);
    console.log(fullMessage.trim());
}

// === Monitor for password changes ===
function watchPasswordChanges() {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
            log(`[ERROR] Could not connect to DB: ${err.message}`);
        } else {
            log(`[PID ALERT] Connected to DB at ${DB_PATH}`);
        }
    });

    setInterval(() => {
        db.all("SELECT * FROM users_audit ORDER BY changed_at DESC LIMIT 5", [], (err, rows) => {
            if (err) {
                log(`[ERROR] Failed to query users_audit: ${err.message}`);
                return;
            }
            rows.forEach(row => {
                log(`[PASSWORD ALERT] User ID ${row.user_id} column ${row.col} changed from '${row.old_value}' to '${row.new_value}' at ${row.changed_at}`);
            });
        });
    }, 10000);
}

// === Monitor for DB file changes/access ===
function watchDbFileChanges() {
    const watcher = chokidar.watch(DB_PATH, {
        persistent: true,
        ignoreInitial: true,
        usePolling: true,
        interval: 1000
    });

    watcher
        .on('change', filePath => {
            log(`[DB FILE CHANGE] ${filePath} was modified`);
        })
        .on('unlink', filePath => {
            log(`[DB FILE ALERT] ${filePath} was deleted`);
        })
        .on('add', filePath => {
            log(`[DB FILE ALERT] ${filePath} was created`);
        });
}

// === Start watchers ===
log(`[PID ALERT] Watching ${DB_PATH} for password changes and file events...`);
watchPasswordChanges();
watchDbFileChanges();
