# WattSun — Conversation Roadmap V12 (Canonical Clean)

**Status:** Living • **Date:** 2025-09-23  
**Supersedes:** Roadmap base + Rev A + Rev A++ (V11.09 lineage)  
**Note:** This file is now **git-tracked** as the single canonical roadmap.

---

## Principles
- Roadmap = conversation-based increments.  
- Each task handled in its own conversation, with before/after tags for rollback.  
- All migrations aim for **SQL-only** backend, no legacy JSON.  
- Every task follows rule:  
  1. Establish state of affairs  
  2. Rewrite to SQL-only & prune JSON  
  3. Deliver full files per module

---

## Task 0 — Admin Shell & Skin
**Status:** ✅ Completed  
- Single CSS skin: `/public/admin/admin.css`  
- Standardized shell: `dashboard.html`  
- Partials emit `admin:partial-loaded`  
- Tag: `admin-sql-Task0-shell-YYYYMMDD`

---

## Task 1 — Orders (SQL-only migration)
**Status:** ✅ Completed (with pendings)  
- Orders list, view, edit → SQL  
- Legacy JSON overlay mostly retired  
- Deliverables updated: `routes/admin-orders.js`, `orders-controller.js`, `orders-edit.js`, `partials/orders.html`  

**Pending:**  
- Final overlay cleanup (retire JSON completely)  
- Ensure Add Order modal loads

---

## Task 2 — Users (SQL-only migration)
**Status:** ✅ Completed (with pendings)  
- Users partial verified SQL-only  
- Legacy JSON removed  
- Deliverables updated: `routes/admin-users.js`, `users-controller.js`, `partials/users.html`  

**Rev A++ Enhancements (2025-09-17):**  
- ✅ Users partial mounts deterministically  
- ✅ List wired to SQL API; no legacy JSON  
- ✅ Filters/pager in sync with graceful fallback  
- ✅ Single reusable Users modal (View/Add/Edit) with Orders-style shell  
- ✅ Orders count per user (email/phone match)  
- ✅ Performance indexes added: email_lower + phone_digits  

**Pending:**  
- UI normalization (filters, layout polish)  
- 🔔 Styling/polish deferred to Task 8

---

## Task 3 — Dispatch (SQL-only migration)
**Status:** ✅ Step 5.3 Delivered (Rev A, 2025-09-14)  
- Dispatch list wired to SQL  
- Drivers datalist + modal Edit flow  
- Delivered status with inline history write  
- History viewer (Load more, CSV export)  
- Tag: `step-5.3-delivered` • Branch: `stable/step-5.3`  

**Next candidates:**  
- 5.4: `delivered_at` timestamp + table column  
- 5.5: Filters for Delivered + date ranges  
- 5.6: Lock edits after Delivered

**Definition of Done:**  
- Dispatch create/assign/patch functional  
- Delivered status updates Orders + history  
- Legacy JSON removed

---

## Task 4 — Items (SQL-only migration)
**Status:** 🟨 Upcoming  
- Migrate items list, edit, categories to SQL  
- Remove legacy JSON

---

## Task 5 — Settings (SQL-only migration)
**Status:** 🟨 Upcoming  
- Company info, notifications, integrations in SQL  
- Remove legacy JSON

---

## Task 6 — System Status (SQL-only migration)
**Status:** 🟨 Upcoming  
- Populate system-status from SQL + server APIs  
- Remove dummy JSON

---

## Task 7 — Reports (SQL-only migration)
**Status:** 🟨 Upcoming  
- Implement reports partial against SQL  
- Remove legacy JSON

---

## Task 8 — Final Cleanup & UI polish
**Status:** 🟦 Later  
- Normalize all partials (Orders, Users, Dispatch, Items, Settings)  
- Apply consistent UI/UX (filters, layout, pagination, modals)  
- Resolve known pendings (Orders Add modal, Users filters, modal styling)  
- Retire any JSON remnants  
- Final tag: `admin-sql-Task8-complete-YYYYMMDD`

---

## Known Issues (carry forward to Task 8)
- **Orders Add Modal** — dispatches but modal not loading  
- **Modal Styling** — View/Edit/Add modals not aligned with theme  
- **Users Partial UI** — filters/layout polish pending

---

## Cross-links
- **API Contracts:** V16 (Canonical Clean)  
- **Migration Ledger:** V13 (Canonical Clean)  
- **Admin Style Guide:** V3 (Canonical Clean)  
- **SSOT:** V13 (Canonical Clean)  
- **Loyalty Program:** V4 (Canonical Clean)

---

## Changelog
- **Base V11.09:** Tasks 0–8 defined; Orders/Users/Dispatch migration plan  
- **Rev A (2025-09-14):** Dispatch Step 5.3 Delivered flow, drivers datalist, history viewer  
- **Rev A++ (2025-09-17):** Users partial wired SQL-only; modal parity; orders count; indexes  
- **V12 (2025-09-23):** Clean consolidation, supersedes all prior roadmap files; cross-linked to canonical docs

