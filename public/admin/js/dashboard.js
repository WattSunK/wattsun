// /public/admin/js/dashboard.js
document.addEventListener("DOMContentLoaded", () => {
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
        s.onerror = resolve;
        document.body.appendChild(s);
      });
    } catch (e) {
      console.warn("ensureScript error:", src, e);
    }
  }

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

  function setHeaderSearchVisible(show) { if (hdrSearch) hdrSearch.style.display = show ? "" : "none"; }

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

  async function loadSection(section) {
    if (!getContentRoot()) { console.error("No content container to inject"); return; }

    const hasOwnSearch = new Set(["orders", "users", "items", "myorders", "dispatch"]);
    setHeaderSearchVisible(!hasOwnSearch.has(section));

    let prefetchedHTML = null;
    let prefetchedName = null;

    // MYORDERS — special iframe view (kept)
    if (section === "myorders") {
      const url = "./myaccount/userdash.html";
      getContentRoot().innerHTML = `
        <div style="height:calc(100vh - 130px);">
          <iframe id="myorders-embed"
                  src="${url}"
                  style="width:100%;height:100%;border:0;border-radius:8px;background:#fff;"></iframe>
        </div>
      `;
      const iframe = getContentRoot().querySelector("#myorders-embed");
      window.addEventListener("message", (e) => {
        if (e?.data && e.data.type === "resize-embed" && typeof e.data.height === "number") {
          iframe.style.height = Math.max(300, e.data.height) + "px";
        }
      });
      setHeaderSearchVisible(false);
      return;
    }

    // ITEMS — prefetch + controller; do NOT early-return
    if (section === "items") {
      prefetchedHTML = await fetchPartial("items");
      prefetchedName = "items";
      await ensureScript("./admin/js/admin-items.js", () => window.AdminItems && typeof window.AdminItems.init === "function");
      // init will be called after DOM injection below
    }

    // DEFAULT / GENERIC (includes Dispatch, System Status, etc.)
    try {
      const html = (prefetchedHTML && prefetchedName === section)
        ? prefetchedHTML
        : await fetchPartial(section);
      getContentRoot().innerHTML = html;

      if (section === "dispatch" && typeof window.WattSunAdminData === "undefined") {
        await ensureScript("./admin/js/data-adapter.js", () => typeof window.WattSunAdminData !== "undefined");
      }

      runInlineScripts(getContentRoot());
      window.dispatchEvent(new CustomEvent("admin:partial-loaded", { detail: { name: section }}));

      if (section === "items" && window.AdminItems && typeof window.AdminItems.init === "function") {
        window.AdminItems.init();
      }

      window.dispatchEvent(new CustomEvent("admin:section-activated", { detail: { name: section }}));
    } catch (e) {
      console.error("Generic load error:", section, e);
      getContentRoot().innerHTML = `<div class="p-3 text-danger">Failed to load section: ${section}</div>`;
    }
  }

  const initial = sectionFromHash();
  setActiveInSidebar(initial);
  loadSection(initial);
});
