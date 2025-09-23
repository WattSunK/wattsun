# 001-api-contracts – V16 (Superset Canonical)

This version consolidates **all prior versions (V1–V15)** into a single source of truth. 
It includes every relevant section: Principles, Auth, Users, Catalog, Cart, Orders, Tracking, Notifications, Admin, Loyalty.
Earlier drafts are appended below for historical continuity; the **canonical structure** should follow the topmost normalized sections.



---
# Source: 001-api-contracts V10.md

# ADR-001: API Contracts & Domain Ownership
**Status:** Proposed • **Date:** 2025-08-11  
**Decision:** Standardize endpoint shapes and ownership per domain to reduce regressions and enable gradual refactor without changing URLs.

---

## Principles
- **No breaking changes now.** Existing routes continue to work; this ADR documents the contract.
- **Same-origin frontends.** Customer and Admin call relative `/api/...` endpoints.
- **Consistent shapes.** Monetary values in `priceCents/totalCents/depositCents` (integers).
- **Errors:** `{ success:false, error:{ code, message } }`
- **Success:** `{ success:true, ...payload }`

---

## Auth (Domain: `auth`)
- `POST /api/auth/signup`  
  **Body:** `{ fullName, email, phone, password }`  
  **Returns:** `{ success, user:{ id, fullName, email, phone, type }, message }`  
  **Notes:**  
  - Current implementation returns `user.type` (values: `Admin | Customer | Driver | …`).  
  - Planned migration will rename this to `user.role`.  

- `POST /api/auth/login`  
  **Body:** `{ emailOrPhone, password }`  
  **Returns:** `{ success, user:{...}, message }`

- `POST /api/auth/reset` (request link/code)  
  **Body:** `{ emailOrPhone }` → `{ success, message }`

- `POST /api/auth/reset/confirm`  
  **Body:** `{ tokenOrCode, newPassword }` → `{ success, message }`

---

## Users (Domain: `users`)
- `GET /api/users/me` → `{ success, user:{ id, fullName, email, phone, type, createdAt } }`  
  *(type = legacy field, same meaning as role)*

- `PUT /api/users/me`  
  **Body:** editable profile fields (email/phone typically non-editable by user)  
  → `{ success, user:{...} }`

- (Later) Audit: password/profile changes appended to `users_audit`.

---

## Catalog (Domain: `catalog`)
- `GET /api/items`  
  **Query:** optional filters later  
  **Returns:** `{ success, items:[ { id, sku, name, description, priceCents, categoryId, image, active } ] }`

- `GET /api/categories`  
  → `{ success, categories:[ { id, name, image, active } ] }`

---

## Cart & Checkout (Domain: `cart`)
- `POST /api/cart/checkout`  
  **Body (example minimal):**
  ```
  {
    "items": [ { "productId": "p1", "qty": 2 } ],
    "customer": { "fullName", "email", "phone" },
    "notes": "optional"
  }
  ```
  **Returns:**
  ```
  {
    "success": true,
    "order": {
      "id": "...",
      "orderNumber": "...",
      "totalCents": 123456,
      "depositCents": 12000,
      "createdAt": "..."
    },
    "message": "Order created"
  }
  ```

---

## Orders (Customer scope) (Domain: `orders`)
- `GET /api/orders`  
  **Query:** `phone`, `page=1`, `per=5`  
  **Returns:** `{ success, page, per, total, orders:[ { id, orderNumber, status, totalCents, createdAt } ] }`

*(Note: Customer view overlaps with tracking but may include more details when logged in.)*

---

## Tracking (Public) (Domain: `tracking`)
- `GET /api/track`  
  **Query:** `phone` (required), `status` (optional), `page=1`, `per=5`  
  **Returns:**
  ```
  {
    "success": true,
    "page": 1,
    "per": 5,
    "total": 12,
    "orders": [
      {
        "orderNumber": "...",
        "status": "Pending",
        "createdAt": "2025-07-20T12:00:00Z",
        "totalCents": 76500
      }
    ]
  }
  ```

---

## Admin Orders (Admin scope) (Domain: `orders`)
- `GET /api/admin/orders`  
  **Query (optional):** `q`, `status`, `page=1`, `per=10`, `from`, `to`  
  **Returns:** `{ success, page, per, total, orders:[ { id, orderNumber, fullName, phone, email, status, totalCents, createdAt } ] }`

- `PUT /api/admin/orders/:id/status`  
  **Body:** `{ status, note }`  
  **Returns:** `{ success, order:{ id, orderNumber, status }, history:{ id, status, changedBy, changedAt, note } }`  
  **Rule:** Append to `order_status_history` on every change.

