/* WattSun Admin — Single Partial Loader + Global Create Actions */
(() => {
  // ------------------------------------------------------------
  // A) Fingerprint: confirm the patched file is actually running
  // ------------------------------------------------------------
  if (!window.__ADMIN_SKIN_PATCHED__) {
    window.__ADMIN_SKIN_PATCHED__ = "legacy-guard-2025-09-10";
    try { console.info("[admin-skin] Patched build active:", window.__ADMIN_SKIN_PATCHED__); } catch (_){}
  }

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

  // -------------------------------
  // B) Disable legacy injector (no-op)
  // -------------------------------
  function ensureOrdersModal() {
    // Legacy injector disabled: we no longer fetch /public/partials/orders-modal.html
    // View/Edit live inline in dashboard; Add is handled by orders-add.html + orders-add.js.
    return true;
  }
  // Keep a harmless stub so other code doesn't explode
  window.ensureOrdersModal = ensureOrdersModal;

  // -------------------------------
  // Open Add using the new flow (never touch View/Edit)
  // -------------------------------
  async function openOrderCreate() {
    // Prefer the dedicated Add module if available
    if (window.wattsunOrdersAdd && typeof window.wattsunOrdersAdd.open === "function") {
      window.wattsunOrdersAdd.open();
      return;
    }

    // Try a page trigger that existing code wires up
    const trigger =
      document.querySelector('[data-action="add-order"]') ||
      document.querySelector('[data-modal-target="#orderAddModal"]');
    if (trigger) {
      trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      return;
    }

    // Fallback: open the modal directly if present
    const add = document.getElementById("orderAddModal");
    if (add) {
      if (typeof add.showModal === "function") add.showModal();
      else add.classList.remove("hidden");
      return;
    }

    if (typeof window.toast === "function") window.toast("Add Order UI not available", "error");
  }

  // Handle create intents when a partial finishes loading (useful when we route first)
  window.addEventListener("admin:partial-loaded", (e) => {
    const id = e.detail?.id;
    if (!pendingCreateIntent) return;

    if (pendingCreateIntent.type === "order" && id === "orders") {
      setTimeout(() => openOrderCreate(), 0);
      pendingCreateIntent = null;
    }

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
      pendingCreateIntent = { type, source };
      const ok = navigateTo("orders");
      if (!ok) {
        openOrderCreate();
        pendingCreateIntent = null;
      }
      return;
    }

    if (type === "item") {
      pendingCreateIntent = { type, source };
      const ok = navigateTo("items");
      if (!ok) {
        if (typeof window.toast === "function") window.toast("Open Item creator", "info");
        pendingCreateIntent = null;
      }
      return;
    }

    if (typeof window.toast === "function") window.toast(`Unknown create type: ${type}`, "error");
  });

  // ------------------------------------------------------------
  // C) Legacy guard: block or remove old combined modal injection
  // ------------------------------------------------------------

  // C1) Remove duplicate/legacy modals if something appends them
  (function legacyModalObserver(){
    const isLegacyBundleNode = (node) => {
      if (!(node instanceof Element)) return false;
      // Heuristics: old bundle used these ids/classes/tag shapes.
      // Keep this conservative: we only remove if it would create duplicates.
      const legacyIds = ["orderViewDialog", "orderEditDialog"]; // historic ids
      for (const id of legacyIds) {
        if (node.id === id) return true;
        if (node.querySelector && node.querySelector(`#${id}`)) return true;
      }
      // Also detect duplicate of current IDs, but only if one already exists
      const currentIds = ["orderViewModal", "orderEditModal"];
      for (const id of currentIds) {
        if (node.id === id) {
          if (document.getElementById(id)) return true; // duplicate
        }
        if (node.querySelector && node.querySelector(`#${id}`)) {
          if (document.getElementById(id)) return true; // duplicate contained within appended fragment
        }
      }
      return false;
    };

    const pruneIfLegacy = (node) => {
      if (!(node instanceof Element)) return;
      if (!isLegacyBundleNode(node)) return;

      // If this would create duplicates, remove the newcomer
      const ids = ["orderViewModal", "orderEditModal", "orderViewDialog", "orderEditDialog"];
      const dup = ids.some(id => {
        const countNow = document.querySelectorAll(`#${id}`).length;
        const countWithNode =
          countNow + (node.id === id ? 1 : (node.querySelector ? node.querySelectorAll(`#${id}`).length : 0));
        return countWithNode > 1;
      });

      if (dup) {
        try {
          node.remove();
          console.warn("[admin-skin] Removed legacy/duplicate orders modal markup injected at runtime.");
        } catch (_){}
      }
    };

    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        (m.addedNodes || []).forEach(pruneIfLegacy);
        if (m.target) pruneIfLegacy(m.target);
      }
    });
    try { mo.observe(document.documentElement || document.body, { childList: true, subtree: true }); } catch (_){}
  })();

  // C2) Soft-patch fetch for the exact legacy bundle URL only
  (function patchFetchForLegacyModal(){
    const LEGACY_URL = "/public/partials/orders-modal.html";
    if (!("fetch" in window)) return;
    const origFetch = window.fetch.bind(window);
    window.fetch = function(input, init) {
      try {
        const url = (typeof input === "string") ? input : (input && input.url ? input.url : "");
        if (url && (url.indexOf(LEGACY_URL) !== -1)) {
          console.warn("[admin-skin] Blocked fetch of legacy orders-modal.html");
          const headers = new Headers({ "Content-Type": "text/html; charset=utf-8" });
          const body = "<!-- blocked legacy modal -->";
          return Promise.resolve(new Response(body, { status: 200, headers }));
        }
      } catch (_){}
      return origFetch(input, init);
    };
  })();

})();

