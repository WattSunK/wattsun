# ⚙️ WattSun Environment Startup & Validation Guide

## 🧭 Overview
This document outlines critical steps and checks to perform when **starting a new WattSun environment** (DEV, QA, STAGING, or PROD).  
It is based on lessons learned from environment desynchronization, `.env` misloads, and background worker issues encountered on the Synology NAS.

---

## 1. 📁 Directory Layout

Each environment lives under `/volume1/web/wattsun`:

```
/volume1/web/wattsun/
 ├── data/
 │    ├── dev/wattsun.dev.db
 │    ├── qa/wattsun.qa.db
 │    └── ...
 ├── qa/
 │    ├── logs/
 │    └── scripts/
 ├── scripts/
 │    ├── start_dev.sh
 │    ├── start_qa.sh
 │    ├── notifications_worker.js
 │    ├── loyalty_daily_accrual.js
 │    ├── loyalty_weekly_digest.js
 │    └── ...
 ├── .env
 ├── .env.qa
 ├── logs/
 └── public/
```

---

## 2. 🔑 Environment Files (`.env` / `.env.qa`)

Each environment **must have its own `.env` file**, containing explicit DB and SMTP settings.

### Minimum required keys:
```ini
# --- Database ---
DB_PATH_USERS=/volume1/web/wattsun/data/<env>/wattsun.<env>.db
SQLITE_MAIN=/volume1/web/wattsun/data/<env>/wattsun.<env>.db
SQLITE_DB=/volume1/web/wattsun/data/<env>/wattsun.<env>.db

# --- SMTP ---
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=youraddress@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM="WattSun <no-reply@wattsun.co.ke>"
EMAIL_FROM="WattSun <no-reply@wattsun.co.ke>"

# --- General ---
NODE_ENV=<env>
NOTIFY_DRY_RUN=0
```

### Common pitfalls
- Running `sudo node ...` **drops environment variables**.  
  Always force the `.env` path inside scripts:
  ```js
  process.env.ENV_FILE = process.env.ENV_FILE || "/volume1/web/wattsun/.env.qa";
  require("dotenv").config({ path: process.env.ENV_FILE });
  ```
- Never rely on `process.cwd()` — it changes when called from cron or Task Scheduler.

---

## 3. 🧩 Startup Scripts

Each environment has a self-contained startup wrapper:

| Script | Port | Starts | Notes |
|---------|------|--------|-------|
| `start_dev.sh` | 3001 | Backend + worker | Uses `wattsun.dev.db` |
| `start_qa.sh`  | 3000 | Backend + worker | Uses `wattsun.qa.db` |

### Key checks
```bash
sudo bash /volume1/web/wattsun/scripts/start_qa.sh
grep -i "DB_PATH" /volume1/web/wattsun/qa/logs/worker.out | tail -n 2
```
✅ Expected:
```
[worker:init] Using DB_PATH=/volume1/web/wattsun/data/qa/wattsun.qa.db
```

---

## 4. 📨 Notifications Worker

**`scripts/notifications_worker.js`** runs continuously to send queued emails.

### Environment expectations
- Picks up DB path from `.env` variables.
- Uses Nodemailer + Gmail SMTP.
- Must log:
  ```
  [worker:init] Using DB_PATH=/volume1/web/wattsun/data/qa/wattsun.qa.db
  [worker] Starting loop... batch=20 intervalMs=60000 dryRun=false db=/volume1/web/wattsun/data/qa/wattsun.qa.db
  ```

### Troubleshooting
| Symptom | Cause | Fix |
|----------|--------|-----|
| Emails stuck as “Queued” | Worker connected to wrong DB | Check `DB_PATH` in logs |
| Worker logs `${SQLITE_MAIN}` literally | Environment variable not resolved | Add `.env` loader at script top |
| “Cannot POST /api/internal/notify” | Route missing or not mounted | Confirm `/api/internal/notify` registered in `server.js` |

---

## 5. 💡 Loyalty Scripts

| Script | Purpose | Schedule |
|---------|----------|----------|
| `loyalty_daily_accrual.js` | Add daily reward points | Daily @ 06:00 |
| `loyalty_weekly_digest.js` | Email weekly summaries | Monday @ 07:00 |