- `PUT /api/admin/orders/:id/assign-driver`  
  **Body:** `{ driverUserId }` → `{ success, order:{ id, orderNumber, driverUserId } }`  
  **Note:** `driverUserId` must exist and have type=`Driver`.

---

## Notifications (Domain: `notifications`)
- (Internal) `POST /api/internal/notify`  
  **Body:** `{ channel:"email", template:"order_status_changed", to, payload }`  
  **Returns:** `{ success }`  
  **Later:** Store send attempts in `notifications` with status.

---

## Status & Enumerations (shared)
- **Order statuses:** `Pending | Confirmed | Dispatched | Delivered | Closed | Cancelled`
- **Roles/Types:** `Customer | Admin | Driver | Installer | Manufacturer` (extendable)  
  *(Current implementation uses `type`; target is `role`.)*
- **Pagination defaults:** Customer/Tracking `per=5`; Admin `per=10`.

---

## Security & AuthZ (summary)
- Admin endpoints require `user.type === "Admin"` (current ground truth).  
- Planned migration: unify to `user.role === "Admin"`.  
- Customer endpoints read-only where unauthenticated (Tracking), richer data when logged in.  
- Current frontends use `wattsunUser` in localStorage to drive UI; backend enforces roles via middleware.

---

## Consequences
- Clear “owners” per domain reduce accidental regressions.
- Numeric money types end price formatting issues.
- Document now matches current DB reality (`user.type`), while noting migration path to `user.role`.




---
# Source: 001-api-contracts V11.md

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




---
# Source: 001-api-contracts V12.md

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




---
# Source: 001-api-contracts V13.md

# 001-api-contracts – v13 (includes Loyalty)

## Loyalty Routes

### GET /api/admin/loyalty/program
Returns current program config.

### PUT /api/admin/loyalty/program
Updates settings like duration, minimum withdrawal, eligibility.

### PATCH /api/admin/loyalty/accounts/:id/status
Sets status = Active / Paused / Closed

### POST /api/admin/loyalty/penalties
Admin-applied penalty → creates `-1` ledger row

### POST /api/loyalty/withdraw
Customer triggers withdrawal request

### GET /api/loyalty/ledger
Returns loyalty ledger for logged in user



---
# Source: 001-api-contracts V14.md

# 001-api-contracts – v13 (includes Loyalty)

## Loyalty Routes

### GET /api/admin/loyalty/program
Returns current program config.

### PUT /api/admin/loyalty/program
Updates settings like duration, minimum withdrawal, eligibility.

### PATCH /api/admin/loyalty/accounts/:id/status
Sets status = Active / Paused / Closed

### POST /api/admin/loyalty/penalties
Admin-applied penalty → creates `-1` ledger row

### POST /api/loyalty/withdraw
Customer triggers withdrawal request

### GET /api/loyalty/ledger
Returns loyalty ledger for logged in user



---
# Source: 001-api-contracts V15.md

# 001 API Contracts — V15 — 2025-09-23

### GET /api/admin/loyalty/accounts
Returns all loyalty accounts.  
Supports optional filter:
- `status=Active|Paused|Closed`

### GET /api/admin/loyalty/ledger
Returns all ledger rows.  
Supports optional filter:
- `kind=Earn|Penalty|Withdraw|Deposit`  
Response includes:
- `delta_points` (alias of `points_delta`).

### GET /api/admin/loyalty/notifications
Returns notifications.  
Supports optional filter:
- `status=Sent|Failed|Pending`




---
# Source: 001-api-contracts V9.md

# 001-api-contracts.md (V7)

## Admin Orders API

- **Legacy Route (active, used by frontend)**
  - PATCH /api/admin/orders/:id
  - Body: { status, note, driverId }
  - Alternative fallback: { status, notes, driver_id }

- **Split Routes (planned / optional, not mounted in current env)**
  - PUT /api/admin/orders/:id/status { status, note }
  - PUT /api/admin/orders/:id/assign-driver { driverUserId }

> Note: As of V7, the frontend (`orders-edit.js`) uses PATCH-first strategy with split-route fallback.




---
# Source: 001-api-contracts v6.md

# ADR-001: API Contracts & Domain Ownership
**Status:** Proposed • **Date:** 2025-08-11  
**Decision:** Standardize endpoint shapes and ownership per domain to reduce regressions and enable gradual refactor without changing URLs.

---

## Principles
- **No breaking changes now.** Existing routes continue to work; this ADR documents the contract.
- **Same-origin frontends.** Customer and Admin call relative `/api/...` endpoints.
- **Consistent shapes.** Monetary values in `priceCents/totalCents/depositCents` (integers).
- **Errors:** `{ success:false, error:{ code, message } }`
- **Success:** `{ success:true, ...payload }`

---

