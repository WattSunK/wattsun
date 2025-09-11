# WattSun — Conversation Roadmap

This roadmap tracks the incremental SQL-only migration and admin UI rebuild.  
Each task is handled in its own conversation, with tags before/after for rollback.  
Every task follows the same rule:  
(A) Establish state of affairs  
(B) Rewrite to SQL-only & prune JSON  
(C) Deliver full files per module

---

## Task 0 — Admin Shell & Skin
**Status:** ✅ Completed  
- Single CSS skin in `/public/admin/admin.css`.  
- Standardized `dashboard.html` shell.  
- Partials emit `admin:partial-loaded`.  
- Tag: `admin-sql-Task0-shell-YYYYMMDD`.

---

## Task 1 — Orders (SQL-only migration)
**Status:** ✅ Completed (with pendings)  
- Orders list, view, and edit migrated to SQL.  
- JSON overlay mostly retired.  
- Deliverables (`routes/admin-orders.js`, `orders-controller.js`, `orders-edit.js`, `partials/orders.html`) rewritten.  

**Pending:**  
- Finalize overlay cleanup (retire legacy JSON paths completely).  
- Ensure Add Order modal loads correctly.

---

## Task 2 — Users (SQL-only migration)
**Status:** ✅ Completed (with pendings)  
- Users partial verified against SQL-only.  
- Legacy JSON reads removed.  
- Deliverables (`routes/admin-users.js`, `users-controller.js`, `partials/users.html`) updated.  

**Pending:**  
- UI normalization (filters, layout polish).  
- 🔔 Users partial styling/polish will be addressed in the **UI cleanup phase after Task 3–8 SQL migrations** are complete.

---

## Task 3 — Dispatch (SQL-only migration)
**Status:** 🟩 Next  
- Goal: Implement Dispatches in SQL, create/assign/update status, link to Orders.  
- Deliverables: `routes/admin-dispatch.js`, dispatch JS controller/edit, `partials/dispatch.html`.  
- **Definition of Done:**  
  - Dispatch list loads from SQL.  
  - Create/assign/patch functional.  
  - Delivered status updates Orders + history.  
  - Legacy JSON removed.  
- Tag to be created: `admin-sql-Task3-dispatch-YYYYMMDD`.

---

## Task 4 — Items (SQL-only migration)
**Status:** 🟨 Upcoming  
- Migrate items list, edit, categories to SQL.  
- Remove legacy JSON.

---

## Task 5 — Settings (SQL-only migration)
**Status:** 🟨 Upcoming  
- Company info, notifications, integrations in SQL.  
- Remove legacy JSON.

---

## Task 6 — System Status (SQL-only migration)
**Status:** 🟨 Upcoming  
- Populate system-status from SQL and server APIs.  
- Remove dummy JSON.

---

## Task 7 — Reports (SQL-only migration)
**Status:** 🟨 Upcoming  
- Implement reports partial against SQL.  
- Remove legacy JSON.

---

## Task 8 — Final Cleanup & UI polish
**Status:** 🟦 Later  
- Normalize all admin partials (Orders, Users, Dispatch, Items, Settings).  
- Apply consistent UI/UX: filters, layout, pagination, modals.  
- Resolve known pendings (Orders Add modal, Users filters, modal styling).  
- Retire any remaining JSON artifacts.  
- Final tag: `admin-sql-Task8-complete-YYYYMMDD`.

---

## Known Issues (to be addressed in Task 8)
- **Orders Add Modal** — button dispatches but modal not loading; injection path unresolved.  
- **Modal Styling** — View, Edit, and Add order modals not yet visually aligned with Admin theme.  
- **Users Partial UI** — filters and layout need polish; deferred to Task 8.  
