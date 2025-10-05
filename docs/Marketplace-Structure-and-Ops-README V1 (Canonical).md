# Tenant–Landlord Marketplace — Structure & Ops V1 (Canonical)

**Status:** Living • **Date:** 2025-09-30  
**Supersedes:** Seed docs only (this is the canonical Structure & Ops for Marketplace)

---

## 1) Purpose & Scope
This document defines the **canonical reference** for repository structure, runtime operations, databases, admin roadmap, and ops practices for the **Tenant–Landlord Marketplace**.  
It aligns with:
- **FRD_Tenant_Landlord_Marketplace_Complete_v0.2.docx** (Single Source of Truth)
- **FRD_Illustrated_vFinal** (UI walkthroughs & figures)

This project is **independent from WattSun** (separate repo/DB/ports/roadmap) while adopting the **WattSun Reuse Pack** conventions (runtime, admin CSS, ADR-001 API envelope, auth/session, overlay+history, image structure, ops + Cloudflare/health).

---

## 2) Repository Layout

```
marketplace/
├─ server.js
├─ package.json
├─ package-lock.json
├─ .gitignore
├─ .gitattributes
├─ .env.example
├─ docs/                        # canonical docs (FRD, ADRs, Structure & Ops, Roadmap)
│  ├─ FRD_Tenant_Landlord_Marketplace_Complete_v0.2.docx
│  ├─ FRD_Illustrated_vFinal.docx
│  ├─ ADR-001_API_Conventions.md
│  ├─ ADR-002_Auth_and_Session.md
│  ├─ ADR-003_Overlay_and_History.md
│  └─ ADR-004_Payments_P1.md
├─ public/                      # frontend (site + admin)
│  ├─ index.html
│  ├─ admin/                    # admin UI partials/pages (single-skin admin.css)
│  ├─ myaccount/                # tenant/landlord self-service
│  ├─ images/
│  ├─ images/properties/        # property & unit photos
│  ├─ js/
│  └─ css/
├─ routes/                      # Express routes (REST under /api/*)
├─ scripts/                     # ops helpers (NAS + maintenance + migrations + backups)
│  ├─ start.sh
│  ├─ stop.sh
│  ├─ update.sh
│  ├─ status.sh
│  ├─ backup_sqlite.sh
│  ├─ migrate.sh
│  └─ late_fees_nightly.js      # example job (P1)
├─ data/                        # canonical data root
│  ├─ dev/                      # dev DBs & storage
│  │  └─ marketplace.dev.db
│  ├─ uat/                      # staging DBs & storage (alias: stg)
│  │  └─ marketplace.uat.db
│  └─ prod/
│     └─ marketplace.prod.db
├─ logs/
│  ├─ app.out
│  ├─ app.err
│  └─ update.log
└─ run/                         # PIDs, last SHA, etc.
   ├─ app.pid
   └─ last_sha
```

**Conventions**
- Single admin theme **admin.css** (light + golden) across all admin views.
- Cache-busting via `?v=YYYYMMDDhhmm` on static assets.
- Same-origin fetch only; SSR for sensitive views.
- ADRs live under `/docs/` and are referenced from this README and the FRD.

---

## 3) Runtime & Process

- **Node:** 20.x (Synology-friendly).  
- **Ports (configurable via `.env`):**
  - API: **3101**
  - Admin static (optional): **3102**
- **Health:** `GET /api/health` (returns `{ ok, uptime, checks: { db, storage } }`).  
- **Cloudflare Tunnel:** per env (dev optional; stg/prod required).

**`.env` (example)**
```
PORT=3101
ADMIN_STATIC_PORT=3102
NODE_ENV=development
DB_PATH=data/dev/marketplace.dev.db
SESSION_SECRET=change_me
CF_TUNNEL=disabled
PDF_ENGINE=puppeteer
```

---

## 4) Databases & Data Model (Dev/UAT: SQLite; Prod: path to Postgres)

**Pattern:** Overlay + History for auditability and safe schema evolution.

- **Core tables (seed):** users, landlords, tenants, properties, units, unit_images, applications, leases, invoices, payments, tickets, notifications_queue
- **Overlay tables:** e.g., `lease_overlay (lease_id, current_rent_cents, currency, updated_at)`
- **History tables:** e.g., `lease_status_history`, `ticket_history`, `payment_refunds`, `invoice_status_history`

**Migrations**
- SQL files under `/scripts/sql/`, tracked in `migration-ledger.md`.
- Idempotent DDL, indexes, backfills as needed.
- Apply via `scripts/migrate.sh` (includes a DB sanity probe).

---

## 5) Payments (P1 Canonical Ops)

Per FRD (P1 is mandatory): **Split payments, Auto-pay, Refunds, Automated late fees**.

- **Split payments:** One invoice can be settled by multiple payment rows (allocation per charge line).
- **Auto-pay:** Opt-in per tenant/lease; scheduled charges on due date; retries; consent records.
- **Refunds:** Partial/full refunds; link to original payment; audit who/when/why; balance correction entries.
- **Automated late fees:** Configurable grace/fixed/percent/caps; nightly job posts penalties with reversal on waiver.
- **Reconciliation:** Import bank statements; auto-match by ref/amount/date/payer; unassigned queue.
- **Receipts:** Email/SMS receipts; server-generated PDFs via signed URLs.