## Auth (Domain: `auth`)
- `POST /api/auth/signup`  
  **Body:** `{ fullName, email, phone, password }`  
  **Returns:** `{ success, user:{ id, fullName, email, phone, role }, message }`  
  **Notes:** Frontend stores session object as `wattsunUser` in localStorage (source of truth for UI).

- `POST /api/auth/login`  
  **Body:** `{ emailOrPhone, password }`  
  **Returns:** `{ success, user:{...}, message }`

- `POST /api/auth/reset` (request link/code)  
  **Body:** `{ emailOrPhone }` → `{ success, message }`

- `POST /api/auth/reset/confirm`  
  **Body:** `{ tokenOrCode, newPassword }` → `{ success, message }`

---

## Users (Domain: `users`)
- `GET /api/users/me` → `{ success, user:{ id, fullName, email, phone, role, createdAt } }`
- `PUT /api/users/me`  
  **Body:** editable profile fields (email/phone typically non-editable by user)  
  → `{ success, user:{...} }`
- (Later) Audit: password/profile changes appended to `users_audit`.

---

## Catalog (Domain: `catalog`)
- `GET /api/items`  
  **Query:** optional filters later  
  **Returns:** `{ success, items:[ { id, sku, name, description, priceCents, categoryId, image, active } ] }`

- `GET /api/categories`  
  → `{ success, categories:[ { id, name, image, active } ] }`

---

## Cart & Checkout (Domain: `cart`)
- `POST /api/cart/checkout`  
  **Body (example minimal):**
  ```
  {
    "items": [ { "productId": "p1", "qty": 2 } ],
    "customer": { "fullName", "email", "phone" },
    "notes": "optional"
  }
  ```
  **Returns:**
  ```
  {
    "success": true,
    "order": {
      "id": "...",
      "orderNumber": "...",
      "totalCents": 123456,
      "depositCents": 12000,
      "createdAt": "..."
    },
    "message": "Order created"
  }
  ```

---

## Orders (Customer scope) (Domain: `orders`)
- `GET /api/orders`  
  **Query:** `phone`, `page=1`, `per=5`  
  **Returns:** `{ success, page, per, total, orders:[ { id, orderNumber, status, totalCents, createdAt } ] }`

*(Note: Customer view overlaps with tracking but may include more details when logged in.)*

---

## Tracking (Public) (Domain: `tracking`)
- `GET /api/track`  
  **Query:** `phone` (required), `status` (optional), `page=1`, `per=5`  
  **Returns:**
  ```
  {
    "success": true,
    "page": 1,
    "per": 5,
    "total": 12,
    "orders": [
      {
        "orderNumber": "...",
        "status": "Pending",
        "createdAt": "2025-07-20T12:00:00Z",
        "totalCents": 76500
      }
    ]
  }
  ```

---

## Admin Orders (Admin scope) (Domain: `orders`)
- `GET /api/admin/orders`  
  **Query (optional):** `q`, `status`, `page=1`, `per=10`, `from`, `to`  
  **Returns:** `{ success, page, per, total, orders:[ { id, orderNumber, fullName, phone, email, status, totalCents, createdAt } ] }`

- `PUT /api/admin/orders/:id/status`  
  **Body:** `{ status, note }`  
  **Returns:** `{ success, order:{ id, orderNumber, status }, history:{ id, status, changedBy, changedAt, note } }`  
  **Rule:** Append to `order_status_history` on every change.

- `PUT /api/admin/orders/:id/assign-driver`  
  **Body:** `{ driverUserId }` → `{ success, order:{ id, orderNumber, driverUserId } }`  
  **Note:** `driverUserId` must exist and have role `Driver`.

---

## Notifications (Domain: `notifications`)
- (Internal) `POST /api/internal/notify`  
  **Body:** `{ channel:"email", template:"order_status_changed", to, payload }`  
  **Returns:** `{ success }`  
  **Later:** Store send attempts in `notifications` with status.

---

## Status & Enumerations (shared)
- **Order statuses:** `Pending | Confirmed | Dispatched | Delivered | Closed | Cancelled`
- **Roles:** `Customer | Admin | Driver | Installer | Manufacturer` (extendable)
- **Pagination defaults:** Customer/Tracking `per=5`; Admin `per=10`.

---

## Security & AuthZ (summary)
- Admin endpoints require role `Admin`.  
- Customer endpoints read-only where unauthenticated (Tracking), richer data when logged in.  
- Current frontends use `wattsunUser` in localStorage to drive UI; backend to enforce roles via middleware (implementation timing TBD).

---

## Consequences
- Clear “owners” per domain reduce accidental regressions.
- Numeric money types end price formatting issues.
- A stable contract lets us refactor code behind the same URLs.

---




---
# Source: 001-api-contracts v7.md

