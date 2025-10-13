# 🧭 WattSun QA Environment — Finalization & Handover

_Date: 2025-10-13_  
_Revision: v2025.10.13-QA-H1_

---

## ✅ Overview
This document summarizes the configuration, verification, and operational status of the **WattSun QA Environment** hosted on the Synology NAS.  
It defines how QA differs from DEV, where assets are located, and how to start, restart, and verify the environment safely.

---

## ⚙️ Environment Summary

| Parameter | QA | DEV |
|------------|----|-----|
| **Port** | `3000` | `3001` |
| **Cloudflare Tunnel** | `https://qa.wattsun.co.ke` | `https://api.wattsun.co.ke` |
| **NODE_ENV** | `qa` | `dev` |
| **Database** | `/volume1/web/wattsun/data/qa/wattsun.qa.db` | `/volume1/web/wattsun/data/dev/wattsun.dev.db` |
| **Frontend banner** | Yellow – “QA Environment — Build v2025.10.13” | Green – “DEV Environment — Build v2025.10.13” |

---

## 📂 Directory Structure (Key Paths)

```
/volume1/web/wattsun/
├── data/
│   ├── dev/wattsun.dev.db
│   └── qa/wattsun.qa.db
├── logs/
│   ├── dev/app.out
│   └── qa/app.out
├── run/
│   ├── dev/app.pid
│   └── qa/app.pid
├── scripts/
│   ├── start_dev.sh
│   ├── start_qa.sh
│   ├── restart_wattsun.sh
│   ├── restart_qa.sh
│   └── qa_restart_cycle.sh
└── public/
    ├── index.html  ← banner auto-detects environment via `/api/env`
    └── ...
```

---

## 🧩 Verified Components

| Component | Status | Notes |
|------------|---------|-------|
| QA Database | ✅ | Exists, owned by `53Bret:users`, correct permissions (664) |
| QA Backend | ✅ | Starts cleanly via `start_qa.sh` |
| `/api/env` | ✅ | Returns `{ "env": "qa" }` |
| `/api/health` | ✅ | Returns `OK` |
| Banner | ✅ | Automatically shows yellow QA header |
| Cloudflared Tunnel | ✅ | Active and mapped to port 3000 |
| `.gitignore` | ✅ | Protects `data/`, `logs/`, `run/`, `.env`, and uploads |
| Git Remotes | ✅ | `origin` fetch/push → `git@github.com:WattSunK/wattsun.git` |
| Restart Scripts | ✅ | Tested; no data loss |
| QA Health Ping | ⚙️ Pending (optional) | `/scripts/qa_health_ping.sh` can be scheduled in DSM |

---

## 🤰 Core Scripts

| Script | Purpose |
|---------|----------|
| `start_qa.sh` | Launch QA environment (`NODE_ENV=qa`, port 3000) |
| `restart_qa.sh` | Stop + start QA |
| `qa_restart_cycle.sh` | Pull latest code, reinstall deps, restart both DEV & QA, verify health |
| `restart_wattsun.sh` | Full restart of both environments |
| `start_dev.sh` | Launch DEV environment (port 3001) |

---

## 🧱 Verification Commands

Run locally on the NAS:

```bash
curl -s http://127.0.0.1:3000/api/env
# → {"env":"qa"}

curl -s http://127.0.0.1:3000/api/health
# → OK

curl -s https://qa.wattsun.co.ke/api/health
# → OK (Cloudflare tunnel verified)
```

---

## 🔒 Data Protection

- `.gitignore` now excludes all runtime assets:  
  `data/`, `logs/`, `run/`, `.env`, `.env.*`, `uploads/`, `*.db`, `*.sqlite`
- `server.js` contains directory-auto-create logic to prevent missing DB folders.
- `git clean -fd` is now safe; only untracked temp folders (like `archive/`) remain removable.

---

## 🩺 Optional Monitoring (Recommended)

Create `/volume1/web/wattsun/scripts/qa_health_ping.sh`:

```bash
#!/bin/bash
curl -fsS https://qa.wattsun.co.ke/api/health \
  || echo "$(date '+%F %T') QA health check failed" >> /volume1/web/wattsun/logs/qa_health.log
```

Schedule it in DSM → Task Scheduler every 10 minutes.

---

## 📦 Promotion Workflow (DEV → QA)

1. Develop and test on DEV (port 3001).  
2. Commit and push to GitHub.  
3. Run on NAS:
   ```bash
   sudo bash /volume1/web/wattsun/scripts/qa_restart_cycle.sh
   ```
4. QA automatically pulls latest code, reinstalls dependencies, and restarts.  
5. Confirm via:
   ```bash
   curl -s https://qa.wattsun.co.ke/api/health
   ```

---

## 🪪 Ownership & Access

- **Primary user:** `53Bret`
- **Group:** `users`
- **Permissions:** 775 for directories, 664 for DB files
- **Auth:** SSH + GitHub SSH keys configured on NAS

---

## 🗾 Version & Audit

| Artifact | Version | Last Verified |
|-----------|----------|----------------|
| QA Database | Clone of DEV DB (2025-10-13) | 2025-10-13 |
| `.gitignore` | Commit 13ce3ae | 2025-10-13 |
| `start_qa.sh` | Absolute-path v2 | 2025-10-13 |
| QA Banner | v2025.10.13 | 2025-10-13 |
| This Document | v2025.10.13-QA-H1 | 2025-10-13 |

---

## ✅ Next Steps

- [ ] Add automated `/api/health` ping to DSM Task Scheduler  
- [ ] Periodically verify `qa_restart_cycle.sh` does **not** delete `/data/qa/`  
- [ ] Extend `.gitignore` if new runtime folders appear  
- [ ] Tag this commit in GitHub:  
  ```bash
  git tag -a QA-2025.10.13 -m "QA Environment finalized and verified"
  git push origin QA-2025.10.13
  ```

---

**End of Document**

