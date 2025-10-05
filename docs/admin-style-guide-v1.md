# WattSun — Admin Style Guide (V1)

## 1. Shell & Layout
- **Admin shell** is `public/dashboard.html`.  
- **Topbar actions** always include **Home**, **Logout**, and **Refresh**, rendered in that order.  
- **Sidebar** and **partials** remain untouched.  
- **Cache-busting**: bump `?v=` on admin CSS/JS when changed.

## 2. Buttons
- All admin shell controls use the shared `.btn` base class.  
- **Variants**:
  - `.btn-ghost`: subtle border-only style (Refresh uses this).
  - `.btn-danger`: color-only override for Logout. Defined at the end of `admin.css`:
    ```css
    .btn-danger { background:#ef4444; border-color:#ef4444; color:#fff; }
    .btn-danger:hover { background:#dc2626; border-color:#dc2626; }
    ```
- **Anchor normalization** (ensures `<a class="btn">` matches `<button class="btn">`):
    ```css
    a.btn, a.btn:link, a.btn:visited { color: inherit; text-decoration: none; }
    a.btn:hover, a.btn:focus { text-decoration: none; }
    a.btn { display: inline-flex; align-items: center; justify-content: center; }
    ```

## 3. Home & Logout
- **Home** is `<a class="btn" id="btn-home" href="/public/index.html">Home</a>` → navigation.  
- **Logout** is `<button class="btn btn-danger" id="btn-logout">Logout</button>` → action.  
- Both inherit `.btn` geometry to match Refresh.

## 4. Behavior
- **Logout wiring** in `admin-skin.js`:  
  - Clears localStorage, sessionStorage, and common session cookies (`connect.sid`, `sid`).  
  - Redirects to `/public/index.html`.  
  - Wrapped in a `DOMContentLoaded` guard + `try/catch` → non-breaking.
- **Resilient injector** (in `admin-skin.js`):  
  - Ensures Home/Logout are present if the topbar is re-rendered.  
  - Uses a MutationObserver to re-insert them if removed.  
  - This is an **accepted exception** to the “minimal hooks” principle until the loader stabilizes.

## 5. Placement Rules
- Home + Logout are inserted **before Refresh** in the `.topbar-actions` container.  
- All three align side by side, same geometry, with only Logout red.

## 6. Compliance with Core Principles
- **Single source of styling**: `admin.css` only.  
- **Minimal markup edits**: only `dashboard.html` shell touched.  
- **Behavior isolated**: `admin-skin.js` contains all event hooks.  
- **Non-breaking, append-only**: injector and logout code designed to fail silently if elements absent.  
- **Documented exception**: injector is allowed to maintain button presence during loader re-renders.
