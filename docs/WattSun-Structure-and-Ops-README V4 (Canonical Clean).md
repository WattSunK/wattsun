# WattSun — Structure & Ops V4 (Canonical Clean)

**Status:** Living • **Date:** 2025-09-23  
**Supersedes:** Base, V2, V3

---

## 1) Purpose & Scope
This document defines the **canonical reference** for repository structure, runtime operations, databases, admin roadmap, and ops practices.  
It merges content from all prior Structure & Ops versions (Base → V3).

---

## 2) Repository Layout

```
wattsun/
├─ server.js
├─ package.json
├─ package-lock.json
├─ .gitignore
├─ .gitattributes
├─ docs/                       # canonical docs (API, Ledger, SSOT, Style, Roadmap, Loyalty)
│  ├─ 001-api-contracts V16 (Clean).md
│  ├─ migration-ledger V13 (Clean).md
│  ├─ admin-style-guide V3 (Clean).md
│  ├─ WattSun_Single_Source_of_Truth V13 (Clean).md
│  ├─ WattSun_Loyalty_Program V4 (Clean).md
│  └─ WattSun_Conversation_Roadmap V12 (Clean).md
├─ infra/                      # Cloudflared and infra configs
├─ public/                     # **frontend** (site + admin)
│  ├─ index.html
│  ├─ admin/
│  ├─ images/                  # consolidated images
│  ├─ images/products/         # product images
│  ├─ partials/                # admin partials
│  ├─ js/
│  └─ css/
├─ routes/                     # backend Express routes
├─ scripts/                    # ops helpers (NAS + maintenance)
│  ├─ start_nas.sh
│  ├─ stop_nas.sh
│  ├─ restart_nas.sh
│  ├─ git_pull_update.sh
│  ├─ backup_sqlite.sh
│  ├─ start_cloudflared.sh
│  └─ loyalty_daily_accrual.js (planned)
├─ data/                       # **canonical data root**
│  └─ dev/
│     ├─ wattsun.dev.db        # Users DB (auth + overlay)
│     ├─ inventory.dev.db      # Items DB
│     ├─ orders.dev.json       # transitional orders
│     └─ ...
├─ user-setup/                 # legacy compatibility
│  └─ users.db -> ../data/dev/wattsun.dev.db
├─ logs/
│  ├─ app.out
│  ├─ app.err
│  ├─ update.log
│  └─ cloudflared.*
└─ run/
   ├─ app.pid
   ├─ cloudflared.pid
   └─ last_sha
```

---

## 3) Runtime & Process
- Node v20 (Synology NAS).  
- Default port: **3001** (override with `PORT`).  
- Start/stop/restart via scripts (`scripts/start_nas.sh`, etc.).  
- Health: `GET /api/health` (local + Cloudflare).  

---

## 4) Databases
- **Users DB:** `data/dev/wattsun.dev.db` (auth, users, admin overlay).  
- **Inventory DB:** `data/dev/inventory.dev.db` (items, categories, messages).  
- **Overlay:** `admin_order_meta` table in Users DB.  
- **Product images:** filenames only → `/images/products/<filename>`; fallback: `placeholder.jpg`.  
- **Items API:** `GET /api/items` → active only by default; admins call `?active=0` to see all.  

---

## 5) Diagnostic Endpoints
- `GET /api/admin/_diag/ping`  
- `GET /api/admin/_diag/db` → returns sqliteVersion, overlay path, counts, pid  

---

## 6) Auth Endpoints
- `POST /api/login` — `{ email, password }`  
- `POST /api/signup` — `{ name, email, phone?, password }`  
- `POST /api/reset-request` — `{ email }`  
- `POST /api/reset-confirm` — `{ token, password }`  

---

## 7) Phase 6 — Admin Dashboard
- **6.0 Core Restore ✅** Sidebar, topbar, loader.  
- **6.1 Orders List ✅** Table with search, filter, pagination.  
- **6.2 View/Edit ✅** Modal with status/driver/notes.  
- **6.3 Backend wiring ✅** GET drivers, PATCH orders overlay.  
- **6.4 Customer Reflection 🔜** Sync My Orders/Track pages after admin save.  
- **6.5 Hardening** Validation, formatting, rate limiting, tests.  

---

## 8) Ops & Scripts
- **NAS runtime:** `start_nas.sh`, `stop_nas.sh`, `restart_nas.sh`.  
- **Updates:** `git_pull_update.sh` (PC → GitHub → NAS).  
- **Cloudflared:** `start_cloudflared.sh`.  
- **Backups:** `backup_sqlite.sh`.  
- **Rollback:** `git reset --hard <tag>` → restart.  

---

## 9) Known Gaps / Next Steps
- Orders totals show “KES 0” for historical data.  
- Signup sometimes shows DB error in browser (logs show cause).  
- Favicon missing (cosmetic).  
- Orders migration to SQL tables (`orders`, `order_items`, `status_history`).  

---

## 10) Quick Commands
```bash
# Diagnostics
curl -fsS http://127.0.0.1:3001/api/admin/_diag/ping
curl -fsS http://127.0.0.1:3001/api/admin/_diag/db | jq .

# Auth
curl -fsS -X POST http://127.0.0.1:3001/api/signup -H 'Content-Type: application/json'   -d '{"name":"demo","email":"demo@example.com","phone":"+254700000777","password":"Passw0rd!"}'
```

---

## 11) Rollback & Safety
- Remove admin mounts/partials if needed.  
- `admin_order_meta` can remain harmless.  
- Roll back via `git checkout <KNOWN_GOOD_TAG>`.  

---

## 12) Changelog
- **Base (Aug 2025):** Repo layout, Cloudflared, Git flow, backups.  
- **V2 (2025-08-13):** DB overlay, Phase 6 core plan.  
- **V3 (2025-08-16):** Product images, Items API visibility.  
- **V4 (2025-09-23):** Clean consolidation, cross-links to canonical docs.

