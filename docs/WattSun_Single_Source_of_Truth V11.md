# WattSun — Single Source of Truth (V11) — 2025-09-17

## Admin Users
- Status: ✅ Users CRUD wired to `/api/admin/users` (GET/POST/PATCH/DELETE).
- UI: Single reusable modal (View/Add/Edit) using same `<dialog.modal>` shell as Orders; header/body/footer; body scroll only.
- Behaviors: 
  - Name click → Edit; View button → read-only mode (fields disabled; Save hidden).
  - Optional password reset request via POST `/api/admin/users/:id/send-reset`.
- Data:
  - `orders` count added per user (server-side): match by email (case-insensitive) OR phone normalized to digits-only, `07.. → 2547..`.
- Performance:
  - New indexes on `orders`: `idx_orders_email_lower`, `idx_orders_phone_digits`.

## Admin Dispatch
(unchanged from V10)
