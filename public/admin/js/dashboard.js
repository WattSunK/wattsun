// public/admin/js/dashboard.js
// Tiny partial loader/router using RELATIVE paths.
(function () {
  "use strict";
  function $(s, r=document){ return r.querySelector(s); }

  const SLOT = "#adminContent";
  const attr = "data-partial"; // e.g. <a data-partial="orders">Orders</a>

  async function loadPartial(name) {
    const host = document.querySelector(SLOT);
    if (!host) return;
    const url = `./partials/${name}.html`; // relative to /public
    host.setAttribute("aria-busy", "true");
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const html = await res.text();
      host.innerHTML = html;
      window.dispatchEvent(new CustomEvent("admin:partial-loaded", { detail: { name } }));
    } catch (e) {
      console.error("[dashboard] loadPartial failed:", e);
      host.innerHTML = `<div class="admin-error">Failed to load: ${name}</div>`;
    } finally {
      host.removeAttribute("aria-busy");
    }
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest(`a[${attr}]`);
    if (!a) return;
    const name = a.getAttribute(attr);
    if (!name) return;
    e.preventDefault();
    loadPartial(name);
    document.querySelectorAll(`a[${attr}]`).forEach(el => el.classList.toggle("is-active", el === a));
    history.replaceState(null, "", `#${name}`);
  });

  // If user visits with a #hash, load that partial
  function bootFromHash() {
    const h = (location.hash || "").replace(/^#/, "");
    if (!h) return;
    const link = document.querySelector(`a[${attr}="${h}"]`);
    if (link) link.click(); else loadPartial(h);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootFromHash);
  } else {
    bootFromHash();
  }
})();
