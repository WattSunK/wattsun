// /public/js/dashboard.js

// ====== (Optional) DIAG: fetch logger — remove after debug ======
(function () {
  const orig = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    const method = init?.method || (typeof input !== "string" && input?.method) || "GET";
    const sec = window.__activeSection || "unknown";
    console.log("[NET]", method, url, "sec:", sec);
    return orig.call(this, input, init);
  };
})();

// ====== (Optional) DIAG: lifecycle probes — remove after debug ======
window.addEventListener("admin:partial-loaded", (e) => {
  console.log("[EVT] partial-loaded:", e?.detail?.name, "active=", window.__activeSection);
});
window.addEventListener("admin:section-activated", (e) => {
  if (e?.detail?.name) window.__activeSection = e.detail.name;
  console.log("[EVT] section-activated:", e?.detail?.name, "active=", window.__activeSection);
});

document.addEventListener("DOMContentLoaded", () => {
  // ---- Resolve the content slot robustly
  function getContentRoot() {
    return (
      document.getElementById("admin-content") ||
      document.getElementById("adminContent") ||
      document.getElementById("content")
    );
  }
  const content = getContentRoot();
  if (!content) console.error("No content container found (#admin-content/#adminContent/#content)");

  const sidebar   = document.querySelector(".sidebar nav,[data-admin-sidebar]");
  const hdrSearch = document.querySelector(".header-search");

  // ---- Idempotent script loader
  async function ensureScript(src, readyCheck) {
    try {
      if (typeof readyCheck === "function" && readyCheck()) return;
      if (document.querySelector(`script[src="${src}"]`)) {
        await new Promise(r => setTimeout(r, 0));
        return;
      }
      await new Promise((resolve) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = resolve;
        s.onerror = resolve; // soft-fail
        document.body.appendChild(s);
      });
    } catch (e) {
      console.warn("ensureScript error:", src, e);
    }
  }

  // ---- Resilient partial fetcher (relative → absolute fallback)
  async function fetchPartial(name) {
    const bust = Date.now();
    const rel  = `./partials/${name}.html?v=${bust}`;
    const abs  = `/public/partials/${name}.html?v=${bust}`;
    try {
      let r = await fetch(rel);
      if (!r.ok) throw new Error(`REL ${name} ${r.status}`);
      return await r.text();
    } catch (e1) {
      console.warn("[Partial] REL failed, trying ABS:", name, e1?.message || e1);
      try {
        let r2 = await fetch(abs);
        if (!r2.ok) throw new Error(`ABS ${name} ${r2.status}`);
        return await r2.text();
      } catch (e2) {
        console.error("[Partial] ABS also failed:", name, e2?.message || e2);
        return `<div class="p-3 text-danger">Failed to load ${name}.html</div>`;
      }
    }
  }

  // ---- Session helpers (unchanged)
  function getUser() {
    const a = localStorage.getItem("wattsunUser");
    const b = localStorage.getItem("ws_user");
    try { if (a) return JSON.parse(a); } catch {}
    try { if (b) { const j = JSON.parse(b); return { success:true, user:{ name:j.name||"", phone:j.phone||"", type:j.type||"", status:j.status||"" } }; } } catch {}
    return null;
  }
  function setUserCtx(u) {
    if (!u) return;
    try { localStorage.setItem("wattsunUser", JSON.stringify(u)); } catch {}
    const phone = u?.user?.phone || u?.phone || u?.user?.msisdn || "";
    if (phone) { try { localStorage.setItem("ws_user", JSON.stringify({ phone })); } catch {} }
    window.dispatchEvent(new CustomEvent("ws:user", { detail: u }));
  }
  function updateHeaderUser(u) {
    const el = document.querySelector(".header-user"); if (!el) return;
    const info = u?.user || u || {};
    const name = info.name || "Admin";
    const phone = info.phone || "";
    el.textContent = `👤 ${name}${phone ? " · " + phone : ""}`;
  }
  function setHeaderSearchVisible(show) { if (hdrSearch) hdrSearch.style.display = show ? "" : "none"; }

  // ---- Section loader
  async function loadSection(section) {
    if (!getContentRoot()) { console.error("No content container to inject"); return; }
    window.__activeSection = section;

    const hasOwnSearch = new Set(["orders", "users", "items", "myorders"]);
    setHeaderSearchVisible(!hasOwnSearch.has(section));

    // Prefetch bucket (lets us avoid duplicate fetches)
    let prefetchedHTML = null;
    let prefetchedName = null;

    // ORDERS — special branch (kept as-is), early return
    if (section === "orders") {
      const html = await fetchPartial("orders");
      getContentRoot().innerHTML = html;
      window.dispatchEvent(new CustomEvent("admin:partial-loaded", { detail: { name: "orders" }}));
      await ensureScript("./admin/js/admin-orders.js", () => typeof window.initAdminOrders === "function");
      if (typeof window.initAdminOrders === "function") window.initAdminOrders();
      window.dispatchEvent(new CustomEvent("admin:section-activated", { detail: { name: "orders" }}));
      return;
    }

    // PROFILE — special branch (kept as-is), early return
    if (section === "profile") {
      const html = await fetchPartial("profile");
      getContentRoot().innerHTML = html;
      window.dispatchEvent(new CustomEvent("admin:partial-loaded", { detail: { name: "profile" }}));

      (async () => {
        try {
          const resp = await fetch("./api/users/me", { credentials: "include" });
          if (resp.ok) {
            const body = await resp.json();
            const normalized = body && body.user ? body : { success: true, user: body };
            setUserCtx(normalized);
            updateHeaderUser(normalized);
          }
        } catch {}
      })();

      const u = getUser();
      hydrateProfile(u);
      window.addEventListener("ws:user", ev => hydrateProfile(ev.detail));
      window.dispatchEvent(new CustomEvent("admin:section-activated", { detail: { name: "profile" }}));
      return;
    }

    // USERS — special branch (kept as-is), early return
    if (section === "users") {
      const html = await fetchPartial("users");
      getContentRoot().innerHTML = html;
      window.dispatchEvent(new CustomEvent("admin:partial-loaded", { detail: { name: "users" }}));
      if (typeof fetchUsers !== "function") {
        if (!document.querySelector('script[src="./admin/js/users.js"]')) {
          const s = document.createElement("script");
          s.src = "./admin/js/users.js";
          s.onload = () => { if (typeof fetchUsers === "function") fetchUsers(); };
          s.onerror = () => console.error("Failed to load users.js");
          document.body.appendChild(s);
        }
      } else { fetchUsers(); }
      window.dispatchEvent(new CustomEvent("admin:section-activated", { detail: { name: "users" }}));
      return;
    }

    // ITEMS — prefetch + controller, but DO NOT early-return
    if (section === "items") {
      prefetchedHTML = await fetchPartial("items");
      prefetchedName = "items";
      await ensureScript("./admin/js/admin-items.js", () => window.AdminItems && typeof window.AdminItems.init === "function");
      // init will be called after generic injection below
    }

    // DEFAULT / GENERIC
    try {
      const html = (prefetchedHTML && prefetchedName === section)
        ? prefetchedHTML
        : await fetchPartial(section);
      getContentRoot().innerHTML = html;
      window.dispatchEvent(new CustomEvent("admin:partial-loaded", { detail: { name: section }}));

      // finalize Items init now that DOM exists
      if (section === "items" && window.AdminItems && typeof window.AdminItems.init === "function") {
        window.AdminItems.init();
      }
    } catch (e) {
      console.error("Generic load error:", section, e);
      getContentRoot().innerHTML = `<div class="p-3 text-danger">Failed to load section: ${section}</div>`;
    }

    window.dispatchEvent(new CustomEvent("admin:section-activated", { detail: { name: section }}));
  }

  // ---- Profile hydration (unchanged)
  function hydrateProfile(u) {
    const info = u?.user || u || {};
    const name  = info.name || "User Name";
    const email = info.email || "";
    const phone = info.phone || "";
    const role  = info.role || info.type || "Customer";
    const last  = info.lastLogin || "—";

    const root = getContentRoot();
    const elName  = root?.querySelector("#userName");
    const elEmail = root?.querySelector("#userEmail");
    const elRole  = root?.querySelector("#userRole");
    const elLast  = root?.querySelector("#userLastLogin");
    const elAvatar= root?.querySelector("#userAvatar");
    if (elName)  elName.textContent  = name;
    if (elEmail) elEmail.textContent = email || (phone ? `${phone}@` : "—");
    if (elRole)  elRole.textContent  = role;
    if (elLast)  elLast.textContent  = `Last login: ${last}`;
    if (elAvatar)elAvatar.textContent = (name || "U").trim().charAt(0).toUpperCase() || "U";

    const fName  = root?.querySelector("#pf-name");
    const fEmail = root?.querySelector("#pf-email");
    const fPhone = root?.querySelector("#pf-phone");
    if (fName)  fName.value  = name || "";
    if (fEmail) fEmail.value = email || "";
    if (fPhone) fPhone.value = phone || "";
  }

  // ---- Sidebar → loader
  if (sidebar && !sidebar._bound) {
    sidebar._bound = true;
    sidebar.addEventListener("click", (e) => {
      const a = e.target.closest("a[data-partial], a[data-section]");
      if (!a) return;
      e.preventDefault();
      sidebar.querySelectorAll("a").forEach(x => x.classList.remove("active"));
      a.classList.add("active");
      const sect = a.getAttribute("data-partial") || a.getAttribute("data-section");
      location.hash = "#" + sect;
      loadSection(sect);
    });
  }

  // initial
  const initial = (location.hash || "").replace(/^#/, "") || "system-status";
  loadSection(initial);
});