### Verification
Run manually once:
```bash
sudo node /volume1/web/wattsun/scripts/loyalty_daily_accrual.js
sudo node /volume1/web/wattsun/scripts/loyalty_weekly_digest.js
```

✅ Expected:
```
[loyalty] Loading environment from /volume1/web/wattsun/.env.qa
[loyalty] SQLITE_MAIN=/volume1/web/wattsun/data/qa/wattsun.qa.db
[loyalty_daily_accrual] resolved_db_path = /volume1/web/wattsun/data/qa/wattsun.qa.db
```

---

## 6. 🕓 Task Scheduler / Cron Jobs

### Daily Accrual
```bash
sudo -u 53Bret ENV_FILE=/volume1/web/wattsun/qa/.env.qa NODE_ENV=qa /usr/local/bin/node /volume1/web/wattsun/scripts/loyalty_daily_accrual.js >> /volume1/web/wattsun/qa/logs/loyalty_daily.out 2>&1
```

### Weekly Digest
```bash
sudo -u 53Bret ENV_FILE=/volume1/web/wattsun/qa/.env.qa NODE_ENV=qa /usr/local/bin/node /volume1/web/wattsun/scripts/loyalty_weekly_digest.js >> /volume1/web/wattsun/qa/logs/loyalty_weekly.out 2>&1
```

✅ Both jobs:
- Load `.env.qa`
- Run under correct user
- Log output to `/qa/logs/`

---

## 7. 🔍 Validation Checks

After startup or cron run:

| Check | Command | Expected |
|--------|----------|-----------|
| Worker DB path | `grep -i "DB_PATH" /volume1/web/wattsun/qa/logs/worker.out` | `/data/qa/wattsun.qa.db` |
| SMTP health | `sudo node scripts/smtp_verify.js` | “OK: connection and config look good” |
| Notification status | `sqlite3 data/qa/wattsun.qa.db "SELECT id,email,status FROM notifications_queue ORDER BY id DESC LIMIT 5;"` | `Sent` |
| Cron success | `grep -i "resolved_db_path" qa/logs/*.out` | `.../qa/wattsun.qa.db` |

---

## 8. 🚨 Common Pitfalls

| Issue | Root Cause | Resolution |
|--------|-------------|-------------|
| `DB_PATH` logs as `${SQLITE_MAIN}` | String interpolation bug in old script | Replace with environment-based logic |
| Worker never starts | Port 3000 still occupied | Kill prior Node process: `sudo pkill -f server.js` |
| Git pull fails on NAS | Local changes in `run/last_sha` | `git update-index --assume-unchanged run/last_sha` |
| Scripts run but hit DEV DB | `.env` not loaded under `sudo` | Add explicit `.env.qa` loader |
| Notifications stay Queued | Worker reading DEV DB or SMTP missing | Fix `.env.qa` paths and SMTP creds |

---

## 9. 🧾 Recommended Verification Sequence (for new environment)

1. `sudo bash scripts/start_<env>.sh`
2. `curl -fsS http://127.0.0.1:<port>/api/health`
3. `grep "DB_PATH" logs/worker.out`
4. `sudo node scripts/smtp_verify.js`
5. `sqlite3 data/<env>/wattsun.<env>.db ".tables"`
6. `sudo node scripts/loyalty_daily_accrual.js`
7. `sudo node scripts/loyalty_weekly_digest.js`
8. Verify notifications → `Sent`

---

## ✅ Final Checklist

| Component | Verified | Notes |
|------------|-----------|-------|
| `.env.<env>` present and correct | ☐ | |
| Worker running with correct DB path | ☐ | |
| Loyalty scripts connected to same DB | ☐ | |
| SMTP verified via `smtp_verify.js` | ☐ | |
| Cron / Task Scheduler jobs added | ☐ | |
| Git pulls without local conflicts | ☐ | |

---

**Document version:** `v1.0 – October 2025`  
**Maintainer:** `WattSun DevOps (NAS Runtime Guide)`  
**Purpose:** Ensure deterministic environment setup for all future WattSun deployments.
