# migration-ledger.md (V7)

## Phase F – Orders Domain Refactor

- Overlay table `admin_order_meta` exists.
- Orders Edit modal integrated (status, driver, notes).
- Persistence issue: edits update inline but do not survive hard refresh.
  - Hypotheses: request not reaching backend, payload mismatch, or overlay read path not merged.
  - **Marked as Pending Task (carry forward).**

## Status
- Phase F blocked until persistence bug resolved.
- Split endpoints `/status` and `/assign-driver` confirmed NOT mounted (404). Frontend continues using legacy PATCH.
