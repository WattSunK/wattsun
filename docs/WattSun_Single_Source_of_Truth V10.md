# WattSun — Single Source of Truth (V10) — 2025-09-14

Admin Dispatch — Step 5.3
- Statuses: Created, Assigned, InTransit, Delivered, Canceled.
- Rules: InTransit requires driver; Delivered only from InTransit; Delivered→InTransit allowed.
- History: dispatch_status_history on every status change.
- APIs: list, patch, history (JSON & CSV), drivers list.
- UI: Edit modal, datalist, history (load more, CSV), Mark Delivered (guarded).

Operational markers
- Tag: step-5.3-delivered
- Branch: stable/step-5.3
