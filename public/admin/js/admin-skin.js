/* WattSun Admin — Single Partial Loader + Global Create Actions */
(() => {
  const VERSION = (window.__ADMIN_VERSION__ || "0");
  const contentEl = document.getElementById("admin-content");
  const navLinks = Array.from(document.querySelectorAll(".admin-nav .nav-link"));
  const hardRefreshBtn = document.getElementById("hard-refresh");

  // -------------------------------
  // Helpers
  // -------------------------------
  function setActive(link) {
    navLinks.forEach(a => a.classList.toggle("is-active", a === link));
  }

  // Execute <script> tags inside a container that was set via innerHTML
  function executeInlineScripts(scope) {
    const scripts = Array.from(scope.querySelectorAll("script"));
    for (const old of scripts) {
      const s = document.createElement("script");
      // Copy attributes (type, src, etc.)
      for (const attr of old.attributes) s.setAttribute(attr.name, attr.value);
      s.textContent = old.textContent; // inline code
      old.parentNode.replaceChild(s, old); // trigger execution
    }
  }

  function findNavLinkByPartial(id) {
    return navLinks.find(a => a.getAttribute("data-partial") === id) || null;
  }

  async function loadPartial(id, url) {
    if (!contentEl) return;
    contentEl.setAttribute("aria-busy", "true");
    contentEl.innerHTML = `<div class="loading"><span class="spinner"></span><span>Loading…</span></div>`;

    const bust = url.includes("?") ? `&v=${VERSION}` : `?v=${VERSION}`;
    const finalUrl = `${url}${bust}`;

    try {
      const res = await fetch(finalUrl, { credentials: "same-origin" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const html = await res.text();
      contentEl.innerHTML = html;

      // IMPORTANT: run any inline scripts contained in the fragment
      executeInlineScripts(contentEl);

      contentEl.removeAttribute("aria-busy");
      const evt = new CustomEvent("admin:partial-loaded", { detail: { id } });
      window.dispatchEvent(evt);
    } catch (err) {
      console.error("[admin-skin] failed to load partial", id, err);
      contentEl.innerHTML = `
        <div class="card">
          <div class="card-header">Failed to load</div>
          <div class="card-body">
            <p>Could not load <code>${id}</code>. Please check the Network tab.</p>
            <pre style="white-space:pre-wrap;color:#b91c1c;">${String(err)}</pre>
          </div>
        </div>
      `;
      contentEl.removeAttribute("aria-busy");
    }
  }

  // Public API (if needed elsewhere)
  window.AdminSkin = { loadPartial };

  // -------------------------------
  // Nav wiring
  // -------------------------------
  navLinks.forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const id = link.getAttribute("data-partial");
      const url = link.getAttribute("data-url");
      setActive(link);
      loadPartial(id, url);
      history.replaceState({ id }, "", `#${id}`);
    });
  });

  if (hardRefreshBtn) {
    hardRefreshBtn.addEventListener("click", () => {
      const active = document.querySelector(".admin-nav .nav-link.is-active");
      const id = active?.getAttribute("data-partial") || "system-status";
      const url = active?.getAttribute("data-url") || "/partials/system-status.html";
      loadPartial(id, url);
    });
  }

  // Initial load (hash or first link)
  const initialId =
    (location.hash && location.hash.slice(1)) ||
    document.querySelector(".admin-nav .nav-link.is-active")?.getAttribute("data-partial") ||
    "system-status";
  const initialLink = findNavLinkByPartial(initialId) || navLinks[0];
  if (initialLink) {
    setActive(initialLink);
    loadPartial(initialLink.getAttribute("data-partial"), initialLink.getAttribute("data-url"));
  }

  // ============================================================
  // Global "Create" Actions (Add Order / Add Item)
  // ============================================================
  // We emit window.dispatchEvent(new CustomEvent('admin:create', { detail: { type:'order'|'item', source:'orders'|'items'|'dispatch' } }))
  // from page buttons. This central handler decides the UX (route vs modal).

  let pendingCreateIntent = null; // { type:'order'|'item' , source?: string }

  function navigateTo(partialId) {
    const link = findNavLinkByPartial(partialId);
    if (!link) return false;
    setActive(link);
    loadPartial(partialId, link.getAttribute("data-url"));
    history.replaceState({ id: partialId }, "", `#${partialId}`);
    return true;
    }

  async function ensureOrdersModal() {
    // If the dialog already exists, we’re done.
    if (document.getElementById("orderEditDialog")) return true;

    try {
      // Fetch and inject the modal partial once.
      const res = await fetch(`/partials/orders-modal.html?v=${VERSION}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const html = await res.text();

      // Create a container, inject, and execute inline scripts if any.
      const wrap = document.createElement("div");
      wrap.innerHTML = html;
      document.body.appendChild(wrap);
      executeInlineScripts(wrap);

      return !!document.getElementById("orderEditDialog");
    } catch (err) {
      console.error("[admin-skin] ensureOrdersModal failed:", err);
      return false;
    }
  }

  async function openOrderCreate() {
    const ok = await ensureOrdersModal();
    if (!ok) {
      window.toast && toast("Create Order UI not available", "error");
      return;
    }
    const dlg = /** @type {HTMLDialogElement|null} */ (document.getElementById("orderEditDialog"));
    if (!dlg) return;

    // Reset basic fields if present
    const status = dlg.querySelector("#editStatus");
    const driver = dlg.querySelector("#editDriver");
    const notes  = dlg.querySelector("#editNotes");

    if (status) status.value = "Pending";
    if (driver) driver.value = "";
    if (notes)  notes.value = "";

    dlg.setAttribute("data-mode", "create");
    // If <dialog>, use showModal(); otherwise fall back to open attribute
    if (typeof dlg.showModal === "function") {
      dlg.showModal();
    } else {
      dlg.setAttribute("open", "");
    }
  }

  // Handle create intents when a partial finishes loading (useful when we route first)
  window.addEventListener("admin:partial-loaded", (e) => {
    const id = e.detail?.id;
    if (!pendingCreateIntent) return;

    // If we navigated to Orders because of "order" creation, open the dialog now.
    if (pendingCreateIntent.type === "order" && id === "orders") {
      // Delay a tick to allow any inline scripts to attach listeners.
      setTimeout(() => openOrderCreate(), 0);
      pendingCreateIntent = null;
    }

    // For "item", you may want to open a similar modal or reveal a create panel
    // Here we simply emit a page-scoped event that Items code can listen to.
    if (pendingCreateIntent?.type === "item" && id === "items") {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("items:create"));
        pendingCreateIntent = null;
      }, 0);
    }
  });

  // Main global handler (buttons on pages fire this)
  window.addEventListener("admin:create", (evt) => {
    const { type, source } = evt.detail || {};
    if (!type) return;

    if (type === "order") {
      // Strategy: navigate to Orders, ensure modal, open in create mode.
      pendingCreateIntent = { type, source };
      const ok = navigateTo("orders");
      if (!ok) {
        // If navigation isn’t possible (link missing), try opening directly.
        openOrderCreate();
        pendingCreateIntent = null;
      }
      return;
    }

    if (type === "item") {
      // Strategy: navigate to Items. Items code can listen for "items:create".
      pendingCreateIntent = { type, source };
      const ok = navigateTo("items");
      if (!ok) {
        // As a fallback just notify
        window.toast && toast("Open Item creator", "info");
        pendingCreateIntent = null;
      }
      return;
    }

    // Unknown type
    window.toast && toast(`Unknown create type: ${type}`, "error");
  });
})();

// --- Safe Logout wiring (append-only, non-breaking) ---
(function () {
  function wireLogout() {
    var btn = document.getElementById('btn-logout');
    if (!btn) return;
    btn.addEventListener('click', function () {
      try { if (window.localStorage && localStorage.clear) localStorage.clear(); } catch (e) {}
      try { if (window.sessionStorage && sessionStorage.clear) sessionStorage.clear(); } catch (e) {}
      try {
        var names = ['connect.sid','sid'];
        var all = (document.cookie || '').split(';');
        for (var i=0;i<all.length;i++) {
          var kv = all[i].split('=');
          var name = (kv[0] || '').trim();
          if (names.indexOf(name) !== -1) {
            document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
          }
        }
      } catch (e) {}
      window.location.href = '/public/index.html';
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireLogout, { once:true });
  } else {
    wireLogout();
  }
})();
