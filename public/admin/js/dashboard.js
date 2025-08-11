// public/admin/js/dashboard.js
// Tiny partial loader/router. Safe: does not alter layout or CSS.
// If your nav links have data-partial="orders" etc, it will load
// /public/partials/<name>.html into #adminContent.
// Controllers auto-init themselves after insertion.
(function () {
  "use strict";
  function $(s, r=document){ return r.querySelector(s); }
  function on(el, ev, fn){ el && el.addEventListener(ev, fn); }

  const SLOT = "#adminContent";
  const attr = "data-partial"; // e.g. <a data-partial="orders">Orders</a>

  async function loadPartial(name) {
    const host = document.querySelector(SLOT);
    if (!host) return;
    const url = `/public/partials/${name}.html`;
    host.setAttribute("aria-busy", "true");
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const html = await res.text();
      host.innerHTML = html;
      // Controllers with auto-init will attach themselves now.
      window.dispatchEvent(new CustomEvent("admin:partial-loaded", { detail: { name } }));
    } catch (e) {
      console.error("[dashboard] loadPartial failed:", e);
      host.innerHTML = `<div class="admin-error">Failed to load: ${name}</div>`;
    } finally {
      host.removeAttribute("aria-busy");
    }
  }

  function wireNav() {
    document.addEventListener("click", (e) => {
      const a = e.target.closest(`a[${attr}]`);
      if (!a) return;
      const name = a.getAttribute(attr);
      if (!name) return;
      e.preventDefault();
      loadPartial(name);
      // Mark active link if desired
      document.querySelectorAll(`a[${attr}]`).forEach(el => el.classList.toggle("is-active", el === a));
      history.replaceState(null, "", `#${name}`);
    });
  }

  function bootFromHash() {
    const h = (location.hash || "").replace(/^#/, "");
    if (!h) return;
    const a = document.querySelector(`a[${attr}="${h}"]`);
    if (a) a.click();
    else loadPartial(h);
  }

  function init() {
    wireNav();
    bootFromHash();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
