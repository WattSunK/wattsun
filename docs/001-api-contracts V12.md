# ADR-001: API Contracts & Domain Ownership (V12)
**Status:** Accepted • **Date:** 2025-09-17
**Decision:** Users Admin endpoints wired to SQL API; non-breaking, additive changes.

## Principles
- No breaking URL changes. Shapes updated are *additive*.
- Errors: `{ success:false, error:{ code, message } }`
- Success: `{ success:true, ...payload }`
- AuthZ: Admin endpoints require `user.type === "Admin"`.

---

## Users (Admin scope) — NEW/UPDATED

### GET /api/admin/users
Query: `page=1`, `per=10`, `q` (name/email/phone), `type`, `status`  
Returns: `{ success, page, per, total, users:[...] }`

Each user row now MAY include:
```json
{
  "id": 1, "name": "…", "email": "…", "phone": "…",
  "type":"Admin|Driver|Customer|User", "status":"Active|Inactive",
  "createdAt":"YYYY-MM-DD HH:MM:SS",
  "orders": 3   // count of orders matched by email OR normalized phone
}
```
Notes:
- `orders` is computed server-side using a LEFT JOIN on `orders`:
  - Email match is case-insensitive
  - Phone match uses digits-only normalization; `07…` → `2547…`
- When `orders` is absent it SHOULD default to `0` on the client.

### POST /api/admin/users
Body: `{ name, email, phone, type, status }`  
Returns: full user row incl. `id`, `createdAt`, `updatedAt`.

### PATCH /api/admin/users/:id
Body: only changed fields.  
Returns: updated row incl. `updatedAt`.

### DELETE /api/admin/users/:id
Returns: `{ success:true, deleted:1, id }` (or 204).

### POST /api/admin/users/:id/send-reset
Best-effort endpoint to trigger a password reset email. Current implementation may be a no-op stub returning `{ success:true }`.

---

## Dispatch (Admin scope)
(unchanged from V11)