---

## 6) Diagnostic & Admin Endpoints (seed)

```
GET  /api/health                          # health, uptime, basic DB/storage checks
GET  /api/admin/_diag/ping                # simple OK
GET  /api/admin/_diag/db                  # sqliteVersion, paths, counts
```

**Auth (seed)**
```
POST /api/login          { email, password }
POST /api/signup         { name, email, phone?, password }
POST /api/reset-request  { email }
POST /api/reset-confirm  { token, password }
```

---

## 7) Security & Privacy (Paramount)

- Role-based middleware (`requireAuth`, `requireRole`).
- Short-lived, secure cookies (HttpOnly, Secure, SameSite).
- **Minimize browser-readable business logic** for sensitive flows (prefer SSR).
- No secrets/PII in localStorage; avoid exposing IDs that aren’t needed client-side.
- Signed URLs for PDFs/images with expiry; watermark sensitive documents.
- Audit trail: who/when/what/before/after for admin/finance actions.
- Backups encrypted at rest; quarterly restore drills.

---

## 8) Admin UI Delivery

- Single-skin **admin.css** (light + golden) with consistent buttons and status chips.
- Partials: Dashboard, Properties, Tenants, Applications, Leases, Financials, Utilities, Maintenance, Reports, Settings.
- Filter bar in a single row; table actions aligned right; modals (Add/Edit/View).
- Cache-bust assets with `?v=`; avoid inline secrets; same-origin fetch.

---

## 9) Environments & Promotion (dev → uat/stg → prod)

- **dev:** local Synology/PC (Cloudflare optional).
- **uat (stg):** `stg` alias; Cloudflare enforced; staging DB path `data/uat/marketplace.uat.db`.
- **prod:** hardened env; backups & stricter policies.

**Promotion checklist (excerpt)**
- Tag build (e.g., `marketplace-v1.0.0`); update `CHANGELOG.md`.
- Apply migrations; verify counts.
- Canary tests pass for critical flows (auth, properties, payments P1).
- Rollback plan validated (previous tag + DB restore procedure).

---

## 10) Ops & Scripts (Synology)

- `scripts/start.sh` → loads `.env`, starts `server.js` via `nohup` or Task Scheduler
- `scripts/stop.sh`  → graceful shutdown by PID
- `scripts/update.sh`→ `git pull`, `npm i`, run migrations, restart, log to `logs/update.log`
- `scripts/status.sh`→ prints PIDs, ports, DB paths, `/api/health`, overlay counts
- `scripts/backup_sqlite.sh` → timestamped DB dumps with retention
- `scripts/migrate.sh` → apply `/scripts/sql/*.sql` idempotently

---

## 11) Admin Roadmap (Ops-Facing Sprints)

- **Sprint 0 – Repo & Runtime:** repo skeleton, start/stop/update, health, backups, admin theme scaffold.  
- **Sprint 1 – Properties & Units:** CRUD + images + listings basics, audit hooks.  
- **Sprint 2 – Tenants & Leases:** onboarding, tenant CRUD, lease lifecycle + history.  
- **Sprint 3 – Invoices & Payments (P1):** auto-invoice, **split payments**, **auto-pay**, **refunds**, **late fees**, receipts.  
- **Sprint 4 – Utilities & Maintenance:** utilities bulk upload & validate; maintenance tickets + history.  
- **Sprint 5 – Financials & Reports:** statements, arrears, income vs expenses, exports.  
- **Sprint 6 – Notifications & Messaging:** queue + templates, email baseline, SMS optional.  
- **Sprint 7 – Reconciliation & Unassigned:** bank import, auto-match, exceptions workflow.  
- **Sprint 8 – Admin Billing:** platform fees for landlords/managers; billing and audit.  
- **Sprint 9 – Mobile Readiness:** API hardening, signed links, role-adaptive endpoints.  
- **Sprint 10 – Security Hardening:** CSRF, headers, rate limits, audit deepening.  
- **Sprint 11 – UAT → Prod:** staging readiness checklist, DR drills, go-live runbook.  
- **Sprint 12 – Postgres Path:** design & pilot migration plan, performance profiling.  

---

## 12) Known Gaps / Next Steps (initial)

- No repo skeleton yet; scripts not created.  
- Health endpoint not implemented.  
- Payments P1 jobs (auto-pay/late fees) not scheduled.  
- UAT (stg) environment not provisioned.  

---

## 13) Quick Commands (seed)

```bash
# Health (once implemented)
curl -fsS http://127.0.0.1:3101/api/health | jq .

# Example install/update flow
npm ci
bash scripts/migrate.sh
nohup node server.js > logs/app.out 2> logs/app.err & echo $! > run/app.pid
```

---

## 14) Rollback & Safety

- Always tag before deploy; `git reset --hard <tag>` to roll back.
- Keep encrypted DB backups with retention; verify restore quarterly.
- Overlay tables are additive; history tables are append-only.

---

## 15) Changelog

- **V1 (today):** First canonical Structure & Ops for Marketplace, aligned with FRD v0.2 and Illustrated FRD.
