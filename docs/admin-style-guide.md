# Admin Shell & UI Foundations — Style Guide (Living Doc)

_Last updated: 2025-09-06_

## Purpose
Keep the admin backend consistent, maintainable, and easy to extend. This document defines our **global skin**, **page structure**, and **coding conventions** for all admin partials.

---

## Core Principles

1. **Single source of styling**
   - All global styles live in **`public/admin/admin.css`**.
   - Partials contain **HTML structure only** (cards, inputs, simple markup).
   - Use small, **scoped** styles inside a partial only for truly unique UI (e.g., API status dots, profile avatar, “Danger Zone” emphasis).

2. **Reusable building blocks**
   - **Cards:** `section.card > .card-header + .card-body`.
   - **Grid:** `.dash-cards` for responsive multi-card layouts.
   - **Form groups:** `.form-group` wraps `<label>` + field for spacing.
   - **Inputs:** every text/select/textarea uses the **`.input`** class.

3. **Global form rules (admin.css)**
   - `.input` sets border, padding, radius, focus ring, **`width:100%`** and **`box-sizing:border-box`**.
   - To avoid mega-wide fields, `.input { max-width: 480px; }` (tune per page if needed).
   - `.form-group` controls vertical rhythm (e.g., `gap:4px; margin-bottom:12px;`).

4. **Partial loader**
   - The shell (`public/dashboard.html` + `admin-skin.js`) loads partials into `#partialHost`.
   - Each nav link uses `data-partial` + `data-url`.
   - When a partial is mounted, fire `admin:partial-loaded` if needed.

5. **Cache busting**
   - When updating **admin.css** or shell JS, bump the query token in the shell:
     ```
     <link rel="stylesheet" href="/admin/admin.css?v=YYYYMMDD-XX">
     ```
   - Hard refresh when testing (Ctrl+Shift+R).

---

## File Layout (What lives where)

- **`public/dashboard.html`**
  - Sidebar (ordered): Dashboard → System Status → Profile → Orders → Items → Users → Dispatch → Settings → My Account
  - Topbar, search, account menu
  - Partial host `#partialHost`
  - Links to **`/admin/admin.css`** and **`/admin/js/admin-skin.js`**

- **`public/admin/admin.css`** (the skin)
  - Card shell: `.card`, `.card-header`, `.card-body`
  - Card grid: `.dash-cards` (1 col mobile → 3 cols ≥1000px)
  - Forms: `.input`, `.form-group`
  - Common utilities (filters bar, table/pager if used)

- **`public/partials/*.html`** (pages)
  - **System Status**
    - Top card: API + Cloudflare health (status-line + dot)
    - Below: three cards (Recent Orders, Items, Dispatch)
  - **Settings**
    - Cards: Company Info, User Management, Notifications, Integrations, Appearance, System Controls, **Danger Zone**
  - **Profile**
    - Identity header (avatar + role), then “My Account” form card
  - **Orders / Items / Users / Dispatch**
    - Use the same card shell & filters; tables remain consistent with the skin

- **`public/admin/js/admin-skin.js`**
  - Partial loader + minimal event hooks

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
  <section class="card">…</section>
</div>

<!-- Form group with global input -->
<div class="form-group">
  <label for="fieldId"><strong>Label</strong></label>
  <input id="fieldId" class="input" type="text" />
</div>
```

---

## Local/Scoped Styling (When allowed)
- Only for unique, page-specific visuals (e.g., API **status dots**, profile **avatar**, Settings **Danger Zone**).
- Keep selectors **narrow** and place the `<style>` inside that page’s card body.

---

## Accessibility & Semantics
- Use `<label for="id">` for every input, group with `.form-group`.
- Prefer `<button>` over `<a>` for actions.
- Use `aria-live="polite"` on reactive status blocks.

---

## Tasking Status

### Task 0 — Admin Shell & Foundations
**Status: ✅ Complete**  
- Unified sidebar order + partial loading.  
- Global **card** shell + **dash-cards** grid.  
- Global **form** primitives: `.input`, `.form-group` (with `width:100%` and `max-width` guidance).  
- System Status layout implemented.  
- Settings page complete (Company Info, User Management, Notifications, Integrations, Appearance, System Controls, Danger Zone).  
- Profile page complete (identity header + My Account form).  

### Task 1 — Next Step: Wire Data & Save Flows
- Hook Profile + Settings forms to real `/api` endpoints.  
- Add validation + error handling.  
- Ensure Admin changes reflect in Customer views (Step 6.4 Customer Reflection).  

### Task 2 — QA & Polish
- Responsive pass (spacing, stacking).  
- Accessibility review.  
- Consistent empty-states/loading skeletons.  

---

## Changelog
- **2025-09-06**: Initial consolidation of admin shell, cards, forms, partial patterns.
