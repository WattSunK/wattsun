# ADR-001: API Contracts & Domain Ownership (V11)
**Status:** Accepted • **Date:** 2025-09-14
**Decision:** Document Dispatch admin endpoints incl. Delivered flow, history JSON & CSV.

## Principles
- **No breaking changes** to existing URLs. Shapes updated here are *additive*.
- **Errors:** { success:false, error:{ code, message } }
- **Success:** { success:true, ...payload }
- **AuthZ:** Admin endpoints require user.type === "Admin".

---

## Dispatch (Admin scope) — NEW/UPDATED

### GET /api/admin/dispatches
Query: q, status, driver_id, planned_date, page=1, per=20
Returns: list + pager; each row includes driverName, driverId alias.

### PATCH /api/admin/dispatches/:id
Body (subset): { status, driver_id (null to unassign), planned_date (YYYY-MM-DD|null), notes }
Rules:
- Statuses: Created, Assigned, InTransit, Delivered, Canceled
- Transitions:
  Created → Created|Assigned|Canceled
  Assigned → Assigned|InTransit|Canceled|Created
  InTransit → InTransit|Delivered|Canceled|Assigned|Created
  Delivered → InTransit
  Canceled → Created
- Guard: cannot enter InTransit without an assigned driver.
- History write on status change -> dispatch_status_history.

Behavior: when unassigning (driver_id=null) AND setting status=Created, server clears planned_date.

### GET /api/admin/dispatches/:id/history
Query: limit=20 (max 100). Returns { success, history: [...] } with changed_by_name/email.

### GET /api/admin/dispatches/:id/history.csv
Query: limit (default 1000, max 5000). Returns text/csv with header.

### GET /api/admin/dispatches/drivers
Query: active=1. Returns drivers (users.type='Driver').
