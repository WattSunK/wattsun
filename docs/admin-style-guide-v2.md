# WattSun — Admin Style Guide (V1) — Appendix A (2025-09-14)

A.1 Edit modal — History micro-toolbar
- Buttons: History, Load more, Export CSV, Cancel, Save, Mark Delivered.
- Mark Delivered is disabled unless the row opened as InTransit.

A.2 Table fallbacks
- Driver: “Unassigned” when null.
- Planned: “—” when empty.

A.3 CSS pager parity (scoped)
#dispatch-root .pager { display:flex; align-items:center; gap:8px; }
#dispatch-root .pager.row { justify-content:space-between; }
#dispatch-root .pager .col { display:flex; align-items:center; gap:8px; }
#dispatch-root .pager .col--right { justify-content:flex-end; margin-left:auto; }
#dispatch-root .pager .btn { height:34px; min-width:34px; border-radius:10px; }
