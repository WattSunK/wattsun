// /public/admin/js/dashboard.js
document.addEventListener("DOMContentLoaded", () => {
  const content  = document.getElementById("admin-content")
                  || document.getElementById("adminContent")
                  || document.getElementById("content");
  const sidebar  = document.querySelector(".sidebar nav,[data-admin-sidebar]");
  const hdrSearch= document.querySelector(".header-search");

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
    if (!content) { console.error("No content container found (#admin-content/#adminContent/#content)."); return; }

    const hasOwnSearch = new Set(["orders", "users", "items", "myorders", "dispatch"]);
    setHeaderSearchVisible(!hasOwnSearch.has(section));

    // Allow branches to prefetch and hand HTML to the generic renderer
    let prefetchedHTML = null;
    let prefetchedName = null;

    // MYORDERS — special handler, then exit
    if (section === "myorders") {
      const url = "./myaccount/userdash.html";
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

    // ITEMS — prefetch + controller, then let generic path render
    if (section === "items") {
      try {
        const res = await fetch(`./partials/items.html?v=${Date.now()}`);
        prefetchedHTML = res.ok ? await res.text() : `<div class="p-3"></div>`;
        prefetchedName = "items";
      } catch {
        prefetchedHTML = `<div class="p-3"></div>`;
        prefetchedName = "items";
      }
      await ensureScript("./admin/js/admin-items.js", () => window.AdminItems && typeof window.AdminItems.init === "function");
      // no return; generic renderer will inject HTML then we call init
    }

    // DEFAULT (and every other section, including Dispatch)
    try {
      let html;
      if (prefetchedHTML && prefetchedName === section) {
        html = prefetchedHTML;
      } else {
        const res = await fetch(`./partials/${section}.html?v=${Date.now()}`);
        html = res.ok ? await res.text() : `<div class="p-3"></div>`;
      }
      content.innerHTML = html;

      if (section === "dispatch" && typeof window.WattSunAdminData === "undefined") {
        await new Promise((resolve) => {
          const s = document.createElement("script");
          s.src = "./admin/js/data-adapter.js";
          s.onload = resolve;
          s.onerror = resolve;
          document.body.appendChild(s);
        });
      }

      runInlineScripts(content);
      window.dispatchEvent(new CustomEvent("admin:partial-loaded", { detail: { name: section }}));

      // Finalize Items init now that DOM is present
      if (section === "items" && window.AdminItems && typeof window.AdminItems.init === "function") {
        window.AdminItems.init();
      }

      window.dispatchEvent(new CustomEvent("admin:section-activated", { detail: { name: section }}));
    } catch {
      content.innerHTML = `<div class="p-3"></div>`;
    }
  }

  const initial = sectionFromHash();
  setActiveInSidebar(initial);
  loadSection(initial);
});
