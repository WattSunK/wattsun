> **Status Note:** Currently in Phase 6.x (Admin UI improvements). Migration phases A–G paused until after 6.5.

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
- Frontend stable tag: `stable-frontend` (commit: 0487037 ; date: 13 Aug 2025)
- Backend stable tag: `stable-backend` (commit: 0487037 ; date: 13 Aug 2025)
- Golden zip(s) location: ____  
- Quick rollback: `git reset --hard <tag>` → restart → verify smoke checklist.

---
---

## 2025-08-16 — Catalog import & image/visibility cleanup (V3)

- Seeded 8 items into `items` (SKUs: `SYS-1KW`, `SYS-3KW`, `SYS-6KW`, `SYS-9KW`, `PNL-450W`, `BAT-24V100AH`, `KIT-CLEAN`, `INV-5KW`).
- Normalized legacy `price` strings (removed `KSH ` prefix and commas → digits-only).
- Mapped categories:
  - `SYS-*` → **Solar system** (id 26)
  - `PNL-450W` → **Solar Panel** (id 29)
  - `BAT-24V100AH` → **Lithium battery** (id 31)
  - `INV-5KW` → **Inverter** (id 32)
  - Created **Accessories** category (id 36) for `KIT-CLEAN`.
- **Image strategy finalized:**
  - DB stores **filenames only** (e.g. `system-1kw.jpg`).
  - Frontend renders as `/images/products/<filename>` with fallback `placeholder.jpg`.
  - Created symlinks in `public/images/products/` so missing photos temporarily resolve to `placeholder.jpg`; two real files present: `panel-450w.jpg`, `inverter-5kw.jpg`.
- **API behavior:** `/api/items` now returns **active-only by default**; admin passes `?active=0` to include inactive.
- **Admin UI:** changed list fetch (line 28) to `/api/items?active=0` so the admin sees all items while shop stays active-only.
- **Audit:** 0 bad paths; 41 items currently have no image set (intended → placeholder used in UI).

**Next steps (tracked):**
1. Add `items.price_cents INTEGER` and backfill from `price` (KES × 100); keep `price` during transition.
2. Replace placeholder symlinks with real images as assets arrive, keeping the same filenames.
