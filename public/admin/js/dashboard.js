// /public/admin/js/dashboard.js
document.addEventListener("DOMContentLoaded", () => {
  const content  = document.getElementById("admin-content") || document.getElementById("adminContent");
  const sidebar  = document.querySelector(".sidebar nav");
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
      s.onerror = resolve;
      document.body.appendChild(s);
    });
  }

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

    // NEW: explicit Items loader
    if (section === "items") {
      try {
        const res = await fetch(`/partials/items.html?v=${Date.now()}`);
        content.innerHTML = res.ok ? await res.text() : `<div class="p-3"></div>`;
      } catch {
        content.innerHTML = `<div class="p-3"></div>`;
      }
      await ensureScript("/public/admin/js/admin-items.js", () => window.AdminItems && typeof window.AdminItems.init === "function");
      if (window.AdminItems && typeof window.AdminItems.init === "function") {
        window.AdminItems.init();
      }
      window.dispatchEvent(new CustomEvent("admin:partial-loaded", { detail: { name: "items" }}));
      window.dispatchEvent(new CustomEvent("admin:section-activated", { detail: { name: "items" }}));
      return;
    }

    // existing special case for Dispatch (ensures adapter)
    try {
      const res = await fetch(`/partials/${section}.html?v=${Date.now()}`);
      content.innerHTML = res.ok ? await res.text() : `<div class="p-3"></div>`;

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

  // ---- first load
  const initial = sectionFromHash();
  setActiveInSidebar(initial);
  loadSection(initial);
});
