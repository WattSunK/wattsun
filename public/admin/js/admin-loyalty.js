/**
 * admin-loyalty.js
 *
 * Improved, self-contained admin UI module for loyalty withdrawals.
 * - Safe attach/detach lifecycle
 * - Centralized fetch with timeout + AbortController
 * - DOM-based rendering (no string innerHTML for rows)
 * - Delegated event handling and single listener cleanup
 * - Accessible actions menu (keyboard + ARIA) and modal focus trap
 *
 * Usage:
 *  - It auto-attaches if it finds #loyalty-admin-root on page load.
 *  - You can manually call: window.loyaltyAdmin.attach(rootElement) or .detach()
 *
 * Author: ChatGPT (GPT-5 Thinking mini)
 */

(function () {
  'use strict';

  // ------------------------------
  // Configuration / selectors
  // ------------------------------
  const ROOT_SELECTOR = '#loyalty-admin-root';
  const DEFAULT_TIMEOUT = 15_000; // ms
  const endpoints = {
    listWithdrawals: '/api/admin/withdrawals', // GET ?page=...&q=...
    action: (id, action) => `/api/admin/withdrawals/${encodeURIComponent(id)}/${action}`, // POST
    searchUsers: (q) => `/api/admin/users/search?q=${encodeURIComponent(q)}`, // GET
  };

  // ------------------------------
  // Module state
  // ------------------------------
  let attached = false;
  let currentRoot = null;
  let mo = null; // MutationObserver
  const _listeners = new Set(); // track added listeners for cleanup
  const controllers = new Set(); // track AbortControllers for cleanup

  // Debug hook (populated during attach)
  const debug = {
    lastRender: null,
    lastFetch: null,
  };

  // ------------------------------
  // Utility: listener tracking
  // ------------------------------
  function addListener(target, type, handler, opts) {
    target.addEventListener(type, handler, opts);
    _listeners.add({ target, type, handler, opts });
    return handler;
  }
  function removeAllListeners() {
    for (const { target, type, handler, opts } of Array.from(_listeners)) {
      try {
        target.removeEventListener(type, handler, opts);
      } catch (e) {
        // ignore
      }
    }
    _listeners.clear();
  }

  // ------------------------------
  // Utility: AbortController + fetch with timeout
  // ------------------------------
  function makeController(timeout = DEFAULT_TIMEOUT) {
    const c = new AbortController();
    if (timeout > 0) {
      const t = setTimeout(() => {
        try { c.abort(); } catch (_) {}
      }, timeout);
      // ensure timer removed when controller aborts/finished
      const cleanup = () => clearTimeout(t);
      c.signal.addEventListener('abort', cleanup, { once: true });
    }
    controllers.add(c);
    // remove from set when finished
    const removeFromSet = () => controllers.delete(c);
    c.signal.addEventListener('abort', removeFromSet, { once: true });
    return c;
  }

  async function fetchWithTimeout(url, opts = {}, timeout = DEFAULT_TIMEOUT) {
    const controller = makeController(timeout);
    const finalOpts = Object.assign({}, opts, { signal: controller.signal, credentials: 'same-origin' });
    debug.lastFetch = { url, opts: finalOpts, ts: Date.now() };
    try {
      const res = await fetch(url, finalOpts);
      return res;
    } catch (err) {
      if (err.name === 'AbortError') {
        const e = new Error('Request aborted');
        e.name = 'AbortError';
        throw e;
      }
      throw err;
    } finally {
      controllers.delete(controller);
    }
  }

  async function safeJsonFetch(url, opts = {}, timeout = DEFAULT_TIMEOUT) {
    const res = await fetchWithTimeout(url, opts, timeout);
    let data = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { data = await res.json(); } catch (e) { /* fallthrough */ }
    } else {
      // try text fallback
      try { const text = await res.text(); data = { text }; } catch (_) {}
    }
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      err.payload = data;
      throw err;
    }
    return data;
  }

  // ------------------------------
  // Helpers: DOM utilities and formatters
  // ------------------------------
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const k in attrs) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'style') node.style.cssText = attrs[k];
      else if (k === 'dataset') Object.assign(node.dataset, attrs[k]);
      else if (k.startsWith('aria-')) node.setAttribute(k, attrs[k]);
      else if (k === 'text') node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    }
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null) return;
      if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    });
    return node;
  }

  function clear(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function fmtInt(n) {
    if (n == null) return '—';
    const v = Number(n);
    if (Number.isNaN(v)) return String(n);
    return v.toLocaleString();
  }

  function emptyRow(cols, text = 'No results') {
    const tr = el('tr');
    const td = el('td', { colspan: cols, text });
    td.style.textAlign = 'center';
    tr.appendChild(td);
    return tr;
  }

  // ------------------------------
  // Rendering: withdrawals table
  // ------------------------------
  function createActionCell(id, status) {
    const st = String(status || '').toLowerCase();
    const canApprove = st === 'pending';
    const canReject = st === 'pending';
    const canMarkPaid = st === 'approved';

    const td = el('td');
    // button
    const btn = el('button', {
      type: 'button',
      class: 'ws-actions-trigger',
      'aria-haspopup': 'true',
      'aria-expanded': 'false',
      'aria-controls': `ws-actions-menu-${id}`,
      'data-id': id
    }, ['Actions ▾']);

    const menu = el('div', {
      id: `ws-actions-menu-${id}`,
      class: 'ws-actions-menu hidden',
      role: 'menu',
      tabindex: '-1',
      'aria-hidden': 'true',
      'data-id': id
    });

    function mkItem(text, cls, enabled = true) {
      const b = el('button', { type: 'button', class: cls, role: 'menuitem', tabindex: '-1', 'data-id': id }, [text]);
      if (!enabled) b.disabled = true;
      return b;
    }

    menu.appendChild(mkItem('Approve', 'ws-action-approve', canApprove));
    menu.appendChild(mkItem('Reject', 'ws-action-reject', canReject));
    menu.appendChild(mkItem('Mark Paid', 'ws-action-paid', canMarkPaid));

    const wrapper = el('div', { class: 'ws-actions', style: 'position:relative;display:inline-block' }, [btn, menu]);
    td.appendChild(wrapper);
    return td;
  }

  function renderWithdrawalsRows(tbody, rows) {
    if (!tbody) return;
    clear(tbody);
    if (!rows || rows.length === 0) {
      tbody.appendChild(emptyRow(9));
      return;
    }
    const frag = document.createDocumentFragment();
    for (const w of rows) {
      const id = w.id ?? w.withdrawal_id ?? w.withdrawalId ?? '—';
      const acct = w.account ?? w.account_id ?? w.accountId ?? '—';
      const user = w.user ?? w.user_email ?? w.email ?? (w.user_name ? `${w.user_name}` : '—');
      const pts = w.points ?? w.requested_points ?? 0;
      const st = w.status ?? '—';
      const req = w.requested_at ?? w.created_at ?? w.createdAt ?? '—';
      const dec = w.decided_at ?? w.decidedAt ?? '—';
      const paid = w.paid_at ?? w.paidAt ?? '—';

      const tr = el('tr', { dataset: { id } });
      tr.appendChild(el('td', {}, [id]));
      tr.appendChild(el('td', {}, [acct]));
      tr.appendChild(el('td', {}, [user]));
      tr.appendChild(el('td', {}, [fmtInt(pts)]));
      tr.appendChild(el('td', {}, [st]));
      tr.appendChild(el('td', {}, [req]));
      tr.appendChild(el('td', {}, [dec]));
      tr.appendChild(el('td', {}, [paid]));
      tr.appendChild(createActionCell(id, st));
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
    debug.lastRender = { type: 'withdrawals', count: rows.length, ts: Date.now() };
  }

  // ------------------------------
  // API helpers for the module
  // ------------------------------
  async function listWithdrawals({ page = 1, q = '' } = {}) {
    const url = `${endpoints.listWithdrawals}?page=${encodeURIComponent(page)}&q=${encodeURIComponent(q)}`;
    const data = await safeJsonFetch(url, { method: 'GET' }, DEFAULT_TIMEOUT);
    return data;
  }

  async function performAction(withdrawalId, action) {
    const url = endpoints.action(withdrawalId, action);
    const data = await safeJsonFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }, DEFAULT_TIMEOUT);
    return data;
  }

  // ------------------------------
  // UI Interactions: action menu handling (delegated)
  // ------------------------------
  function openMenu(trigger) {
    const id = trigger.dataset.id;
    const menu = currentRoot.querySelector(`.ws-actions-menu[data-id="${id}"]`);
    if (!menu) return;
    closeAllMenus();
    menu.classList.remove('hidden');
    menu.setAttribute('aria-hidden', 'false');
    trigger.setAttribute('aria-expanded', 'true');
    // focus first actionable item
    const first = menu.querySelector('button:not([disabled])');
    if (first) first.focus();
    // store opener to restore focus on close
    menu._opener = trigger;
  }

  function closeAllMenus() {
    if (!currentRoot) return;
    const menus = currentRoot.querySelectorAll('.ws-actions-menu');
    menus.forEach((m) => {
      m.classList.add('hidden');
      m.setAttribute('aria-hidden', 'true');
      const id = m.dataset.id;
      const trig = currentRoot.querySelector(`.ws-actions-trigger[data-id="${id}"]`);
      if (trig) trig.setAttribute('aria-expanded', 'false');
      if (m._opener) {
        try { m._opener.focus(); } catch (_) {}
        delete m._opener;
      }
    });
  }

  function onDocumentClick(e) {
    if (!currentRoot) return;
    const trg = e.target;
    // trigger to open/close
    const tOpen = trg.closest('.ws-actions-trigger');
    if (tOpen && currentRoot.contains(tOpen)) {
      const menu = currentRoot.querySelector(`.ws-actions-menu[data-id="${tOpen.dataset.id}"]`);
      if (menu && menu.classList.contains('hidden')) openMenu(tOpen);
      else {
        closeAllMenus();
      }
      e.preventDefault();
      return;
    }

    // action buttons inside menu (approve/reject/paid)
    const actionBtn = trg.closest('.ws-action-approve, .ws-action-reject, .ws-action-paid');
    if (actionBtn && currentRoot.contains(actionBtn)) {
      const id = actionBtn.dataset.id;
      if (!id) return;
      if (actionBtn.classList.contains('ws-action-approve')) return handleAction(id, 'approve');
      if (actionBtn.classList.contains('ws-action-reject')) return handleAction(id, 'reject');
      if (actionBtn.classList.contains('ws-action-paid')) return handleAction(id, 'mark-paid');
    }

    // click outside menus -> close
    if (!trg.closest('.ws-actions')) {
      closeAllMenus();
    }
  }

  // Keyboard handling for menu navigation & closing
  function onDocumentKeydown(e) {
    if (!currentRoot) return;
    if (e.key === 'Escape') {
      closeAllMenus();
      // also close modal if present
      const dlg = currentRoot.querySelector('.lad-modal[open]');
      if (dlg) closeModal(dlg);
    }

    // arrow navigation inside menu
    const activeMenu = document.activeElement?.closest?.('.ws-actions-menu');
    if (activeMenu) {
      const items = Array.from(activeMenu.querySelectorAll('button[role="menuitem"]:not([disabled])'));
      if (!items.length) return;
      const idx = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = items[(idx + 1) % items.length];
        next.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = items[(idx - 1 + items.length) % items.length];
        prev.focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        items[0].focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        items[items.length - 1].focus();
      }
    }
  }

  // ------------------------------
  // Action handler (approve/reject/paid)
  // ------------------------------
  async function handleAction(id, action) {
    // optimistic UI: disable menu items during request
    const menu = currentRoot.querySelector(`.ws-actions-menu[data-id="${id}"]`);
    if (!menu) return;
    const buttons = Array.from(menu.querySelectorAll('button'));
    buttons.forEach(b => b.disabled = true);

    try {
      await performAction(id, action);
      // refresh list (simple: re-fetch current page)
      await refreshActiveTab({ preserveScroll: true });
      showToast(`Action "${action}" succeeded for ${id}`);
    } catch (err) {
      console.error('action failed', err);
      showToast(`Action failed: ${err.message || 'Unknown error'}`, { error: true });
    } finally {
      buttons.forEach(b => b.disabled = false);
      closeAllMenus();
    }
  }

  // ------------------------------
  // Toast minimal helper
  // ------------------------------
  function showToast(msg, { error = false, timeout = 4000 } = {}) {
    if (!currentRoot) return;
    let container = currentRoot.querySelector('.lad-toasts');
    if (!container) {
      container = el('div', { class: 'lad-toasts', style: 'position:fixed;right:12px;top:12px;z-index:9999' });
      document.body.appendChild(container);
    }
    const t = el('div', { class: `lad-toast ${error ? 'err' : 'ok'}`, text: msg });
    t.style.marginBottom = '8px';
    t.style.padding = '8px 12px';
    t.style.borderRadius = '6px';
    t.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
    t.style.background = error ? '#ffdddd' : '#e6ffed';
    container.appendChild(t);
    setTimeout(() => {
      try { t.remove(); } catch (_) {}
    }, timeout);
  }

  // ------------------------------
  // Modal helpers: open, close, focus trap
  // ------------------------------
  function openModal(modal) {
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('open', 'true');
    modal.setAttribute('aria-modal', 'true');
    // focus trap: focus first focusable within modal
    const focusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable) focusable.focus();
    modal._previousActive = document.activeElement;
    addListener(modal, 'keydown', trapModalKeys);
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('open');
    modal.removeAttribute('open');
    modal.removeAttribute('aria-modal');
    try { addListener; } catch (_) {}
    if (modal._previousActive) {
      try { modal._previousActive.focus(); } catch (_) {}
      delete modal._previousActive;
    }
    // remove modal key listener explicitly
    try {
      modal.removeEventListener('keydown', trapModalKeys);
    } catch (_) {}
  }

  function trapModalKeys(e) {
    if (e.key === 'Tab') {
      const modal = e.currentTarget;
      const focusables = Array.from(modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter(n => !n.disabled && n.offsetParent !== null);
      if (!focusables.length) {
        e.preventDefault();
        return;
      }
      const idx = focusables.indexOf(document.activeElement);
      if (e.shiftKey) {
        if (idx === 0) {
          focusables[focusables.length - 1].focus();
          e.preventDefault();
        }
      } else {
        if (idx === focusables.length - 1) {
          focusables[0].focus();
          e.preventDefault();
        }
      }
    } else if (e.key === 'Escape') {
      closeModal(e.currentTarget);
    }
  }

  // ------------------------------
  // Search users (with cancellation)
  // ------------------------------
  let userSearchController = null;
  async function searchUsers(term) {
    if (!term || term.trim().length < 2) return [];
    // cancel previous
    if (userSearchController) {
      try { userSearchController.abort(); } catch (_) {}
      userSearchController = null;
    }
    userSearchController = makeController(DEFAULT_TIMEOUT);
    try {
      const res = await fetchWithTimeout(endpoints.searchUsers(term), { method: 'GET', signal: userSearchController.signal }, DEFAULT_TIMEOUT);
      const json = await res.json();
      return Array.isArray(json) ? json : (json.results || []);
    } catch (err) {
      if (err.name === 'AbortError') return [];
      console.error('searchUsers failed', err);
      return [];
    } finally {
      userSearchController = null;
    }
  }

  // ------------------------------
  // Tab / refresh handling (basic)
  // ------------------------------
  let lastQuery = { page: 1, q: '' };

  async function refreshActiveTab({ preserveScroll = false } = {}) {
    if (!currentRoot) return;
    try {
      const tableBody = currentRoot.querySelector('.withdrawals-table tbody');
      if (!tableBody) return;
      const data = await listWithdrawals(lastQuery);
      const rows = Array.isArray(data?.withdrawals) ? data.withdrawals : (data || []);
      renderWithdrawalsRows(tableBody, rows);
    } catch (err) {
      console.error('refreshActiveTab', err);
      const tableBody = currentRoot && currentRoot.querySelector('.withdrawals-table tbody');
      if (tableBody) clear(tableBody), tableBody.appendChild(emptyRow(9, 'Failed to load'));
    }
  }

  // ------------------------------
  // attach / detach lifecycle
  // ------------------------------
  function attach(root = null) {
    if (attached) {
      // if already attached to same root, do nothing; if different root, detach then reattach
      if (root && currentRoot !== root) detach();
      else if (!root && currentRoot) return;
    }

    const resolvedRoot = root || document.querySelector(ROOT_SELECTOR);
    if (!resolvedRoot) {
      // nothing to attach to
      return false;
    }

    currentRoot = resolvedRoot;
    attached = true;

    // wire delegated listeners
    addListener(document, 'click', onDocumentClick, true);
    addListener(document, 'keydown', onDocumentKeydown, true);

    // window focus/storage/message hooks to refresh if needed
    addListener(window, 'focus', () => { try { refreshActiveTab(); } catch (_) {} });
    addListener(window, 'storage', (e) => { if (e.key === 'loyaltyUpdatedAt') refreshActiveTab(); });

    // wire mutation observer to re-attach if root node removed/added
    if (typeof MutationObserver !== 'undefined') {
      mo = new MutationObserver((mutations) => {
        // if currentRoot is removed from DOM, detach
        if (currentRoot && !document.contains(currentRoot)) {
          // cleanup
          detach();
        }
      });
      mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
    }

    // initial render: if the page already contains a table skeleton, use it
    try {
      refreshActiveTab();
    } catch (e) {
      console.error('initial refresh failed', e);
    }

    // expose debug hook for devs
    try { window.loyaltyAdminDebug = debug; } catch (_) {}

    return true;
  }

  function detach() {
    // abort outstanding fetches
    for (const c of Array.from(controllers)) {
      try { c.abort(); } catch (_) {}
    }
    controllers.clear();

    // disconnect observer
    try { if (mo) mo.disconnect(); } catch (_) {}
    mo = null;

    // remove listeners
    removeAllListeners();

    // close menus and modals if any
    try { closeAllMenus(); } catch (_) {}
    if (currentRoot) {
      const openModals = currentRoot.querySelectorAll('.lad-modal.open');
      openModals.forEach(m => closeModal(m));
    }

    // clear debug hook
    try { delete window.loyaltyAdminDebug; } catch (_) {}

    attached = false;
    currentRoot = null;
  }

  // ------------------------------
  // Auto-attach behavior on load
  // ------------------------------
  function tryAutoAttach() {
    try {
      const root = document.querySelector(ROOT_SELECTOR);
      if (root) attach(root);
    } catch (_) {}
  }

  // Attempt auto-attach on DOMContentLoaded or immediately if already loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryAutoAttach, { once: true });
  } else {
    tryAutoAttach();
  }

  // ------------------------------
  // Export public API
  // ------------------------------
  const publicAPI = {
    attach: (r) => attach(r),
    detach: () => detach(),
    refresh: (opts) => refreshActiveTab(opts),
    debug, // read-only-ish
  };

  try {
    window.loyaltyAdmin = publicAPI;
  } catch (e) {
    // noop if window not present
  }

  // ------------------------------
  // Minimal CSS injection for visible menus & toasts (optional, you can move to stylesheet)
  // ------------------------------
  (function injectStyles() {
    const css = `
/* Minimal styles for admin actions menu + toasts */
.ws-actions-menu { position: absolute; right: 0; top: 100%; background: white; border: 1px solid #ddd; padding: 6px; box-shadow: 0 6px 18px rgba(0,0,0,0.08); z-index: 1000; min-width: 140px; border-radius: 6px; }
.ws-actions-menu.hidden { display: none; }
.ws-actions-menu button { display: block; width: 100%; text-align: left; padding: 6px 8px; background: transparent; border: none; cursor: pointer; }
.ws-actions-menu button[disabled] { opacity: 0.5; cursor: not-allowed; }
.ws-actions-trigger { padding: 6px 8px; border-radius: 6px; border: 1px solid #ccc; background: #fafafa; cursor: pointer; }
.lad-toast.ok { background: #e6ffed; }
.lad-toast.err { background: #ffefef; border: 1px solid #f3c2c2; }
`;
    try {
      const st = document.createElement('style');
      st.type = 'text/css';
      st.appendChild(document.createTextNode(css));
      document.head.appendChild(st);
    } catch (e) {
      // ignore
    }
  })();

})();
