// /public/admin/js/dashboard.js
document.addEventListener("DOMContentLoaded", () => {
  const content  = document.getElementById("admin-content") || document.getElementById("adminContent");
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
          user: {
            id: j?.id || j?.user?.id,
            name: j?.name || j?.user?.name || j?.fullName || j?.user?.fullName,
            fullName: j?.fullName || j?.user?.fullName || j?.name || j?.user?.name,
            email: j?.email || j?.user?.email,
            phone: j?.phone || j?.user?.phone,
            role: j?.role || j?.user?.role || j?.type || j?.user?.type || "Customer"
          }
        };
      }
    } catch {}
    return null;
  }

  function setUserCtx(u) {
    document.documentElement.dataset.userRole =
      (u?.user?.role || u?.role || u?.user?.type || u?.type || "").toLowerCase();
  }

  function updateHeaderUser(u) {
    try {
      const info = u?.user || u || {};
      const name = info.fullName || info.name || "User";
      const email = info.email || "";
      const tel = info.phone || "";
      const el = document.getElementById("headerUser");
      if (!el) return;
      const n = el.querySelector(".user-name");
      const m = el.querySelector(".user-meta");
      if (n) n.textContent = name;
      if (m) {
        const meta = [];
        if (email) meta.push(email);
        if (tel) meta.push(tel);
        m.textContent = meta.join(" • ");
      }
    } catch {}
  }

  function setHeaderSearchVisible(show) { if (hdrSearch) hdrSearch.style.display = show ? "" : "none"; }

  // Execute inline <script> tags that arrive with a partial
  function runInlineScripts(root) {
    if (!root) return;
    const scripts = Array.from(root.querySelectorAll("script"));
    for (const old of scripts) {
      const s = document.createElement("script");
      if (old.src) s.src = old.src; else s.textContent = old.textContent || "";
      if (old.type) s.type = old.type;
      old.parentNode.replaceChild(s, old);
    }
  }

  // ---- Hash helpers ----
  function sectionFromHash() {
    const h = (location.hash || "").replace(/^#/, "").trim();
    return h || "system-status";
  }

  function setActiveInSidebar(section) {
    if (!sidebar) return;
    const links = sidebar.querySelectorAll("a[data-partial], a[data-section]");
    links.forEach(a => {
      const sect = a.getAttribute("data-partial") || a.getAttribute("data-section");
      if (sect === section) a.classList.add("active");
      else a.classList.remove("active");
    });
  }

  window.addEventListener("hashchange", () => {
    const sect = sectionFromHash();
    setActiveInSidebar(sect);
    loadSection(sect);
  });

  // ---- Section loader ----
  async function loadSection(section) {
    const hasOwnSearch = new Set(["orders", "users", "items", "myorders", "dispatch"]);
    setHeaderSearchVisible(!hasOwnSearch.has(section));

    if (section === "myorders") {
      const url = "/myaccount/userdash.html";
      content.innerHTML = `
        <div style="height:calc(100vh - 130px);">
          <iframe id="myorders-embed"
                  src="${url}"
                  style="width:100%;height:100%;border:0;border-radius:8px;background:#fff;"></iframe>
        </div>
      `;
      const iframe = content.querySelector("#myorders-embed");
      window.addEventListener("message", (e) => {
        if (e?.data && e.data.type === "resize-embed" && typeof e.data.height === "number") {
          iframe.style.height = Math.max(300, e.data.height) + "px";
        }
      });
      setHeaderSearchVisible(false);
      return;
    }

    try {
      const res = await fetch(`/partials/${section}.html?v=${Date.now()}`);
      content.innerHTML = res.ok ? await res.text() : `<div class="p-3"></div>`;

      // For Dispatch partials, ensure adapter is loaded before running inline script
      if (section === "dispatch" && typeof window.WattSunAdminData === "undefined") {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "/admin/js/data-adapter.js";
          s.onload = resolve;
          s.onerror = reject;
          document.body.appendChild(s);
        }).catch(() => console.warn("Failed to load data-adapter.js"));
      }

      runInlineScripts(content);
      window.dispatchEvent(new CustomEvent("admin:partial-loaded", { detail: { name: section }}));
      window.dispatchEvent(new CustomEvent("admin:section-activated", { detail: { name: section }}));
    } catch {
      content.innerHTML = `<div class="p-3"></div>`;
    }
  }

  // ---- Profile hydration ----
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
    const elLast  = content.querySelector("#lastLogin");

    if (elName)  elName.textContent  = name;
    if (elEmail) elEmail.textContent = email;
    if (elRole)  elRole.textContent  = role;
    if (elLast)  elLast.textContent  = `Last login: ${last}`;

    const pfN = content.querySelector("#pf-name");
    const pfE = content.querySelector("#pf-email");
    const pfP = content.querySelector("#pf-phone");
    if (pfN) pfN.value = info.fullName || info.name || "";
    if (pfE) pfE.value = email;
    if (pfP) pfP.value = phone;
  }

  // ---- Sidebar nav → partial loader ----
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

  // ---- Boot ----
  const u = getUser();
  if (u) { updateHeaderUser(u); setUserCtx(u); }
  setHeaderSearchVisible(true);
  const initial = sectionFromHash();
  setActiveInSidebar(initial);
  loadSection(initial);
});
