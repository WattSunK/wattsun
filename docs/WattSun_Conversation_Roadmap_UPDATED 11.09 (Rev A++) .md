# WattSun — Conversation Roadmap (Rev A++) — 2025-09-17

Task 2.1 — Users UI Wiring (Admin Dashboard)
- ✅ Users partial mounts deterministically.
- ✅ List wired to SQL API; no legacy JSON.
- ✅ Filters/pager in sync (server-side) with graceful client fallback.
- ✅ Single reusable Users modal (View/Add/Edit) with Orders-style shell.
- ✅ Orders count per user (email/phone match).
- ✅ Indexes added for performance.

Next candidates:
- Server-side search normalization for phone (digits-only) on `q` query param (optional; UI already functional).
- Soft-delete vs delete (label & behavior), if required by policy.
