// /public/js/dashboard.js
document.addEventListener("DOMContentLoaded", () => {
  const content  = document.getElementById("admin-content");
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

  // ---- Section loader (deduped: Orders handled by canonical admin-orders.js) ----
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

      // Ensure canonical Orders controller is loaded, then init.
      await ensureScript("/public/admin/js/admin-orders.js", () => typeof window.initAdminOrders === "function");
      if (typeof window.initAdminOrders === "function") {
        window.initAdminOrders();
      } else {
        console.error("initAdminOrders() not found after loading admin-orders.js");
      }
      return;
    }

    if (section === "profile") {
      try {
        const res = await fetch(`/partials/profile.html?v=${Date.now()}`);
        content.innerHTML = res.ok ? await res.text() : `<div class="p-3"></div>`;
      } catch {
        content.innerHTML = `<div class="p-3"></div>`;
      }

      // Attempt server "me" hydration first; fall back to local
      (async () => {
        try {
          const resp = await fetch("/api/users/me", { credentials: "include" });
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
      if (typeof fetchUsers !== "function") {
        if (!document.querySelector('script[src="/admin/js/users.js"]')) {
          const script = document.createElement("script");
          script.src = "/admin/js/users.js";
          script.onload = () => { if (typeof fetchUsers === "function") fetchUsers(); };
          script.onerror = () => console.error("Failed to load users.js");
          document.body.appendChild(script);
        }
      } else {
        fetchUsers();
      }
      return;
    }

    try {
      const res = await fetch(`/partials/${section}.html?v=${Date.now()}`);
      content.innerHTML = res.ok ? await res.text() : `<div class="p-3"></div>`;
    } catch {
      content.innerHTML = `<div class="p-3"></div>`;
    }
  }

  // ---- Profile hydration (unchanged) ----
  function hydrateProfile(u) {
    const info = u?.user || u || {};
    const name  = info.name || "User Name";
    const email = info.email || "";
    const phone = info.phone || "";
    const role  = info.role || info.type || "Customer";
    const last  = info.lastLogin || "—";

    const elName  = content.querySelector("#userName");
    const elEmail = content.querySelector("#userEmail");
    const elRole  = content.querySelector("#userRole");
    const elLast  = content.querySelector("#userLastLogin");
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
        setUserCtx(nu);
        hydrateProfile(nu);
        alert("Saved locally. (Server save coming soon)");
      });
    }
    if (btnCancel && !btnCancel.dataset.bound) {
      btnCancel.dataset.bound = "1";
      btnCancel.addEventListener("click", () => hydrateProfile(getUser()));
    }
  }

  // ---- Script loader helper ----
  async function ensureScript(src, readyCheck) {
    if (readyCheck && readyCheck()) return true;
    let tag = document.querySelector(`script[src="${src}"]`);
    if (!tag) {
      tag = document.createElement("script");
      tag.src = src;
      tag.defer = true;
      document.body.appendChild(tag);
    }
    // Wait until it’s available or fails
    await new Promise((resolve) => {
      let done = false;
      const onReady = () => {
        if (!done && (!readyCheck || readyCheck())) { done = true; resolve(); }
      };
      const iv = setInterval(onReady, 50);
      tag.addEventListener("load", () => { onReady(); clearInterval(iv); });
      tag.addEventListener("error", () => { clearInterval(iv); resolve(); });
      setTimeout(() => { clearInterval(iv); resolve(); }, 5000);
    });
    return readyCheck ? !!readyCheck() : true;
  }

  // ---- Sidebar routing (existing) ----
  if (sidebar && !sidebar.dataset.bound) {
    sidebar.dataset.bound = "1";
    sidebar.addEventListener("click", (e) => {
      const a = e.target.closest("a[data-section]");
      if (!a) return;
      e.preventDefault();
      sidebar.querySelectorAll("a").forEach(x => x.classList.remove("active"));
      a.classList.add("active");
      loadSection(a.getAttribute("data-section"));
    });
  }

  // ---- Boot ----
  const u = getUser();
  if (u) { updateHeaderUser(u); setUserCtx(u); }
  setHeaderSearchVisible(true);
  loadSection("system-status");
});
