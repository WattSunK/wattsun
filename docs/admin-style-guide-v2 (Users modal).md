# WattSun — Admin Style Guide (V2) — Appendix A — 2025-09-17

A.4 Users Modal — Parity with Orders
- Shell: `<dialog class="modal">` → `.modal-card` → `.modal-header` / `.modal-body` / `.modal-footer`.
- Size: `.modal-card { width: min(720px, 92vw); max-height: 90vh; display:flex; flex-direction:column; overflow:hidden }`
- Scrolling: only `.modal-body` scrolls; header/footer pinned.
- Keyboard: ESC closes; focus starts at first field.
- Buttons: Cancel/Close (left), Save (primary).
- Read-only View mode: fields disabled; Save hidden; Cancel shows “Close”.

A.5 Users Table — Orders Column
- Displays server-provided count of orders matched by email OR normalized phone digits.
- Fallback display: `0` when count missing.