# ADR-001: API Contracts & Domain Ownership
**Status:** Proposed • **Date:** 2025-08-11  
**Decision:** Standardize endpoint shapes and ownership per domain to reduce regressions and enable gradual refactor without changing URLs.

---

## Principles
- **No breaking changes now.** Existing routes continue to work; this ADR documents the contract.
- **Same-origin frontends.** Customer and Admin call relative `/api/...` endpoints.
- **Consistent shapes.** Monetary values in `priceCents/totalCents/depositCents` (integers).
- **Errors:** `{ success:false, error:{ code, message } }`
- **Success:** `{ success:true, ...payload }`

---

## Auth (Domain: `auth`)
- `POST /api/auth/signup`  
  **Body:** `{ fullName, email, phone, password }`  
  **Returns:** `{ success, user:{ id, fullName, email, phone, role }, message }`  
  **Notes:** Frontend stores session object as `wattsunUser` in localStorage (source of truth for UI).

- `POST /api/auth/login`  
  **Body:** `{ emailOrPhone, password }`  
  **Returns:** `{ success, user:{...}, message }`

- `POST /api/auth/reset` (request link/code)  
  **Body:** `{ emailOrPhone }` → `{ success, message }`

- `POST /api/auth/reset/confirm`  
  **Body:** `{ tokenOrCode, newPassword }` → `{ success, message }`

---

## Users (Domain: `users`)
- `GET /api/users/me` → `{ success, user:{ id, fullName, email, phone, role, createdAt } }`
- `PUT /api/users/me`  
  **Body:** editable profile fields (email/phone typically non-editable by user)  
  → `{ success, user:{...} }`
- (Later) Audit: password/profile changes appended to `users_audit`.

---

## Catalog (Domain: `catalog`)
- `GET /api/items`  
  **Query:** optional filters later  
  **Returns:** `{ success, items:[ { id, sku, name, description, priceCents, categoryId, image, active } ] }`

- `GET /api/categories`  
  → `{ success, categories:[ { id, name, image, active } ] }`

---

## Cart & Checkout (Domain: `cart`)
- `POST /api/cart/checkout`  
  **Body (example minimal):**
  ```
  {
    "items": [ { "productId": "p1", "qty": 2 } ],
    "customer": { "fullName", "email", "phone" },
    "notes": "optional"
  }
  ```
  **Returns:**
  ```
  {
    "success": true,
    "order": {
      "id": "...",
      "orderNumber": "...",
      "totalCents": 123456,
      "depositCents": 12000,
      "createdAt": "..."
    },
    "message": "Order created"
  }
  ```

---

## Orders (Customer scope) (Domain: `orders`)
- `GET /api/orders`  
  **Query:** `phone`, `page=1`, `per=5`  
  **Returns:** `{ success, page, per, total, orders:[ { id, orderNumber, status, totalCents, createdAt } ] }`

*(Note: Customer view overlaps with tracking but may include more details when logged in.)*

---

## Tracking (Public) (Domain: `tracking`)
- `GET /api/track`  
  **Query:** `phone` (required), `status` (optional), `page=1`, `per=5`  
  **Returns:**
  ```
  {
    "success": true,
    "page": 1,
    "per": 5,
    "total": 12,
    "orders": [
      {
        "orderNumber": "...",
        "status": "Pending",
        "createdAt": "2025-07-20T12:00:00Z",
        "totalCents": 76500
      }
    ]
  }
  ```

---

## Admin Orders (Admin scope) (Domain: `orders`)
- `GET /api/admin/orders`  
  **Query (optional):** `q`, `status`, `page=1`, `per=10`, `from`, `to`  
  **Returns:** `{ success, page, per, total, orders:[ { id, orderNumber, fullName, phone, email, status, totalCents, createdAt } ] }`

- `PUT /api/admin/orders/:id/status`  
  **Body:** `{ status, note }`  
  **Returns:** `{ success, order:{ id, orderNumber, status }, history:{ id, status, changedBy, changedAt, note } }`  
  **Rule:** Append to `order_status_history` on every change.

- `PUT /api/admin/orders/:id/assign-driver`  
  **Body:** `{ driverUserId }` → `{ success, order:{ id, orderNumber, driverUserId } }`  
  **Note:** `driverUserId` must exist and have role `Driver`.

---

## Notifications (Domain: `notifications`)
- (Internal) `POST /api/internal/notify`  
  **Body:** `{ channel:"email", template:"order_status_changed", to, payload }`  
  **Returns:** `{ success }`  
  **Later:** Store send attempts in `notifications` with status.

---

## Status & Enumerations (shared)
- **Order statuses:** `Pending | Confirmed | Dispatched | Delivered | Closed | Cancelled`
- **Roles:** `Customer | Admin | Driver | Installer | Manufacturer` (extendable)
- **Pagination defaults:** Customer/Tracking `per=5`; Admin `per=10`.

