# WattSun Monorepo — Structure & Ops Guide (Aug 2025)

This document captures the unified **wattsun** repository layout and the day‑to‑day operations we set up today (NAS runtime, Cloudflared, update flow, logs, and backups). It’s meant to be copy‑paste friendly for future you.

---

## 1) High‑level overview

- **Single repo:** `WattSunK/wattsun` (PC and NAS both sync to this).
- **Paths:**
  - **PC (Windows):** `C:\Users\Steve\Documents\wattsun`
  - **NAS (Synology):** `/volume1/web/wattsun`
- **Runtime model:** Node app on NAS (port **3001**), front‑end static pages served by the same Node server under `/public/`.
- **Cloudflared:** exposes the NAS service publicly as `https://api.wattsun.co.ke` → `127.0.0.1:3001` on the NAS.
- **Pull‑only NAS:** NAS can **pull** from GitHub but cannot push (push URL set to `DISABLED`). All changes flow **PC → GitHub → NAS**.

---

## 2) Repository layout

```text
wattsun/
├─ server.js
├─ package.json
├─ package-lock.json
├─ .gitignore
├─ .gitattributes
├─ .backend_checksum
├─ README.md                      # general project readme (this doc is a companion)
├─ COPY_INSTRUCTIONS.md
├─ STRUCTURE_CHECKLIST.md
├─ docs/
│  ├─ roadmap.md
│  ├─ migration-ledger.md
│  ├─ adr/
│  └─ runbooks/
├─ infra/
│  └─ cloudflared/
│     ├─ README.md
│     └─ config.sample.yml        # example tunnel config
├─ public/                        # **frontend** (site + admin)
│  ├─ index.html
│  ├─ status.html                 # status page with CF + API checks
│  ├─ admin/
│  ├─ images/                     # consolidated images
│  ├─ js/
│  ├─ css/
│  └─ …
├─ routes/                        # backend API endpoints (Express)
│  ├─ login.js
│  ├─ signup.js
│  ├─ reset.js
│  ├─ items.js
│  ├─ categories.js
│  ├─ checkout.js
│  ├─ myorders.js
│  ├─ orders.js
│  └─ track.js
├─ scripts/                       # **ops helpers** (NAS + maintenance)
│  ├─ start_nas.sh
│  ├─ stop_nas.sh
│  ├─ restart_nas.sh
│  ├─ git_pull_update.sh          # safe auto-update + restart + health-check
│  ├─ standardize_dbs.sh          # one-off: migrate legacy DB files into data/dev
│  ├─ backup_sqlite.sh            # snapshot data/dev/*.dev.db + orders.dev.json
│  ├─ start_cloudflared.sh
│  ├─ db_password_pid_alert.js
│  └─ watch-password-alerts.js
├─ data/                          # **standardized data root**
│  └─ dev/
│     ├─ wattsun.dev.db           # users DB (canonical file)
│     ├─ inventory.dev.db         # inventory DB (items/categories/messages)
│     ├─ users.dev.db             # (migrated legacy)
│     └─ orders.dev.json          # orders store (transitional)
├─ user-setup/
│  └─ users.db -> ../data/dev/wattsun.dev.db  # **symlink** for compatibility
├─ inventory.db -> data/dev/inventory.dev.db  # **symlink** (compatibility)
├─ data/users.db -> data/dev/users.dev.db     # **symlink** (compatibility)
├─ orders.json -> data/dev/orders.dev.json    # **symlink** (compatibility)
├─ logs/
│  ├─ app.out
│  ├─ app.err
│  ├─ update.log
│  ├─ cloudflared.out
│  └─ cloudflared.err
└─ run/
   ├─ app.pid
   ├─ cloudflared.pid
   └─ last_sha                     # last deployed commit
```

### Notes
- Those **symlinks** keep older code working while we gradually move all paths to env‑driven configs. You can safely keep them for now.
- The **status page** (`public/status.html`) shows green/yellow/red for API and Cloudflare tunnel and auto-refreshes every 30s.

---

## 3) Environment (.env)

Create/maintain on NAS at `/volume1/web/wattsun/.env`:

```ini
PORT=3001

# Standardized paths (optional for now – code still works with symlinks)
# DB_PATH=./data/dev/wattsun.dev.db
# DB_PATH_USERS=./data/dev/wattsun.dev.db

# Logging
LOG_LEVEL=info

# Email (optional; required to actually send contact emails)
# SMTP_HOST=
# SMTP_PORT=587
# SMTP_USER=
# SMTP_PASS=
# EMAIL_FROM="WattSun <no-reply@wattsun.co.ke>"
```

> If SMTP is not set, the contact route should still **save** messages; we can enable graceful email‑send fallback.

---

## 4) Start/stop & updates (NAS)

From `/volume1/web/wattsun`:

