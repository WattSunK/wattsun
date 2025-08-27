// /public/js/dashboard.js
// ====== DIAG: fetch logger (temporary; remove after fix) ======
(function () {
  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = (typeof input === "string") ? input : (input && input.url) || "";
    const method = (init && init.method) || (typeof input !== "string" && input.method) || "GET";
    const sec = (window.__activeSection || "unknown");
    const at = (new Error()).stack.split("\n")[2]?.trim();
    console.log("[NET]", method, url, "sec:", sec, "at:", at);
    return origFetch.call(this, input, init);
  };
})();

// ====== DIAG: lifecycle probes (temporary; remove after fix) ======
window.addEventListener("admin:partial-loaded", (e) => {
  console.log("[EVT] partial-loaded:", e?.detail?.name, "active=", window.__activeSection);
});
window.addEventListener("admin:section-activated", (e) => {
  if (e?.detail?.name) window.__activeSection = e.detail.name;
  console.log("[EVT] section-activated:", e?.detail?.name, "active=", window.__activeSection);
});

document.addEventListener("DOMContentLoaded", () => {
  // Be generous about where to inject content (some pages use adminContent or content)
  const content  = document.getElementById("admin-content")
                  || document.getElementById("adminContent")
                  || document.getElementById("content");
  const sidebar  = document.querySelector(".sidebar nav,[data-admin-sidebar]");
  const hdrSearch= document.querySelector(".header-search");

  // ---- loader helper for scripts (idempotent)
  async function ensureScript(src, readyCheck) {
    if (typeof readyCheck === "function" && readyCheck()) return;
    if (document.querySelector(`script[src="${src}"]`)) {
      await new Promise(r => setTimeout(r, 0));
      return;
    }
    await new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = resolve; // soft-fail to avoid blocking section render
      document.body.appendChild(s);
    });
  }

  // ---- Session helpers
  function getUser() {
    const a = localStorage.getItem("wattsunUser");
    const b = localStorage.getItem("ws_user");
    try { if (a) return JSON.parse(a); } catch {}
    try {
      if (b) {
        const j = JSON.parse(b);
        return {
          success: true,
          user: { name: j.name || "", phone: j.phone || "", type: j.type || "", status: j.status || "" }
        };
      }
    } catch {}
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
    const el = document.querySelector(".header-user");
    if (!el) return;
    const info = u?.user || u || {};
    const name = info.name || "Admin";
    const phone = info.phone || "";
    el.textContent = `👤 ${name}${phone ? " · " + phone : ""}`;
  }

  // ---- UI helpers
  function setHeaderSearchVisible(show) { if (hdrSearch) hdrSearch.style.display = show ? "" : "none"; }

  // ---- Section loader
  async function loadSection(section) {
    if (!content) { console.error("No content container found (#admin-content/#adminContent/#content)."); return; }
    window.__activeSection = section;

    const hasOwnSearch = new Set(["orders", "users", "items", "myorders"]);
    setHeaderSearchVisible(!hasOwnSearch.has(section));

    if (section === "orders") {
      try {
        const res = await fetch(`./partials/orders.html?v=${Date.now()}`);
        content.innerHTML = res.ok ? await res.text() : `<div class="p-3"></div>`;
        window.dispatchEvent(new CustomEvent("admin:partial-loaded", { detail: { name: "orders" }}));
      } catch {
        content.innerHTML = `<div class="p-3"></div>`;
      }
      await ensureScript("./admin/js/admin-orders.js", () => typeof window.initAdminOrders === "function");
      if (typeof window.initAdminOrders === "function") window.initAdminOrders();
      window.dispatchEvent(new CustomEvent("admin:section-activated", { detail: { name: "orders" }}));
      return;
    }

    if (section === "profile") {
      try {
        const res = await fetch(`./partials/profile.html?v=${Date.now()}`);
        content.innerHTML = res.ok ? await res.text() : `<div class="p-3"></div>`;
        window.dispatchEvent(new CustomEvent("admin:partial-loaded", { detail: { name: "profile" }}));
      } catch {
        content.innerHTML = `<div class="p-3"></div>`;
      }

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

    if (section === "users") {
      try {
        const res = await fetch(`./partials/users.html?v=${Date.now()}`);
        content.innerHTML = res.ok ? await res.text() : `<div class="p-3"></div>`;
        window.dispatchEvent(new CustomEvent("admin:partial-loaded", { detail: { name: "users" }}));
      } catch {
        content.innerHTML = `<div class="p-3"></div>`;
        return;
      }
      if (typeof fetchUsers !== "function") {
        if (!document.querySelector('script[src="./admin/js/users.js"]')) {
          const script = document.createElement("script");
          script.src = "./admin/js/users.js";
          script.onload = () => { if (typeof fetchUsers === "function") fetchUsers(); };
          script.onerror = () => console.error("Failed to load users.js");
          document.body.appendChild(script);
        }
      } else {
        fetchUsers();
      }
      window.dispatchEvent(new CustomEvent("admin:section-activated", { detail: { name: "users" }}));
      return;
    }

    // Explicit Items loader
    if (section === "items") {
      try {
        const res = await fetch(`./partials/items.html?v=${Date.now()}`);
        content.innerHTML = res.ok ? await res.text() : `<div class="p-3"></div>`;
        window.dispatchEvent(new CustomEvent("admin:partial-loaded", { detail: { name: "items" }}));
      } catch {
        content.innerHTML = `<div class="p-3"></div>`;
      }
      await ensureScript("./admin/js/admin-items.js", () => window.AdminItems && typeof window.AdminItems.init === "function");
      if (window.AdminItems && typeof window.AdminItems.init === "function") {
        window.AdminItems.init();
      } else {
        console.error("AdminItems.init() not found after loading admin-items.js");
      }
      window.dispatchEvent(new CustomEvent("admin:section-activated", { detail: { name: "items" }}));
      return;
    }

    // default loader for other sections
    try {
      const res = await fetch(`./partials/${section}.html?v=${Date.now()}`);
      content.innerHTML = res.ok ? await res.text() : `<div class="p-3"></div>`;
      window.dispatchEvent(new CustomEvent("admin:partial-loaded", { detail: { name: section }}));
    } catch {
      content.innerHTML = `<div class="p-3"></div>`;
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

    const elName  = content?.querySelector("#userName");
    const elEmail = content?.querySelector("#userEmail");
    const elRole  = content?.querySelector("#userRole");
    const elLast  = content?.querySelector("#userLastLogin");
    const elAvatar= content?.querySelector("#userAvatar");
    if (elName)  elName.textContent  = name;
    if (elEmail) elEmail.textContent = email || (phone ? `${phone}@` : "—");
    if (elRole)  elRole.textContent  = role;
    if (elLast)  elLast.textContent  = `Last login: ${last}`;
    if (elAvatar)elAvatar.textContent = (name || "U").trim().charAt(0).toUpperCase() || "U";

    const fName  = content?.querySelector("#pf-name");
    const fEmail = content?.querySelector("#pf-email");
    const fPhone = content?.querySelector("#pf-phone");
    if (fName)  fName.value  = name || "";
    if (fEmail) fEmail.value = email || "";
    if (fPhone) fPhone.value = phone || "";
  }

  // ---- Sidebar nav → partial loader
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

  // initial section
  const initial = (location.hash || "").replace(/^#/, "") || "system-status";
  loadSection(initial);
});