---

## Security & AuthZ (summary)
- Admin endpoints require role `Admin`.  
- Customer endpoints read-only where unauthenticated (Tracking), richer data when logged in.  
- Current frontends use `wattsunUser` in localStorage to drive UI; backend to enforce roles via middleware (implementation timing TBD).

---

## Consequences
- Clear “owners” per domain reduce accidental regressions.
- Numeric money types end price formatting issues.
- A stable contract lets us refactor code behind the same URLs.

---




---
# Source: 001-api-contracts-V3.md

# ADR-001: API Contracts & Domain Ownership V3
**Status:** Proposed • **Date:** 2025-08-11  
**Decision:** Standardize endpoint shapes and ownership per domain to reduce regressions and enable gradual refactor without changing URLs.

---

## Principles
- **No breaking changes now.** Existing routes continue to work; this ADR documents the contract.
- **Same-origin frontends.** Customer and Admin call relative `/api/...` endpoints.
- **Consistent shapes.** Monetary values in `priceCents/totalCents/depositCents` (integers).
- **Current exception:** Items API still returns `price` as a KES **string** until the `price_cents` migration lands.
- **Errors:** `{ success:false, error:{ code, message } }`
- **Success:** `{ success:true, ...payload }`

---

## Auth (Domain: `auth`)
- `POST /api/auth/signup`  
  **Body:** `{ fullName, email, phone, password }`  
  **Returns:** `{ success, user:{ id, fullName, email, phone, role }, message }`  
  **Notes:** Frontend stores session object as `wattsunUser` in localStorage (source of truth for UI).

- `POST /api/auth/login`  
  **Body:** `{ emailOrPhone, password }`  
  **Returns:** `{ success, user:{...}, message }`

- `POST /api/auth/reset` (request link/code)  
  **Body:** `{ emailOrPhone }` → `{ success, message }`

- `POST /api/auth/reset/confirm`  
  **Body:** `{ tokenOrCode, newPassword }` → `{ success, message }`

---

## Users (Domain: `users`)
- `GET /api/users/me` → `{ success, user:{ id, fullName, email, phone, role, createdAt } }`
- `PUT /api/users/me`  
  **Body:** editable profile fields (email/phone typically non-editable by user)  
  → `{ success, user:{...} }`
- (Later) Audit: password/profile changes appended to `users_audit`.

---

## Catalog (Domain: `catalog`)

### GET /api/items
**Default behavior:** returns **only active** items (for storefront).

**Query params**
- `active` (optional): include inactive items when set to `0`, `false`, or `all`.
  - Examples:
    - Shop: `GET /api/items` → active-only
    - Admin: `GET /api/items?active=0` → active + inactive

**Response fields (current)**
- `sku` (string)
- `name` (string)
- `description` (string)
- `price` (string): KES digits only (e.g. `"47000"`). *Legacy for now.*
- `warranty` (string|null)
- `stock` (integer)
- `image` (string|null): **filename only**, e.g. `"panel-450w.jpg"`. Frontends should render as `/images/products/<filename>`. If `image` is null/empty, clients should show `/images/products/placeholder.jpg`.
- `active` (0/1)
- `category` (string): category name

**Planned (non‑breaking)**
- Add `price_cents INTEGER` alongside `price` and backfill from KES × 100. Clients can adopt `price_cents` over time; `price` remains until cutover.

## Cart & Checkout (Domain: `cart`)
- `POST /api/cart/checkout`  
  **Body (example minimal):**
  ```
  {
    "items": [ { "productId": "p1", "qty": 2 } ],
    "customer": { "fullName", "email", "phone" },
    "notes": "optional"
  }
  ```
  **Returns:**
  ```
  {
    "success": true,
    "order": {
      "id": "...",
      "orderNumber": "...",
      "totalCents": 123456,
      "depositCents": 12000,
      "createdAt": "..."
    },
    "message": "Order created"
  }
  ```

---

## Orders (Customer scope) (Domain: `orders`)
- `GET /api/orders`  
  **Query:** `phone`, `page=1`, `per=5`  
  **Returns:** `{ success, page, per, total, orders:[ { id, orderNumber, status, totalCents, createdAt } ] }`

*(Note: Customer view overlaps with tracking but may include more details when logged in.)*

---

## Tracking (Public) (Domain: `tracking`)
- `GET /api/track`  
  **Query:** `phone` (required), `status` (optional), `page=1`, `per=5`  
  **Returns:**
  ```
  {
    "success": true,
    "page": 1,
    "per": 5,
    "total": 12,
    "orders": [
      {
        "orderNumber": "...",
        "status": "Pending",
        "createdAt": "2025-07-20T12:00:00Z",
        "totalCents": 76500
      }
    ]
  }
  ```

