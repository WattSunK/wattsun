# WattSun — Admin Style Guide V3 (Canonical Clean)

**Status:** Living • **Date:** 2025-09-23  
**Supersedes:** V1, V2, and earlier drafts

---

## Purpose
Keep the admin backend consistent, maintainable, and easy to extend.  
This guide defines our **global skin**, **page structure**, and **coding conventions** for all admin partials.

---

## Core Principles
1. **Single source of styling**
   - All global styles live in `public/admin/admin.css`.
   - Partials contain HTML structure only (cards, inputs, markup).
   - Use scoped styles in partials only for unique UI (e.g., API status dots, profile avatar, Danger Zone).

2. **Reusable building blocks**
   - **Cards:** `section.card > .card-header + .card-body`.
   - **Grid:** `.dash-cards` for responsive multi-card layouts.
   - **Form groups:** `.form-group` wraps `<label>` + field.
   - **Inputs:** `.input` class for all text/select/textarea.

3. **Global form rules (admin.css)**
   - `.input` sets border, padding, radius, focus ring, `width:100%`, `box-sizing:border-box`.
   - `.input { max-width: 480px; }` default; adjust per page if needed.
   - `.form-group` controls rhythm: `gap:4px; margin-bottom:12px;`.

4. **Partial loader**
   - `public/dashboard.html` + `admin-skin.js` load partials into `#partialHost`.
   - Nav links use `data-partial` + `data-url`.
   - Fire `admin:partial-loaded` on mount if needed.

5. **Cache busting**
   - When updating `admin.css` or loader JS, bump query token in shell:
     ```html
     <link rel="stylesheet" href="/admin/admin.css?v=YYYYMMDD-XX">
     ```
   - Hard refresh (Ctrl+Shift+R).

---

## Shell & Layout
- **Admin shell:** `public/dashboard.html`
- **Topbar actions:** Home, Logout, Refresh (in that order)
- **Sidebar (order):** Dashboard → System Status → Profile → Orders → Items → Users → Dispatch → Settings → My Account
- **Partial host:** `#partialHost`
- **Assets:** link `/admin/admin.css` and `/admin/js/admin-skin.js`

---

## Buttons & Topbar
- Shared base: `.btn`
- **Variants:**
  - `.btn-ghost`: subtle border (Refresh)
  - `.btn-danger`: red background (Logout)
- Anchor normalization for `<a class="btn">` to behave like `<button class="btn">`

### Home & Logout
- Home: `<a class="btn" id="btn-home" href="/public/index.html">Home</a>`
- Logout: `<button class="btn btn-danger" id="btn-logout">Logout</button>`

### Behavior
- Logout clears local/session storage + cookies, redirects to `/public/index.html`
- Implemented in `admin-skin.js` with DOMContentLoaded guard + try/catch
- Resilient injector (MutationObserver) ensures Home/Logout persist if re-rendered

---

## Global Skin & Patterns
- **Cards:** `.card`, `.card-header`, `.card-body`
- **Card grid:** `.dash-cards` (1 col mobile → 3 cols ≥1000px)
- **Forms:** `.input`, `.form-group`
- **Utilities:** filters bar, table, pager

---

## Approved HTML Patterns
```html
<!-- Card -->
<section class="card">
  <div class="card-header">Title</div>
  <div class="card-body">
    <!-- content -->
  </div>
</section>

<!-- Card grid -->
<div class="dash-cards">
  <section class="card">…</section>
  <section class="card">…</section>
</div>

<!-- Form group -->
<div class="form-group">
  <label for="fieldId"><strong>Label</strong></label>
  <input id="fieldId" class="input" type="text" />
</div>
```

---

## Modals & Tables

### Edit Modal — Dispatch (V2 Appendix A.1)
- Toolbar buttons: History, Load more, Export CSV, Cancel, Save, Mark Delivered
- Mark Delivered disabled unless opened as InTransit

### Users Modal — Parity with Orders (V2 Appendix A.4)
- `<dialog class="modal">` → `.modal-card` → `.modal-header`, `.modal-body`, `.modal-footer`
- `.modal-card { width:min(720px,92vw); max-height:90vh; flex-column; overflow:hidden }`
- Only `.modal-body` scrolls; header/footer pinned
- ESC closes; focus starts at first field
- Buttons: Cancel/Close (left), Save (primary)
- Read-only mode: fields disabled; Save hidden; Cancel shows Close

### Users Table — Orders Column (V2 Appendix A.5)
- Displays server-provided count (email OR phone digits)
- Fallback: `0` if count missing

### Table Fallbacks (V2 Appendix A.2)
- Driver: “Unassigned” when null
- Planned: “—” when empty

### Pager Parity (V2 Appendix A.3)
```css
#dispatch-root .pager { display:flex; gap:8px; }
#dispatch-root .pager.row { justify-content:space-between; }
#dispatch-root .pager .col { display:flex; gap:8px; }
#dispatch-root .pager .col--right { justify-content:flex-end; margin-left:auto; }
#dispatch-root .pager .btn { height:34px; min-width:34px; border-radius:10px; }
```

---

## Local/Scoped Styling
- Only for unique visuals (status dots, avatars, Danger Zone)
- Keep selectors narrow; put `<style>` inside that page’s card body

---

## Accessibility & Semantics
- Use `<label for>` for every input
- Prefer `<button>` for actions
- Use `aria-live="polite"` for status blocks

---

## Tasking Status
### Task 0 — Admin Shell & Foundations
✅ Complete: unified sidebar, partial loader, card/grid, forms, System Status, Settings, Profile

### Task 1 — Wire Data & Save Flows
- Connect Profile + Settings to `/api`
- Validation + error handling
- Ensure Admin changes reflect in Customer views (Step 6.4)

### Task 2 — QA & Polish
- Responsive spacing/stacking
- Accessibility review
- Empty-states/loading skeletons

---

## Changelog
- **2025-09-06**: Initial consolidation of admin shell, cards, forms, partial patterns
- **2025-09-14**: Dispatch modal toolbar, table fallbacks, pager parity
- **2025-09-17**: Users modal parity, orders column count, modal sizing/scroll rules

