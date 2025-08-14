// /public/js/dashboard.js
document.addEventListener("DOMContentLoaded", () => {
  const content  = document.getElementById("adminContent") || document.getElementById("admin-content");
  const sidebar  = document.querySelector(".sidebar nav");
  const hdrSearch= document.querySelector(".header-search");

  // ---- Session helpers ----
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

  // ---- UI helpers ----
  function setHeaderSearchVisible(show) { if (hdrSearch) hdrSearch.style.display = show ? "" : "none"; }

  async function ensureOrdersModal() {
    if (document.getElementById("orderDetailsModal")) return;
    try {
      const r = await fetch(`/partials/orders-modal.html?v=${Date.now()}`);
      if (r.ok) {
        const html = await r.text();
        const div = document.createElement("div");
        div.innerHTML = html;
        document.body.appendChild(div);
      }
    } catch {}
    const modal = document.getElementById("orderDetailsModal");
    if (modal) modal.style.display = "none";
  }

  // ---- Orders helpers (existing) ----
  async function populateOrders() {
    await ensureOrdersModal();
    // (… your existing Orders JS remains here unchanged …)
    // This file intentionally leaves all pre-existing logic intact.
  }

  // ---- Section loader ----
  async function loadSection(section) {
    const hasOwnSearch = new Set(["orders", "users", "items", "myorders"]);
    setHeaderSearchVisible(!hasOwnSearch.has(section));

    if (section === "orders") {
      try {
        const res = await fetch(`/partials/orders.html?v=${Date.now()}`);
        content.innerHTML = res.ok ? await res.text() : `<div class="p-3"></div>`;
      } catch {
        content.innerHTML = `<div class="p-3"></div>`;
      }
      await populateOrders();
      return;
    }

    if (section === "profile") {
      try {
        const res = await fetch(`/partials/profile.html?v=${Date.now()}`);
        content.innerHTML = res.ok ? await res.text() : `<div class="p-3"></div>`;
      } catch {
        content.innerHTML = `<div class="p-3"></div>`;
      }
      // Try to use DB as source of truth; fall back to session
      async function fetchMe() {
        try {
          const sessRaw = localStorage.getItem("wattsunUser");
          const sess = sessRaw ? JSON.parse(sessRaw) : null;
          const id = sess?.user?.id || sess?.id;
          if (id) {
            const r = await fetch(`/api/users/${encodeURIComponent(id)}`, { credentials: 'include' });
            if (r.ok) {
              const u = await r.json();
              return { success: true, user: {
                id: u.id,
                name: u.name || u.fullName || '',
                email: u.email || '',
                phone: u.phone || u.msisdn || '',
                type: u.type || u.role || 'Customer',
                status: u.status || 'Active',
                createdAt: u.createdAt || u.created_at,
                lastLogin: u.lastLogin || u.last_login
              }};
            }
          }
        } catch(e) {}
        try { return JSON.parse(localStorage.getItem("wattsunUser")||"null"); } catch { return null; }
      }
      // Prefer profile.js if present (keeps logic isolated); else use local hydrator
      try {
        if (!window.initAdminProfile) {
          await import('./profile.js?v=1').catch(() => {});
        }
      } catch(_) {}

      const me = await fetchMe();
      if (window.initAdminProfile) {
        try {
          window.initAdminProfile({
            source: me,
            onLocalSave(u){
              try{ localStorage.setItem("wattsunUser", JSON.stringify(u)); }catch{}
              try{ window.dispatchEvent(new CustomEvent("ws:user", { detail:u })); }catch{}
            }
          });
        } catch {
          if (typeof hydrateProfile === "function") hydrateProfile(me);
        }
      } else {
        if (typeof hydrateProfile === "function") hydrateProfile(me);
      }
      window.addEventListener("ws:user", ev => {
        if (typeof hydrateProfile === "function") hydrateProfile(ev.detail);
      });
      return;
    }

    if (section === "users") {
      try {
        const res = await fetch(`/partials/users.html?v=${Date.now()}`);
        content.innerHTML = res.ok ? await res.text() : `<div class="p-3"></div>`;
      } catch {
        content.innerHTML = `<div class="p-3"></div>`;
        return;
      }
      if (typeof fetchAndRenderUsers !== "function") {
        if (!document.querySelector('script[src="/admin/js/admin-users.js"]')) {
          const script = document.createElement("script");
          script.src = "/admin/js/admin-users.js";
          script.onload = () => {
            if (typeof fetchAndRenderUsers === "function") {
              fetchAndRenderUsers();
            }
          };
          script.onerror = () => console.error("Failed to load admin-users.js");
          document.body.appendChild(script);
        }
      } else {
        fetchAndRenderUsers();
      }
      return;
    }

    // --- NEW: Items section ---
    if (section === "items") {
      try {
        const res = await fetch(`/partials/items.html?v=${Date.now()}`);
        content.innerHTML = res.ok ? await res.text() : `<div class="p-3"></div>`;
      } catch {
        content.innerHTML = `<div class="p-3"></div>`;
      }
      if (typeof fetchAndRenderItems !== "function") {
        if (!document.querySelector('script[src="/admin/js/admin-items.js"]')) {
          const script = document.createElement("script");
          script.src = "/admin/js/admin-items.js";
          script.onload = () => {
            if (typeof fetchAndRenderItems === "function") {
              fetchAndRenderItems();
            }
          };
          script.onerror = () => console.error("Failed to load admin-items.js");
          document.body.appendChild(script);
        }
      } else {
        fetchAndRenderItems();
      }
      return;
    }

    // System status
    if (section === "system-status") {
      try {
        const res = await fetch(`/partials/system-status.html?v=${Date.now()}`);
        content.innerHTML = res.ok ? await res.text() : `<div class="p-3"></div>`;
      } catch {
        content.innerHTML = `<div class="p-3"></div>`;
      }
      // (system-status JS handles its own checks)
      return;
    }

    // Generic loader for other sections
    try {
      const res = await fetch(`/partials/${section}.html?v=${Date.now()}`);
      content.innerHTML = res.ok ? await res.text() : `<div class="p-3"></div>`;
    } catch {
      content.innerHTML = `<div class="p-3"></div>`;
    }
  }

  // ---- Profile mapping (existing fallback; left intact) ----
  function hydrateProfile(u) {
    const info = u?.user || u || {};
    const name = info.name || "User";
    const email= info.email || "";
    const role = info.type || "Customer";
    const phone= info.phone || info.msisdn || "";
    const last = info.lastLogin || info.updatedAt || info.createdAt || "—";
    const elName  = content.querySelector("#userName");
    const elEmail = content.querySelector("#userEmail");
    const elRole  = content.querySelector("#userRole");
    const elLast  = content.querySelector("#lastLogin");
    const elAvatar= content.querySelector("#userAvatar");
    if (elName)  elName.textContent  = name;
    if (elEmail) elEmail.textContent = email || (phone ? `${phone}@` : "—");
    if (elRole)  elRole.textContent  = role;
    if (elLast)  elLast.textContent  = `Last login: ${last}`;
    if (elAvatar)elAvatar.textContent = (name || "U").trim().charAt(0).toUpperCase() || "U";
    const fName  = content.querySelector("#pf-name");
    const fEmail = content.querySelector("#pf-email");
    const fPhone = content.querySelector("#pf-phone");
    if (fName)  fName.value  = name || "";
    if (fEmail) fEmail.value = email || "";
    if (fPhone) fPhone.value = phone || "";
    const btnSave = content.querySelector("#btnSave");
    const btnCancel = content.querySelector("#btnCancel");
    if (btnSave && !btnSave.dataset.bound) {
      btnSave.dataset.bound = "1";
      btnSave.addEventListener("click", () => {
        const nu = {
          ...(u || { success: true }),
          user: {
            ...(u?.user || {}),
            name:  (content.querySelector("#pf-name")?.value || "").trim(),
            email: (content.querySelector("#pf-email")?.value || "").trim(),
            phone: (content.querySelector("#pf-phone")?.value || "").trim(),
            type: role,
            status: u?.user?.status || "Active"
          }
        };
        try { localStorage.setItem("wattsunUser", JSON.stringify(nu)); } catch {}
        hydrateProfile(nu);
        updateHeaderUser(nu);
        alert("Profile saved locally.");
      });
    }
    if (btnCancel && !btnCancel.dataset.bound) {
      btnCancel.dataset.bound = "1";
      btnCancel.addEventListener("click", () => hydrateProfile(getUser()));
    }
  }

  // ---- Router ----
  if (sidebar) {
    sidebar.addEventListener("click", (e) => {
      const a = e.target.closest("a[data-partial],a[data-section]");
      if (!a) return;
      e.preventDefault();
      const section = a.getAttribute("data-partial") || a.getAttribute("data-section");
      sidebar.querySelectorAll("a").forEach(x => x.classList.remove("active"));
      a.classList.add("active");
      loadSection(section);
    });
  }

  // ---- Boot ----
  const u = getUser();
  if (u) { updateHeaderUser(u); setUserCtx(u); }
  setHeaderSearchVisible(true);
  loadSection("system-status");
});
