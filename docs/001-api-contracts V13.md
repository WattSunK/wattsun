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