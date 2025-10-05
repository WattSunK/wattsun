# Wattsun DB Watcher & Alert System

## Summary of Current Situation

### Problem
- The `users_audit` table in `users.db` keeps disappearing.
- This likely happens because some script (possibly `init_users_db.js` or another unknown process) is recreating `users.db`.
- When this happens, existing users (e.g., `skamunyu@gmail.com`) are deleted.

### What We’ve Done
1. Recreated `users_audit` table and trigger.
2. Added a test user.
3. Installed `chokidar` for real-time file watching.
4. Set up `watch-password-alerts.js` and `db_password_pid_alert.js` to send email alerts.
5. Determined that `db_password_pid_alert.js` must detect **processes touching the DB**.

### Goal
- Detect and log the **exact process name and PID** that modifies or deletes the DB/tables.
- Avoid running multiple overlapping watchers.

## Proposed Changes
The updated `db_password_pid_alert.js` will:
- Detect **any file change** in `users.db`.
- Run `lsof` immediately to log which processes have the DB open.
- Save this info to both console and a persistent log file.
- Email the details if Gmail credentials are correct.

## Verification Steps
### 1️⃣ Kill any running watchers
```bash
pkill -f watch-password-alerts.js
pkill -f db_password_pid_alert.js
```

### 2️⃣ Start only the PID watcher
```bash
nohup /var/packages/Node.js_v20/target/usr/local/bin/node /volume1/web/wattsun/db_password_pid_alert.js > /volume1/web/wattsun/db_pid_alert.log 2>&1 &
```

### 3️⃣ Monitor the log
```bash
tail -f /volume1/web/wattsun/db_pid_alert.log
```

### 4️⃣ When deletion happens
Look for entries like:
```
[PID ALERT] Table users_audit missing!
Processes accessing DB:
12345 node /path/to/offending/script.js
```
This reveals which process is causing the problem.