---

## Admin Orders (Admin scope) (Domain: `orders`)
- `GET /api/admin/orders`  
  **Query (optional):** `q`, `status`, `page=1`, `per=10`, `from`, `to`  
  **Returns:** `{ success, page, per, total, orders:[ { id, orderNumber, fullName, phone, email, status, totalCents, createdAt } ] }`

- `PUT /api/admin/orders/:id/status`  
  **Body:** `{ status, note }`  
  **Returns:** `{ success, order:{ id, orderNumber, status }, history:{ id, status, changedBy, changedAt, note } }`  
  **Rule:** Append to `order_status_history` on every change.

- `PUT /api/admin/orders/:id/assign-driver`  
  **Body:** `{ driverUserId }` → `{ success, order:{ id, orderNumber, driverUserId } }`  
  **Note:** `driverUserId` must exist and have role `Driver`.

---

## Notifications (Domain: `notifications`)
- (Internal) `POST /api/internal/notify`  
  **Body:** `{ channel:"email", template:"order_status_changed", to, payload }`  
  **Returns:** `{ success }`  
  **Later:** Store send attempts in `notifications` with status.

---

## Status & Enumerations (shared)
- **Order statuses:** `Pending | Confirmed | Dispatched | Delivered | Closed | Cancelled`
- **Roles:** `Customer | Admin | Driver | Installer | Manufacturer` (extendable)
- **Pagination defaults:** Customer/Tracking `per=5`; Admin `per=10`.

---

## Security & AuthZ (summary)
- Admin endpoints require role `Admin`.  
- Customer endpoints read-only where unauthenticated (Tracking), richer data when logged in.  
- Current frontends use `wattsunUser` in localStorage to drive UI; backend to enforce roles via middleware (implementation timing TBD).

---

## Consequences
- Clear “owners” per domain reduce accidental regressions.
- Numeric money types end price formatting issues.
- A stable contract lets us refactor code behind the same URLs.

---



---
# Source: 001-api-contracts.md

# ADR-001: API Contracts & Domain Ownership
**Status:** Proposed • **Date:** 2025-08-11  
**Decision:** Standardize endpoint shapes and ownership per domain to reduce regressions and enable gradual refactor without changing URLs.

---

## Principles
- **No breaking changes now.** Existing routes continue to work; this ADR documents the contract.
- **Same-origin frontends.** Customer and Admin call relative `/api/...` endpoints.
- **Consistent shapes.** Monetary values in `priceCents/totalCents/depositCents` (integers).
- **Errors:** `{ success:false, error:{ code, message } }`
- **Success:** `{ success:true, ...payload }`

---

## Auth (Domain: `auth`)
- `POST /api/auth/signup`  
  **Body:** `{ fullName, email, phone, password }`  
  **Returns:** `{ success, user:{ id, fullName, email, phone, role }, message }`  
  **Notes:** Frontend stores session object as `wattsunUser` in localStorage (source of truth for UI).

- `POST /api/auth/login`  
  **Body:** `{ emailOrPhone, password }`  
  **Returns:** `{ success, user:{...}, message }`

- `POST /api/auth/reset` (request link/code)  
  **Body:** `{ emailOrPhone }` → `{ success, message }`

- `POST /api/auth/reset/confirm`  
  **Body:** `{ tokenOrCode, newPassword }` → `{ success, message }`

---

## Users (Domain: `users`)
- `GET /api/users/me` → `{ success, user:{ id, fullName, email, phone, role, createdAt } }`
- `PUT /api/users/me`  
  **Body:** editable profile fields (email/phone typically non-editable by user)  
  → `{ success, user:{...} }`
- (Later) Audit: password/profile changes appended to `users_audit`.

---

## Catalog (Domain: `catalog`)
- `GET /api/items`  
  **Query:** optional filters later  
  **Returns:** `{ success, items:[ { id, sku, name, description, priceCents, categoryId, image, active } ] }`

- `GET /api/categories`  
  → `{ success, categories:[ { id, name, image, active } ] }`

---

## Cart & Checkout (Domain: `cart`)
- `POST /api/cart/checkout`  
  **Body (example minimal):**
  ```
  {
    "items": [ { "productId": "p1", "qty": 2 } ],
    "customer": { "fullName", "email", "phone" },
    "notes": "optional"
  }
  ```
  **Returns:**
  ```
  {
    "success": true,
    "order": {
      "id": "...",
      "orderNumber": "...",
      "totalCents": 123456,
      "depositCents": 12000,
      "createdAt": "..."
    },
    "message": "Order created"
  }
  ```

---

