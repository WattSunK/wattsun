/* WattSun Admin — Single Partial Loader + Global Create Actions */
(() => {
  const VERSION = (window.__ADMIN_VERSION__ || "0");
  const contentEl = document.getElementById("admin-content");
  const WS_DIAG = /[?&]__diag=1\b/.test(location.search || "");
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
      try {
        const s = document.createElement("script");
        for (const attr of old.attributes) s.setAttribute(attr.name, attr.value);
        s.textContent = old.textContent;
        (document.body || document.documentElement).appendChild(s);
        old.remove();
      } catch (e) {
        console.error("[admin-skin] inline script error", e);
      }
    }
  }

  function redispatchClick(target) {
    // Re-fire a synthetic click that bubbles and is cancelable
    const evt = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
    target.dispatchEvent(evt);
  }

  function findNavLinkByPartial(id) {
    return navLinks.find(a => a.getAttribute("data-partial") === id) || null;
  }

  async function fetchWithTimeout(url, options = {}, ms = 10000) {
    return Promise.race([
      fetch(url, options),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms))
    ]);
  }

  async function loadPartial(id, url) {
    if (!contentEl) return;
    // Proactively close any open modals/sheets before swapping views
    try {
      const openDlgs = Array.from(document.querySelectorAll('dialog[open]'));
      openDlgs.forEach(d => { try { d.close(); } catch { d.removeAttribute('open'); } });
      const openSheets = Array.from(document.querySelectorAll('.modal.show, .modal[aria-hidden="false"]'));
      openSheets.forEach(m => { m.classList.remove('show'); m.setAttribute('aria-hidden','true'); });
      document.documentElement.classList.remove('ws-modal-open');
      document.body.classList.remove('ws-modal-open');
    } catch(_){}
    contentEl.setAttribute("aria-busy", "true");
    contentEl.innerHTML = `<div class="loading"><span class="spinner"></span><span>Loading…</span></div>`;

    const bust = url.includes("?") ? `&v=${VERSION}` : `?v=${VERSION}`;
    const finalUrl = `${url}${bust}`;

    try {
      const res = await fetchWithTimeout(finalUrl, { credentials: "same-origin" }, 12000);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const html = await res.text();
      contentEl.innerHTML = html;
      // Execute inline scripts contained in the partial (guards inside executeInlineScripts)
      if (!WS_DIAG) {
        executeInlineScripts(contentEl);
      }
      contentEl.removeAttribute("aria-busy");
      window.dispatchEvent(new CustomEvent("admin:partial-loaded", { detail: { id } }));
    } catch (err) {
      console.error("[admin-skin] failed to load partial", id, err);
      contentEl.innerHTML = `
        <div class="card">
          <div class="card-header">Failed to load</div>
          <div class="card-body">
            <p>Could not load <code>${id}</code>. Please check the Network tab.</p>
            <pre style="white-space:pre-wrap;color:#b91c1c;">${String(err)}</pre>
            <div style="margin-top:10px;">
              <button id="retry-partial" class="btn">Retry</button>
            </div>
          </div>
        </div>
      `;
      contentEl.removeAttribute("aria-busy");
      document.getElementById('retry-partial')?.addEventListener('click', () => loadPartial(id, url));
    }
  }

  // Public API
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

  // Initial load
  const initialId =
    (location.hash && location.hash.slice(1)) ||
    document.querySelector(".admin-nav .nav-link.is-active")?.getAttribute("data-partial") ||
    "system-status";
  const initialLink = findNavLinkByPartial(initialId) || navLinks[0];
  if (initialLink) {
    setActive(initialLink);
    loadPartial(initialLink.getAttribute("data-partial"), initialLink.getAttribute("data-url"));
    // Safety: if still busy after 4s, retry once
    setTimeout(() => {
      try {
        if (contentEl && contentEl.getAttribute("aria-busy") === "true") {
          const id = initialLink.getAttribute("data-partial");
          const url = initialLink.getAttribute("data-url");
          console.warn("[admin-skin] retrying initial partial load", id);
          loadPartial(id, url);
        }
      } catch(_){/* ignore */}
    }, 4000);
  }

  // ============================================================
  // Global "Create" Actions (Add Order / Add Item)
  // ============================================================
  let pendingCreateIntent = null;

  function navigateTo(partialId) {
    const link = findNavLinkByPartial(partialId);
    if (!link) return false;
    setActive(link);
    loadPartial(partialId, link.getAttribute("data-url"));
    history.replaceState({ id: partialId }, "", `#${partialId}`);
    return true;
  }

  // ---- Load new Orders modal partial on demand ----
  async function ensureOrdersModal() {
    const hasEdit = document.querySelector('#orderEditModal');
    const hasView = document.querySelector('#orderViewModal');
    if (hasEdit && hasView) return true;

    const url = `/partials/orders-modal.html?v=${encodeURIComponent(VERSION)}`;
    try {
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) throw new Error(`[ensureOrdersModal] ${res.status} ${res.statusText}`);

      const html = await res.text();
      const tmp = document.createElement('div');
      tmp.innerHTML = html;

      const editDlg = tmp.querySelector('#orderEditModal');
      const viewDlg = tmp.querySelector('#orderViewModal');

      if (editDlg) document.body.appendChild(editDlg);
      if (viewDlg) document.body.appendChild(viewDlg);

      executeInlineScripts(tmp);

      return !!document.querySelector('#orderEditModal');
    } catch (err) {
      console.error('[ensureOrdersModal] failed to load orders-modal partial', err);
      return false;
    }
  }
  window.ensureOrdersModal = ensureOrdersModal;

  // ---- NEW: Preflight for Edit/View clicks (capture phase) ----
  document.addEventListener('click', async (e) => {
    const t = e.target;
    const hit = t.closest?.('.btn-edit, .btn-view, [data-modal-target="#orderEditModal"], [data-modal-target="#orderViewModal"]');
    if (!hit) return;

    // If modals already present, let the controller proceed normally.
    if (document.querySelector('#orderEditModal') && document.querySelector('#orderViewModal')) return;

    // Block the original click, ensure modals, then re-dispatch the click.
    e.preventDefault();
    e.stopImmediatePropagation();
    e.stopPropagation();

    const ok = await ensureOrdersModal();
    if (!ok) {
      console.warn('[admin-skin] Could not ensure orders modals before open.');
      return;
    }
    // Re-fire the click so existing handlers (admin-orders.js) run as-is.
    redispatchClick(hit);
  }, true); // <-- capture=true so we run before other listeners

  // ---- Open Add using the new flow ----
  async function openOrderCreate() {
    if (window.wattsunOrdersAdd && typeof window.wattsunOrdersAdd.open === "function") {
      window.wattsunOrdersAdd.open();
      return;
    }
    const trigger =
      document.querySelector('[data-action="add-order"]') ||
      document.querySelector('[data-modal-target="#orderAddModal"]');
    if (trigger) {
      trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      return;
    }
    const add = document.getElementById("orderAddModal");
    if (add) {
      if (typeof add.showModal === "function") add.showModal();
      else add.classList.remove("hidden");
      return;
    }
    if (typeof window.toast === "function") window.toast("Add Order UI not available", "error");
  }

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
})();

