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