## Orders (Customer scope) (Domain: `orders`)
- `GET /api/orders`  
  **Query:** `phone`, `page=1`, `per=5`  
  **Returns:** `{ success, page, per, total, orders:[ { id, orderNumber, status, totalCents, createdAt } ] }`

*(Note: Customer view overlaps with tracking but may include more details when logged in.)*

---

## Tracking (Public) (Domain: `tracking`)
- `GET /api/track`  
  **Query:** `phone` (required), `status` (optional), `page=1`, `per=5`  
  **Returns:**
  ```
  {
    "success": true,
    "page": 1,
    "per": 5,
    "total": 12,
    "orders": [
      {
        "orderNumber": "...",
        "status": "Pending",
        "createdAt": "2025-07-20T12:00:00Z",
        "totalCents": 76500
      }
    ]
  }
  ```

---

## Admin Orders (Admin scope) (Domain: `orders`)
- `GET /api/admin/orders`  
  **Query (optional):** `q`, `status`, `page=1`, `per=10`, `from`, `to`  
  **Returns:** `{ success, page, per, total, orders:[ { id, orderNumber, fullName, phone, email, status, totalCents, createdAt } ] }`

- `PUT /api/admin/orders/:id/status`  
  **Body:** `{ status, note }`  
  **Returns:** `{ success, order:{ id, orderNumber, status }, history:{ id, status, changedBy, changedAt, note } }`  
  **Rule:** Append to `order_status_history` on every change.

- `PUT /api/admin/orders/:id/assign-driver`  
  **Body:** `{ driverUserId }` → `{ success, order:{ id, orderNumber, driverUserId } }`  
  **Note:** `driverUserId` must exist and have role `Driver`.

---

## Notifications (Domain: `notifications`)
- (Internal) `POST /api/internal/notify`  
  **Body:** `{ channel:"email", template:"order_status_changed", to, payload }`  
  **Returns:** `{ success }`  
  **Later:** Store send attempts in `notifications` with status.

---

## Status & Enumerations (shared)
- **Order statuses:** `Pending | Confirmed | Dispatched | Delivered | Closed | Cancelled`
- **Roles:** `Customer | Admin | Driver | Installer | Manufacturer` (extendable)
- **Pagination defaults:** Customer/Tracking `per=5`; Admin `per=10`.

---

## Security & AuthZ (summary)
- Admin endpoints require role `Admin`.  
- Customer endpoints read-only where unauthenticated (Tracking), richer data when logged in.  
- Current frontends use `wattsunUser` in localStorage to drive UI; backend to enforce roles via middleware (implementation timing TBD).

---

## Consequences
- Clear “owners” per domain reduce accidental regressions.
- Numeric money types end price formatting issues.
- A stable contract lets us refactor code behind the same URLs.

---




---
# Source: 001-api-contracts.v4.md

# ADR-001: API Contracts & Domain Ownership
**Status:** Proposed • **Date:** 2025-08-11  
**Decision:** Standardize endpoint shapes and ownership per domain to reduce regressions and enable gradual refactor without changing URLs.

---

## Principles
- **No breaking changes now.** Existing routes continue to work; this ADR documents the contract.
- **Same-origin frontends.** Customer and Admin call relative `/api/...` endpoints.
- **Consistent shapes.** Monetary values in `priceCents/totalCents/depositCents` (integers).
- **Errors:** `{ success:false, error:{ code, message } }`
- **Success:** `{ success:true, ...payload }`

---

## Auth (Domain: `auth`)
- `POST /api/auth/signup`  
  **Body:** `{ fullName, email, phone, password }`  
  **Returns:** `{ success, user:{ id, fullName, email, phone, role }, message }`  
  **Notes:** Frontend stores session object as `wattsunUser` in localStorage (source of truth for UI).

- `POST /api/auth/login`  
  **Body:** `{ emailOrPhone, password }`  
  **Returns:** `{ success, user:{...}, message }`

- `POST /api/auth/reset` (request link/code)  
  **Body:** `{ emailOrPhone }` → `{ success, message }`

- `POST /api/auth/reset/confirm`  
  **Body:** `{ tokenOrCode, newPassword }` → `{ success, message }`

---

## Users (Domain: `users`)
- `GET /api/users/me` → `{ success, user:{ id, fullName, email, phone, role, createdAt } }`
- `PUT /api/users/me`  
  **Body:** editable profile fields (email/phone typically non-editable by user)  
  → `{ success, user:{...} }`
- (Later) Audit: password/profile changes appended to `users_audit`.

---

## Catalog (Domain: `catalog`)
- `GET /api/items`  
  **Query:** optional filters later  
  **Returns:** `{ success, items:[ { id, sku, name, description, priceCents, categoryId, image, active } ] }`