// --- Topbar Home/Logout: resilient injector (idempotent) ---
(function(){
  if (typeof WS_DIAG !== 'undefined' && WS_DIAG) return; // disable in diagnostic mode
  function ensureTopbarButtons(root){
    try {
      var bar = root && root.querySelector ? root.querySelector('.topbar-actions') : document.querySelector('.topbar-actions');
      if (!bar) return;
      var hasHome = !!document.getElementById('btn-home');
      var hasLogout = !!document.getElementById('btn-logout');
      if (hasHome && hasLogout) return;

      if (!hasHome) {
        var home = document.createElement('a');
        home.id = 'btn-home';
        home.className = 'btn';
        home.href = '/public/index.html';
        home.title = 'Go to site Home';
        home.textContent = 'Home';
        var refresh = bar.querySelector('#hard-refresh');
        if (refresh && refresh.parentNode === bar) {
          bar.insertBefore(home, refresh);
        } else {
          bar.appendChild(home);
        }
      }

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
    } catch(e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ ensureTopbarButtons(); }, { once:true });
  } else {
    ensureTopbarButtons();
  }

  try {
    var obsTarget = document.body;
    var mo = new MutationObserver(function(muts){
      for (var i=0;i<muts.length;i++){
        var m = muts[i];
        if (m.type === 'childList') {
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
  } catch(e) {}
})();

// --- Safe Logout wiring ---
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
  document.addEventListener('click', function(e){
    if (e && e.target && e.target.id === 'btn-logout') { /* noop */ }
  });
})();

// --- Global modal open/close observer (covers custom shells) ---
(function(){
  function anyModalOpen(){
    try {
      if (document.querySelector('dialog[open]')) return true;
      if (document.querySelector('.modal.show')) return true;
      if (document.querySelector('.modal[aria-hidden="false"]')) return true;
      return false;
    } catch { return false; }
  }
  let rafPending = false;
  function syncLock(){
    if (rafPending) return; // throttle bursts
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      const open = anyModalOpen();
      const root = document.documentElement;
      if (open) { root.classList.add('ws-modal-open'); document.body.classList.add('ws-modal-open'); }
      else { root.classList.remove('ws-modal-open'); document.body.classList.remove('ws-modal-open'); }
    });
  }
  try {
    const mo = new MutationObserver(syncLock);
    // Only observe attribute changes related to dialogs/modals; avoid childList churn
    mo.observe(document.body, { attributes:true, subtree:true, attributeFilter:['open','aria-hidden','class'] });
    document.addEventListener('close', syncLock, true);
    document.addEventListener('keydown', function(e){ if (e.key==='Escape') setTimeout(syncLock,0); }, true);
    // initial
    syncLock();
  } catch(_){}
})();
