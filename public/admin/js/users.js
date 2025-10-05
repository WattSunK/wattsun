/* Compat shim for legacy loader expecting /admin/js/users.js + fetchUsers()
   - Dynamically loads /admin/js/admin-users.js once.
   - Then calls AdminUsers.init() (or the global fallbacks) safely.
   - Idempotent: multiple calls won’t re‑init or re‑load.
*/
(function () {
  const ADMIN_USERS_SRC = "/admin/js/admin-users.js";
  let loaded = false;
  let loadingPromise = null;

  function ensureAdminUsersLoaded() {
    if (loaded || window.AdminUsers || window.initAdminUsers) {
      loaded = true;
      return Promise.resolve();
    }
    if (loadingPromise) return loadingPromise;

    loadingPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = ADMIN_USERS_SRC + (ADMIN_USERS_SRC.includes("?") ? "" : `?v=${Date.now()}`); // cache‑bust first load
      s.async = true;
      s.onload = () => {
        loaded = true;
        resolve();
      };
      s.onerror = (e) => reject(new Error("Failed to load admin-users.js"));
      document.body.appendChild(s);
    });
    return loadingPromise;
  }

  async function initUsers() {
    await ensureAdminUsersLoaded();
    // Prefer the official namespace, then fallbacks exposed by admin-users.js
    if (window.AdminUsers && typeof window.AdminUsers.init === "function") {
      return window.AdminUsers.init();
    }
    if (typeof window.initAdminUsers === "function") {
      return window.initAdminUsers();
    }
    // As a last resort, try once more after a microtask (in case of late defines)
    queueMicrotask(() => {
      if (window.AdminUsers?.init) window.AdminUsers.init();
    });
  }

  // Legacy entrypoint expected by dashboard.js
  window.fetchUsers = initUsers;

  // Also kick automatically if the users partial is already present
  function autoKick() {
    if (document.getElementById("users-root")) initUsers();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoKick);
  } else {
    autoKick();
  }
})();

/* users.js cache marker v4 */
