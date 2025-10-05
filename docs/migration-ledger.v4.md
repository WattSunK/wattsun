# WattSun Modular Monolith — Migration Ledger
**Status:** Draft • **Date:** 2025-08-11 • **Author:** MK & team  
**Goal:** Reorganize backend internally (domains) with *zero* disruption to current Cloudflared, NAS, and Git setup.  
**Non-goals now:** No staging/prod cut-over yet; no endpoint changes; no code moves for frontends.

---

## Ground Truth (do not change)
- Frontends stay where they are:
  - Customer site: `/web/wattsun/public/`
  - Admin UI: `/web/wattsun/public/admin/` (path-based under same origin)
- Backend root stays: `/web/wattsun/`
- Cloudflared hostnames/ports (current):
  - `api.wattsun.co.ke` → `http://127.0.0.1:3001` (DEV API sandbox)
  - *(reserved)* `staging.wattsun.co.ke` → `http://127.0.0.1:3000`
  - *(reserved)* `www.wattsun.co.ke` → `http://127.0.0.1:3000`
- Golden baselines: keep existing zips/tags as rollback points.

---

## Legend
- [ ] Not started  •  [~] In progress  •  [x] Done  •  ⏭️ Planned / blocked by a later phase

---

## Phase A — Create the skeleton (no behavior change)
- [ ] Add backend structure under `/web/wattsun/`:
  - [ ] `src/core/` (bootstrap/middleware placeholders)
  - [ ] `src/domains/{auth,users,catalog,cart,orders,tracking,notifications}/` (empty READMEs)
  - [ ] `src/db/{migrations,seeds}/` (placeholders)
  - [ ] `scripts/` (placeholders: `import-orders.md`, `backup.md`, `health.md`)
  - [ ] `test/` (placeholder)
  - [ ] `docs/adr/` (see ADR-001 below)
- [ ] Record current stable tags/zips in **Appendix A** of this file.

**Owner:** ____ • **Target date:** ____  

---

## Phase B — Paper mapping & lifecycles (design only)
- [ ] Map legacy → target (no code yet):
  - `server.js` → remains; later imports from `src/core/*`
  - `routes/*.js` → `src/domains/*` (see table below)
  - `orders.json` → **DB tables** (import later)
- [ ] Define **Order Status Lifecycle** (single source of truth):  
  `Pending → Confirmed → Dispatched → Delivered → Closed/Cancelled`
- [ ] Approve ADR-001 (API contracts & owners).

**Owner:** ____ • **Target date:** ____  

---

## Phase C — Backend internal tidy (no endpoint change)
- [ ] Create empty domain routers/services (no wiring yet).
- [ ] Keep all existing routes live under `routes/`.
- [ ] Document “facade router” approach for a later seamless mount.

**Owner:** ____ • **Target date:** ____  

---

## Phase D — Frontend guardrails (no visual change)
- [ ] Confirm all browser calls use **relative** `/api/...` (same-origin ready).
- [ ] Confirm image strategy is followed:
  - Site visuals → `/public/images/`
  - Product photos → `/public/images/products/`

**Owner:** ____ • **Target date:** ____  

---

## Phase E — Data model prep (execute later with staging)
*(Write only; don’t run yet)*
- [ ] Schema doc for:
  - `orders`, `order_items`, `order_status_history`, `notifications`
- [ ] Import plan **orders.json → DB**:
  - [ ] Field mapping table
  - [ ] Verification checklist (counts, spot checks)
  - [ ] Rollback plan (keep read-only copy of `orders.json`)
- [ ] Decide per-env DB file locations (dev/staging/prod folders).

**Owner:** ____ • **Target date:** ____  

---

## Phase F — First real move = **Orders domain** (when ready)
- [ ] Copy logic into `src/domains/orders/` (controller/service/dao structure).
- [ ] Re-export via legacy route so URLs remain unchanged.
- [ ] Append-only `order_status_history` on every admin status update.
- [ ] Document manual test steps (admin update → visible in customer Track/My Orders).

**Owner:** ____ • **Target date:** ____  

---

## Phase G — Quality gates & ops hygiene (lightweight)
- [ ] Smoke checklist in `docs/`:
  - `/api/health` green
  - Auth loop (signup→login→/users/me)
  - Checkout creates order (dev DB)
  - Admin can update status; history row appended
  - Track lists up to 5 with pagination
- [ ] Rollback note: `git reset --hard <stable-tag>` + restart service
- [ ] Daily DB backup note (where, how long retained)

**Owner:** ____ • **Target date:** ____  

---

## Legacy → Target Mapping Table
| Legacy path                          | Target domain folder                      | Notes |
|---|---|---|
| `routes/login.js`, `routes/auth.js` | `src/domains/auth/`                       | Keep response shape stable (see ADR-001) |
| `routes/users.js`                   | `src/domains/users/`                      | `/users/me` profile read/update |
| `routes/items.js` / `routes/catalog.js` | `src/domains/catalog/`                 | Products/categories; price in cents |
| `routes/cart.js` / checkout bits    | `src/domains/cart/`                       | Server-side totals & deposit |
| `routes/orders.js`                  | `src/domains/orders/`                     | Admin ops, status updates, items |
| `routes/track.js`                   | `src/domains/tracking/`                   | Public tracking (phone + optional status) |
| (mailer utils)                      | `src/domains/notifications/`              | Email now; SMS later |

---

## Appendix A — Baselines & Rollback
- Frontend stable tag: `stable-frontend` (commit: ____ ; date: ____)
- Backend stable tag: `stable-backend` (commit: ____ ; date: ____)
- Golden zip(s) location: ____  
- Quick rollback: `git reset --hard <tag>` → restart → verify smoke checklist.

---

## Step 6.8 — Dashboard Completion

**Why now:** Orders (6.4) is the frozen source of truth. Completing the dashboard unblocks day-to-day ops without backend refactor risk.

**Work Items:**
1) Dispatch (admin)
   - DB delta: orders add `driver_id` (nullable FK), `dispatch_status` (enum), `dispatch_note` (text), `updated_by`.
   - UI: list/unassigned/assign driver, set status: Queued | OutForDelivery | Delivered | Failed.
   - API: GET/PUT `/api/admin/dispatch...`
   - Test: assign/unassign persists; Orders table reflects immediately.

2) Settings (admin)
   - New table: `settings (key UNIQUE, value TEXT/JSON, updated_by, updated_at)`
   - UI: company info, currency, deposit %, email template placeholders.
   - API: GET/PUT `/api/admin/settings`
   - Test: change persists, RBAC admin-only.

3) MyOrders (customer)
   - Use `/api/my/orders` (alias of track with auth filter).
   - UI: pagination + status/date filters; currency formatting.
   - Test: only own orders visible; filters & paging OK.

4) Profile (customer)
   - UI: read current user; edit name/phone; email/password with confirmation.
   - API: GET/PUT `/api/profile/me`
   - Test: updates persist; validation & error UX.

**Redirect Policy (final):**
- Deprecate `checkoutRedirect` (localStorage). Single source of truth = URL `?login=1&next=/path` + sessionStorage tab hint.
- Validate `next` with site-relative regex, clean it after redirect.

**QA Checklist:**
- Incognito + normal: login→redirect to `/checkout.html`.
- RBAC: customers blocked from admin endpoints; drivers limited scope.
- Migrations idempotent; safe defaults for existing rows.