```bash
# Start/stop/restart the backend cleanly
scripts/start_nas.sh
scripts/stop_nas.sh
scripts/restart_nas.sh

# Pull latest from GitHub, install deps if needed, restart, health-check, log
scripts/git_pull_update.sh

# One-off: migrate legacy *.db to data/dev + create symlinks (already done)
scripts/standardize_dbs.sh
```

### Health checks
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/api/health   # 200 expected
# via Cloudflare (public)
curl -s -o /dev/null -w "%{http_code}\n" https://api.wattsun.co.ke/api/health
```

### Logs
```bash
tail -n 80 logs/app.out
tail -n 80 logs/app.err
tail -n 120 logs/update.log
```

---

## 5) Cloudflared

- Sample config: `infra/cloudflared/config.sample.yml`
- Runtime via helper:
  ```bash
  scripts/start_cloudflared.sh   # writes logs/cloudflared.* and run/cloudflared.pid
  ```
- Verify Cloudflare edge:
  ```bash
  curl -I https://api.wattsun.co.ke/api/health | egrep -i 'HTTP/|server|cf-ray|cf-cache-status'
  curl -s https://api.wattsun.co.ke/cdn-cgi/trace | egrep 'h=|colo=|warp='
  ```
- Status page (`public/status.html`) checks both API and Cloudflare; you can open `https://api.wattsun.co.ke/status.html`.

---

## 6) Git workflow (safe)

- **PC → GitHub → NAS** only.
- NAS **cannot push**:
  ```bash
  cd /volume1/web/wattsun
  git remote -v
  # origin  git@github.com:WattSunK/wattsun.git (fetch)
  # origin  DISABLED (push)
  ```
- Typical flow:
  1. Develop on PC → `git commit` → `git push` to `main`.
  2. On NAS: run `scripts/git_pull_update.sh` (manually or via scheduled task).
  3. Check `logs/update.log` and `run/last_sha` to confirm deployed commit.

- Tags: we created **`v0.2.0`** after the initial unification and scripts.

---

## 7) Backups

- Snapshot all important runtime files:
  ```bash
  scripts/backup_sqlite.sh
  # Saves to: /volume1/backups/wattsun/YYYY-MM-DD_HHMMSS/
  # Keeps last 30 snapshots
  ```

---

## 8) Common ops recipes

```bash
# Kill the currently running app by PID file (if necessary)
[ -f run/app.pid ] && kill "$(cat run/app.pid)" || true

# Verify which process owns port 3001
netstat -tlnp | grep :3001

# DB quick look
sqlite3 data/dev/wattsun.dev.db ".tables"
sqlite3 data/dev/inventory.dev.db ".tables"

# Orders debug (JSON store)
node -e "const a=require('fs').readFileSync('data/dev/orders.dev.json','utf8'); const j=JSON.parse(a); console.log('orders:', j.length)"
```

---

## 9) Known improvements (next steps)

- **Orders → SQLite**: migrate from `orders.dev.json` to tables (`orders`, `order_items`, `status_history`) with a migration script.
- **Env‑driven DB paths** everywhere (phase‑out symlinks): add `DB_PATH_USERS`, `DB_PATH_INVENTORY`, etc., in `.env` and use them in routes.
- **Auth/UI parity through Cloudflare**: ensure login UX handles API responses correctly (we verified server returns `success: true`).
- **SMTP graceful fallback** in contact route (already outlined) and `/api/admin/smtp-test` endpoint for one‑click verification.
- **Staging**: later, add `staging.wattsun.co.ke` mapping to a second PORT, if needed.

---

## 10) Quick rollback

```bash
cd /volume1/web/wattsun
scripts/stop_nas.sh
git checkout <KNOWN_GOOD_SHA_OR_TAG>
scripts/start_nas.sh
```

> `run/last_sha` shows the last deployed commit SHA written by the update script.

---

## 11) Support crib notes

- **Logs:** `/volume1/web/wattsun/logs/{app.out,app.err,update.log,cloudflared.*}`
- **Status page:** `/public/status.html`
- **Health endpoint:** `/api/health`
- **NAS cannot push:** ensures production changes only come from GitHub.

---

_This README reflects the repo at the time of the reorg and the scripts/config we deployed together on **Aug 11, 2025 (Europe/Paris)**._

## 12) Admin Dashboard — Strategy & Final Aim

This section defines how the Admin area fits into the monorepo, what we’re building now, and the target end-state.

### 12.1 Goals (what “done” looks like)
- A clean, stable Admin dashboard with:
  - **Profile, Home, Logout, Search** (core shell)
  - **Orders** (list, search, status filter, pagination, view, edit status/driver/notes)
  - **Users, Items, Dispatch, Settings** (read-only first, then targeted edits)
