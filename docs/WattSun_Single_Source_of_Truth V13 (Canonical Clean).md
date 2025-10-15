# WattSun — Single Source of Truth (SSOT) V13 (Canonical Clean)

**Status:** Living • **Date:** 2025-09-23  
**Supersedes:** All prior SSOT versions (docx + md, V1–V12)

---

## Purpose & Scope
The Single Source of Truth (SSOT) defines the **canonical reference** for WattSun system design.  
It consolidates repo structure, domains, APIs, admin styling, migration plans, and operations into one document.  
This V13 replaces **all prior versions** and is the authoritative baseline.

---

## Repo & Folder Structure
- **Backend Root:** `/web/wattsun/`
  - `routes/` — legacy Express routes (backward-compat maintained)
  - `src/core/` — planned bootstrap & middleware
  - `src/domains/{auth, users, catalog, cart, orders, tracking, notifications, loyalty}` — domain folders (target)
  - `src/db/{migrations,seeds}/`
  - `scripts/` — maintenance, migration, backup, health, loyalty accrual
  - `test/` — placeholder for automated tests
  - `docs/` — ADRs, roadmap, style guides
  - `public/` — frontend
    - `index.html` & site pages
    - `admin/` → dashboard, admin.css, admin-skin.js
    - `partials/` → admin partials (orders, items, users, dispatch, loyalty, settings, etc.)
    - `images/` → site visuals
    - `images/products/` → product photos

---

## Core Domains & APIs
- **Contracts:** See **API Contracts V16 (Canonical Clean)**.  
- Principles: no breaking changes, consistent cents-based monetary fields, stable URLs.  
- Domains: Auth, Users, Catalog, Cart, Orders, Tracking, Admin, Notifications, Loyalty.  
- API references: `/api/...` for customers/admins; relative paths for frontend.

---

## Admin Dashboard & Style
- **Canonical style:** See **Admin Style Guide V3 (Canonical Clean)**.  
- Global skin: `public/admin/admin.css` only.  
- Admin shell: `dashboard.html` with sidebar → System Status, Profile, Orders, Items, Users, Dispatch, Settings, Loyalty.  
- Patterns: card-based layout, `.input`/`.form-group` for forms, `.dash-cards` for grids, unified modals.

---

## Migration & Ops
- **Canonical migration record:** See **Migration Ledger V13 (Canonical Clean)**.  
- Phases A–I:
  - A–E: skeleton, mapping, tidy, guardrails, data prep  
  - F: Orders domain refactor  
  - G: Dispatch domain delivered + history  
  - H: Users CRUD & indexes  
  - I: Loyalty Admin filters  
- Ops hygiene: `/api/health`, auth loop, checkout, rollback via tags, DB backups.

---

## Scripts & Scheduling
- **NAS Ops:** `scripts/start_nas.sh`, `scripts/stop_nas.sh`, `scripts/restart_nas.sh`  
- **Loyalty:** `scripts/loyalty_daily_accrual.js`, `scripts/loyalty_weekly_digest.js`  
- **Maintenance:** `scripts/backup_sqlite.sh`, `scripts/import-orders.md`, `scripts/health.md`  
- Scheduling: pm2/DSM Task Scheduler planned for recurring jobs.  
- Rollback: git reset to stable tags (see Migration Ledger Appendix A).

---

## Roadmap Alignment
- **Phase 6.x Admin UI:** Orders reflection, dispatch, settings, users modal parity.  
- **Phase 7+:** Checkout redirect, thank-you consistency, admin ops polish, customer sync.  
- **Loyalty:** Daily accrual, weekly digest, penalties, program settings.  
- **Ops:** Monitoring, log rotation, QA checklists.  
- **Future:** DB consolidation, staging/prod cutover, rate limiting, CI/CD.

---

## References & Cross-links
- **API Contracts:** V16 (Clean)  
- **Migration Ledger:** V13 (Clean)  
- **Admin Style Guide:** V3 (Clean)  
- **Loyalty Program:** V4 (Canonical)  

---

## Changelog
- **Docx lineage (V4–V9):** Base repo structure, ops scripts, site layout.  
- **V10–V12 (Markdown):** Shift to text-based SSOT, aligned with API Contracts.  
- **V11:** Cross-link to Migration Ledger + Admin Style Guide.  
- **V12:** Added Loyalty Program alignment.  
- **V13 (this):** Clean consolidation, supersedes all, cross-links to canonical docs.

### 2025-10-15 — Auth Stability Baseline (auth-stable-2025-10-15)

- Verified unified signup/login routes across DEV (3001) and QA (3000)
- Added hardened startup scripts: `start_dev.sh`, `start_qa.sh`
- Introduced automated verification scripts: `verify_dev_auth.sh`, `verify_qa_auth.sh`
- Both environments passed all verification tests ✅
- Created branch: `post-auth-hardening` for continued development
- Tag: `auth-stable-2025-10-15` — rollback point for authentication module stability
