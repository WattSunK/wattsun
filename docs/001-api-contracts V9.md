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
