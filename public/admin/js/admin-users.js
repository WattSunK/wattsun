// public/admin/js/admin-users.js
(() => {
  // Prevent double-attach if dashboard reloads the partial more than once
  if (window.__ADMIN_USERS_CONTROLLER__) return;
  window.__ADMIN_USERS_CONTROLLER__ = true;

  const onPartialLoaded = (evt) => {
    // Many of your partials emit { detail: { name: "<partial-name>" } }
    const name =
      (evt && evt.detail && (evt.detail.name || evt.detail)) || "" + "";

    // Only act when the Users partial is loaded
    if (!/users/i.test(String(name))) return;

    console.log("👷 [Users] controller attached — wiring probe only (no UI changes).");

    // Connectivity probe to the new SQL-only endpoint (no DOM writes yet)
    const url = "/api/admin/users?perPage=5&page=1";
    fetch(url, { credentials: "include" })
      .then(async (r) => {
        const isJSON = r.headers.get("content-type")?.includes("application/json");
        const body = isJSON ? await r.json() : await r.text();
        console.log("✅ [Users] API probe response", {
          ok: r.ok,
          status: r.status,
          url,
          body,
        });
      })
      .catch((err) => {
        console.error("❌ [Users] API probe failed", err);
      });
  };

  document.addEventListener("admin:partial-loaded", onPartialLoaded);
  console.log("🔎 [Users] controller listener armed (awaiting admin:partial-loaded).");
})();
