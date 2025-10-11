# 🧭 WattSun Environment Isolation Guide
_Last updated: 11 Oct 2025_

This document explains how **Development** (`main`) and **QA** (`qa`) environments are separated in the WattSun project — ensuring stable, parallel testing without interference.

---

## 1️⃣ Overview

| Environment | Git Branch | Port | Database Path | Domain | Purpose |
|--------------|-------------|------|----------------|----------|----------|
| **Development (Dev)** | `main` | `3001` | `/data/dev/` | `api.wattsun.co.ke` | Active coding, feature testing |
| **Quality Assurance (QA)** | `qa` | `3000` | `/data/qa/` | `qa.wattsun.co.ke` | Stable verification and pre-release testing |

Each environment has its own:
- Branch in Git
- Database files
- Log files
- Process / port
- Cloudflare tunnel

---

## 2️⃣ Branch Separation — Code Isolation

Each environment maps to a Git branch.

```bash
# Switch between environments
git checkout main    # → Development code
git checkout qa      # → QA code
```

- Develop freely on `main`.
- When a stable milestone is reached:
  ```bash
  git checkout qa
  git merge main
  git push origin qa
  ```
- QA remains frozen until you merge new changes.

➡️ **Result:** No risk of in-progress code leaking into QA.

---

## 3️⃣ Filesystem Layout — Data & Logs

```text
/volume1/web/wattsun/
├── data/
│   ├── dev/
│   │   ├── wattsun.dev.db
│   │   └── inventory.dev.db
│   └── qa/
│       ├── wattsun.qa.db
│       └── inventory.qa.db
├── logs/
│   ├── dev/
│   └── qa/
└── run/
    ├── dev/
    └── qa/
```

Each environment’s `.env` and startup scripts point to its own directories.

---

## 4️⃣ Environment Variables

| Variable | Dev Value | QA Value |
|-----------|------------|-----------|
| `PORT` | 3001 | 3000 |
| `SQLITE_DB` | `./data/dev/wattsun.dev.db` | `./data/qa/wattsun.qa.db` |
| `DB_PATH_USERS` | `./data/dev/wattsun.dev.db` | `./data/qa/wattsun.qa.db` |
| `LOG_FILE` | `./logs/dev/app.out` | `./logs/qa/app.out` |

Defined in `.env` and `.env.qa`.

---

## 5️⃣ Startup Scripts

| Script | Purpose | Port | PID File |
|---------|----------|------|-----------|
| `scripts/start_nas.sh` | Launch Dev server | 3001 | `run/dev/app.pid` |
| `scripts/start_qa.sh`  | Launch QA server  | 3000 | `run/qa/app.pid` |

Each script loads its respective `.env` and creates its own log and PID files.

---

## 6️⃣ Cloudflare Tunnels

| Tunnel | Hostname | Local Service | Notes |
|---------|-----------|----------------|--------|
| `wattsun-dev` | `api.wattsun.co.ke` | `http://127.0.0.1:3001` | For active dev |
| `wattsun-qa`  | `qa.wattsun.co.ke`  | `http://127.0.0.1:3000` | For pre-release testing |

Config file:  
`infra/cloudflared/config.qa.yml`

---

## 7️⃣ Promotion Workflow

When Dev passes verification:

```bash
git checkout qa
git merge main
scripts/stop_qa.sh
scripts/start_qa.sh
```

Optionally tag the release:
```bash
git tag -a qa-release-2025-10-11 -m "QA build after User Auth stabilization"
git push origin qa --tags
```

---

## 8️⃣ Backup & Monitoring

Update your backup scripts to include both paths:

```bash
# Backup both environments
cp data/dev/*.db backups/dev_$(date +%F)/
cp data/qa/*.db backups/qa_$(date +%F)/
```

Monitor logs separately:
```bash
tail -n 50 logs/dev/app.out
tail -n 50 logs/qa/app.out
```

---

## 9️⃣ Summary Diagram

```
     ┌──────────────┐
     │   main (Dev) │───▶ /data/dev/  ──▶ port 3001 ──▶ api.wattsun.co.ke
     └──────────────┘
              │
      (merge when stable)
              ▼
     ┌──────────────┐
     │    qa (QA)   │───▶ /data/qa/   ──▶ port 3000 ──▶ qa.wattsun.co.ke
     └──────────────┘
```

---

## 🔒 10️⃣ Key Rules

✅ Dev and QA **must never share** DB or log paths  
✅ Always `git merge main → qa` (not the reverse)  
✅ Cloudflare tunnels point to separate ports  
✅ QA server should only be updated by intentional promotion

---

**Maintainer Note:**  
This guide forms part of the official WattSun operations runbook.  
All contributors must follow these isolation rules to avoid cross-environment data corruption or accidental deployment regressions.