// --- Topbar Home/Logout: resilient injector (idempotent) ---
(function(){
  function ensureTopbarButtons(root){
    try {
      var bar = root && root.querySelector ? root.querySelector('.topbar-actions') : document.querySelector('.topbar-actions');
      if (!bar) return;
      // If already present, done.
      var hasHome = !!document.getElementById('btn-home');
      var hasLogout = !!document.getElementById('btn-logout');
      if (hasHome && hasLogout) return;

      // Create Home
      if (!hasHome) {
        var home = document.createElement('a');
        home.id = 'btn-home';
        home.className = 'btn';
        home.href = '/public/index.html';
        home.title = 'Go to site Home';
        home.textContent = 'Home';
        // Prefer to insert before Refresh if exists
        var refresh = bar.querySelector('#hard-refresh');
        if (refresh && refresh.parentNode === bar) {
          bar.insertBefore(home, refresh);
        } else {
          bar.appendChild(home);
        }
      }

      // Create Logout
      if (!hasLogout) {
        var logout = document.createElement('button');
        logout.id = 'btn-logout';
        logout.type = 'button';
        logout.className = 'btn btn-danger';
        logout.title = 'Log out';
        logout.textContent = 'Logout';
        var refresh2 = bar.querySelector('#hard-refresh');
        if (refresh2 && refresh2.parentNode === bar) {
          bar.insertBefore(logout, refresh2);
        } else {
          bar.appendChild(logout);
        }
      }
    } catch(e) { /* no-op */ }
  }

  // Run once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ ensureTopbarButtons(); }, { once:true });
  } else {
    ensureTopbarButtons();
  }

  // Observe mutations to re-ensure after partial reloads
  try {
    var obsTarget = document.body;
    var mo = new MutationObserver(function(muts){
      for (var i=0;i<muts.length;i++){
        var m = muts[i];
        if (m.type === 'childList') {
          // If a new topbar-actions appears or children changed, re-ensure
          if ([].some.call(m.addedNodes || [], function(n){ return n.querySelector && n.querySelector('.topbar-actions'); })) {
            ensureTopbarButtons(document);
          }
          if (m.target && m.target.classList && m.target.classList.contains('topbar-actions')) {
            ensureTopbarButtons(document);
          }
        }
      }
    });
    mo.observe(obsTarget, { childList: true, subtree: true });
  } catch(e) { /* ignore */ }
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
    document.addEventListener('DOMContentLoaded', wireLogout);
  } else {
    wireLogout();
  }
  // Also rewire if the button is re-inserted later
  document.addEventListener('click', function(e){
    if (e && e.target && e.target.id === 'btn-logout') {
      // handler is already attached by addEventListener; this is a safeguard.
    }
  });
})();
