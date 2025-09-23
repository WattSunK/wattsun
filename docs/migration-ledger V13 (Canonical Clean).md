# WattSun Modular Monolith — Migration Ledger V13 (Canonical Clean)

This document consolidates **all prior versions (V1–V12)** into a single source of truth. 
It supersedes every earlier migration-ledger file.

## Ground Truth & Constants
- Frontends stay under `/web/wattsun/public/` and `/web/wattsun/public/admin/`.
- Backend root: `/web/wattsun/`
- Cloudflared DEV: `api.wattsun.co.ke → 127.0.0.1:3001`
- Reserved: `staging.wattsun.co.ke` (3000), `www.wattsun.co.ke` (3000)
- Golden baselines: keep rollback zips/tags.

## Phases A–G (Base Plan)
- Skeleton creation (src/core, src/domains, scripts, test, docs).
- Paper mapping of legacy → target (routes, server.js, orders.json → DB).
- Backend tidy (facade router idea).
- Frontend guardrails (relative /api/, image strategy).
- Data model prep: orders/order_items/order_status_history/notifications schema.
- Orders domain: re-export legacy routes, append-only history.
- Quality gates: health, auth loop, checkout, admin updates, track pagination, rollback, backups.

## Phase F – Orders Domain Refactor (V9)
- Overlay table `admin_order_meta` exists.
- Orders Edit modal integrated (status, driver, notes).
- Persistence issue marked pending (inline update but not on refresh).
- Split endpoints `/status` & `/assign-driver` not mounted (404); legacy PATCH in use.

## Phase G – Dispatch Domain (V10)
- Delivered added to dispatch statuses & map.
- History table writes on every change.
- CSV export: GET /api/admin/dispatches/:id/history.csv.
- UI: Edit modal with History viewer, Export CSV, Mark Delivered quick action.
- Driver selection improved; planned_date clears on unassign.
- QA validated allowed/blocked transitions.
- Artifacts: tag step-5.3-delivered; branch stable/step-5.3.

## Phase H – Users Domain (V11)
- Users list wired to SQL API with paging + filters.
- Added orders count via JOIN.
- Reusable Users modal (View/Add/Edit).
- POST/PATCH/DELETE fully integrated.
- Stub: send-reset.
- Indexes: orders email lower, phone digits.
- UI parity: ESC close, scroll lock, inline errors.
- QA verified list, filters, add/edit/delete, orders count.
- Artifacts: SQL script 2025-09-17_add_order_indexes.sql; ADR-001 V12; SSOT V11.

## Phase I – Loyalty Admin (V12)
- Added filters: Accounts (status), Ledger (kind), Notifications (status).
- Modified APIs `/api/admin/loyalty/accounts`, `/ledger`, `/notifications` to accept query params.
- Ledger patched: alias points_delta → delta_points.
- QA verified filters reset and Δ Points column.
- Artifacts: 001-api-contracts V15; Loyalty Program Log v3; SSOT V11.

## Additional Dated Notes
- **2025-08-16 (V3)**: Catalog import & image cleanup; placeholder strategy.
- **2025-09-14 (V10)**: Dispatch Delivered enhancements.
- **2025-09-17 (V11)**: User indexes SQL migration.
- **2025-09-23 (V12)**: Loyalty filters.

## Appendix A – Baselines & Rollback
- Frontend stable tag: stable-frontend (commit 0487037; date 13 Aug 2025).
- Backend stable tag: stable-backend (commit 0487037; date 13 Aug 2025).
- Golden zips: ____
- Quick rollback: git reset --hard <tag> → restart → verify smoke checklist.
