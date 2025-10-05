# migration-ledger.md (V10) — 2025-09-14

## Phase G – Dispatch Domain (Admin)
Status: ✅ Completed (Step 5.3 Delivered + history polish)

Changes
- Added Delivered to dispatch statuses and transition map.
- History table writes on every status change.
- CSV export: GET /api/admin/dispatches/:id/history.csv.
- UI: Edit modal with History viewer, Load more, Export CSV, Mark Delivered quick action (gated to InTransit).
- Driver selection via datalist (“id — name”); removed digits-only pattern.
- Clear planned_date on unassign + revert to Created.

Fixed
- Replaced users.role usage with users.type.

QA
- Allowed: Assigned→InTransit→Delivered; Delivered↔InTransit.
- Blocked: Created→Delivered.
- History JSON/CSV/DB reflect transitions.

Artifacts
- Tag: step-5.3-delivered
- Branch: stable/step-5.3