- Changes saved by Admin **reflect in customer views** immediately (focus or lightweight ping).
- Keep **plain HTML + modular JS**; no SPA framework right now.
- Be minimally invasive to existing pages/routes; changes are additive and reversible.

### 12.2 Scope boundaries (now vs later)
- **Now:** Admin shell restore; Orders list; Orders edit (status, driver, notes); driver directory.
- **Soon:** Merge admin updates into customer views (`GET /api/orders`), add date filter, validation, and smoke tests.
- **Later:** Broaden edits (Users/Items/Dispatch), full visual pass (optional `admin.v2.css` toggle).

### 12.3 Architecture & data model
- **DB single entry-point:** `inventory.db` is the canonical SQLite file for Admin too.
- **Overlay table for Admin changes:** `admin_order_meta`
  ```sql
  CREATE TABLE IF NOT EXISTS admin_order_meta (
    order_id   TEXT PRIMARY KEY,
    status     TEXT NOT NULL,
    driver_id  INTEGER,
    notes      TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  ```
  Rationale: we can persist Admin changes **without rewriting** any legacy orders store; we merge on read later.

### 12.4 API surface (admin)
- `GET /api/admin/users?type=Driver` → list Drivers for the dropdown.
- `PATCH /api/admin/orders/:id` → update `status`, `driverId`, `notes`; writes to `admin_order_meta`.
- Existing read endpoints (e.g., `GET /api/orders`) remain unchanged initially; later we merge overlay so customers see updated status/driver automatically.

### 12.5 Frontend structure (admin)
- Location: `/public` (served by the same Node app).
- Files:
  - `public/dashboard.html` — admin shell (sidebar + content slot)
  - `public/partials/orders.html` — Orders list partial (IDs: `#ordersTable`, `#ordersTbody`, `#ordersSearch`, `#ordersStatus`, `#ordersPager`)
  - `public/partials/orders-modal.html` — Edit modal (status/driver/notes)
  - `public/admin/js/data-adapter.js` — fetch + normalization layer
  - `public/admin/js/dashboard.js` — tiny partial loader (relative paths)
  - `public/admin/js/orders-controller.js` — Orders list (search/filter/pager/view)
  - `public/admin/js/orders-edit.js` — Edit modal + PATCH + inline row refresh
  - `public/admin/admin.css` (current look) and optional `admin.v2.css` (style pass, toggled with `?css=v2`)

**Script order** in `dashboard.html` (use cache-busters consistently):
```html
<script src="./admin/js/data-adapter.js?v=3"></script>
<script src="./admin/js/orders-controller.js?v=3" defer></script>
<script src="./admin/js/orders-edit.js?v=3" defer></script>
<script src="./admin/js/dashboard.js?v=3" defer></script>
```

### 12.6 Security & permissions
- Gate all `/api/admin/*` routes behind an Admin check:
  ```js
  function requireAdmin(req, res, next) {
    const u = req.session?.user;
    if (!u || (u.type !== "Admin" && u.role !== "Admin")) {
      return res.status(403).json({ success:false, error:"Forbidden" });
    }
    next();
  }
  app.use("/api/admin", requireAdmin);
  ```
- Backend validation:
  - `status ∈ {Pending, Processing, Delivered, Cancelled}`
  - `driverId` must reference a `users` row where `type='Driver'`.

### 12.7 Ops: NAS runtime, logs, updates
- Admin shares the same Node process and logging as the rest of the app.
- Use existing restart/update flow; commit → deploy to NAS → restart node service.
- Health checks unchanged; add a simple `GET /api/health` if not present.

### 12.8 Milestones (Phase 6)
- **6.0 Admin Core Restore** — role gate, header/sidebar, Home + Logout, partial loader; no console errors.
- **6.1 Orders List** — table with search, status filter, pagination (10/pg), mutation-safe pager.
- **6.2 View/Edit Order** — modal: status/driver/notes; save updates row inline; localStorage ping.
- **6.3 Backend Wiring** — `GET /api/admin/users?type=Driver`; `PATCH /api/admin/orders/:id`; overlay table created if missing; mounted in `server.js`.
- **6.4 Customer Reflection** — merge `admin_order_meta` on read (or re-fetch trigger) so Track/My Orders show updates.
- **6.5 Hardening** — validation messages, currency formatting edge cases, empty states, permission checks, and smoke tests.

### 12.9 Rollback & safety
- All Admin additions are **additive**; rollback by:
  - Removing route mounts (`/api/admin/*`), and
  - Removing the three admin files (`orders-edit.js`, `orders-modal.html`, overlay router).
- No schema change to legacy orders; `admin_order_meta` can remain (harmless) or be dropped later.

### 12.10 SPA decision
- No SPA for now. Plain HTML + modular JS keeps footprint small, works well on NAS, and aligns with current repo. Re-evaluate only if we outgrow this.
