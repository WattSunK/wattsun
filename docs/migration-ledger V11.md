# migration-ledger.md (V11) — 2025-09-17

## Phase H – Users (Admin) — Task 2.1
Status: ✅ Completed

Changes
- Users list wired to SQL API (GET `/api/admin/users`) with server-side paging + filters (`q`, `type`, `status`).
- Added per-user `orders` count via LEFT JOIN on orders using (email OR normalized phone digits).
- Introduced single reusable Users modal (View/Add/Edit) reusing admin theme (`<dialog.modal>`).
- POST `/api/admin/users`, PATCH `/api/admin/users/:id`, DELETE `/api/admin/users/:id` fully integrated.
- Added stub: POST `/api/admin/users/:id/send-reset` (returns `{success:true}`).

Indexes (performance)
- `idx_orders_email_lower` on `orders(LOWER(email))`.
- `idx_orders_phone_digits` on `orders(REPLACE(...digits-only...))`.

UI
- Users modal: ESC to close, scroll locked background, form error inline for email, read-only View mode.
- “Orders” column displays server-provided count.
- Filters and pagination retain client-side fallback; pager mirrors Orders/Dispatch styling.

QA
- Verified list render after navigation, filters, per-page, and deletion (optimistic + revert on failure).
- Verified Add/Edit (POST/PATCH) with modal and automatic list refresh.
- Verified Orders count for users with matching email/phone in `orders` table.

Artifacts
- SQL: `scripts/sql/2025-09-17_add_order_indexes.sql`
- Docs: ADR-001 V12; SSOT V11; Style Guide V2 (Users modal parity).