- `GET /api/categories`  
  → `{ success, categories:[ { id, name, image, active } ] }`

---

## Cart & Checkout (Domain: `cart`)
- `POST /api/cart/checkout`  
  **Body (example minimal):**
  ```
  {
    "items": [ { "productId": "p1", "qty": 2 } ],
    "customer": { "fullName", "email", "phone" },
    "notes": "optional"
  }
  ```
  **Returns:**
  ```
  {
    "success": true,
    "order": {
      "id": "...",
      "orderNumber": "...",
      "totalCents": 123456,
      "depositCents": 12000,
      "createdAt": "..."
    },
    "message": "Order created"
  }
  ```

---

## Orders (Customer scope) (Domain: `orders`)
- `GET /api/orders`  
  **Query:** `phone`, `page=1`, `per=5`  
  **Returns:** `{ success, page, per, total, orders:[ { id, orderNumber, status, totalCents, createdAt } ] }`

*(Note: Customer view overlaps with tracking but may include more details when logged in.)*

---

## Tracking (Public) (Domain: `tracking`)
- `GET /api/track`  
  **Query:** `phone` (required), `status` (optional), `page=1`, `per=5`  
  **Returns:**
  ```
  {
    "success": true,
    "page": 1,
    "per": 5,
    "total": 12,
    "orders": [
      {
        "orderNumber": "...",
        "status": "Pending",
        "createdAt": "2025-07-20T12:00:00Z",
        "totalCents": 76500
      }
    ]
  }
  ```

---

## Admin Orders (Admin scope) (Domain: `orders`)
- `GET /api/admin/orders`  
  **Query (optional):** `q`, `status`, `page=1`, `per=10`, `from`, `to`  
  **Returns:** `{ success, page, per, total, orders:[ { id, orderNumber, fullName, phone, email, status, totalCents, createdAt } ] }`

- `PUT /api/admin/orders/:id/status`  
  **Body:** `{ status, note }`  
  **Returns:** `{ success, order:{ id, orderNumber, status }, history:{ id, status, changedBy, changedAt, note } }`  
  **Rule:** Append to `order_status_history` on every change.

- `PUT /api/admin/orders/:id/assign-driver`  
  **Body:** `{ driverUserId }` → `{ success, order:{ id, orderNumber, driverUserId } }`  
  **Note:** `driverUserId` must exist and have role `Driver`.

---

## Notifications (Domain: `notifications`)
- (Internal) `POST /api/internal/notify`  
  **Body:** `{ channel:"email", template:"order_status_changed", to, payload }`  
  **Returns:** `{ success }`  
  **Later:** Store send attempts in `notifications` with status.

---

## Status & Enumerations (shared)
- **Order statuses:** `Pending | Confirmed | Dispatched | Delivered | Closed | Cancelled`
- **Roles:** `Customer | Admin | Driver | Installer | Manufacturer` (extendable)
- **Pagination defaults:** Customer/Tracking `per=5`; Admin `per=10`.

---

## Security & AuthZ (summary)
- Admin endpoints require role `Admin`.  
- Customer endpoints read-only where unauthenticated (Tracking), richer data when logged in.  
- Current frontends use `wattsunUser` in localStorage to drive UI; backend to enforce roles via middleware (implementation timing TBD).

---

## Consequences
- Clear “owners” per domain reduce accidental regressions.
- Numeric money types end price formatting issues.
- A stable contract lets us refactor code behind the same URLs.

---

### Step 6.8 — Dashboard Completion (Dispatch, Settings, MyOrders, Profile)

**Scope:** Wire up remaining dashboard tabs with minimal APIs and clear RBAC.

**RBAC (summary):**
- Admin: full read/write on Dispatch & Settings; read on Users & Orders.
- Driver: read assigned orders (limited), update dispatch status/note.
- Customer: read own orders (MyOrders), update own profile (limited).
- Staff: similar to Admin but no Settings writes (config-protected).

**API Stubs:**
- `GET /api/admin/dispatch?status=&driver_id=` → list orders with dispatch metadata.
- `PUT /api/admin/dispatch/:orderId` → body { driver_id?, dispatch_status?, note? }.
- `GET /api/admin/settings` → key–value map of settings.
- `PUT /api/admin/settings` → upsert key–value entries (admin-only).
- `GET /api/profile/me` → current user profile (from session/wattsunUser).
- `PUT /api/profile/me` → update allowed fields (name, phone, email*, password*).
- `GET /api/my/orders?page=&status=&from=&to=` → customer’s orders (paginated).

**Validation & Security:**
- Validate all inputs; enforce site-relative redirects (`^/[A-Za-z0-9._\-/?#=&]*$`).
- Audit fields: `updated_by`, `updated_at` on admin mutations.

