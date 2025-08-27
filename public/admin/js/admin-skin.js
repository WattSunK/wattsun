/* Wattsun Admin — Auto Skin Shim (idempotent, additive-only)
   v1.2: heading-based fallback + generic table skin + toolbar skin.
*/
(function () {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const add = (el, ...cls) => el && cls.forEach(c => el.classList.add(c));
  const once = (el, key) => {
    if (!el) return false;
    const k = `__wsSkinned:${key}`;
    if (el[k]) return false;
    el[k] = true;
    return true;
  };

  // Pane map: add/adjust selectors as needed; label is used for fallback
  const PANE_MAP = [
    {
      label: 'Users',
      root:  '#users-root',
      tables: ['#users-table'],
      pager:  { info: ['#users-table-info'], controls: ['#users-pagination'] },
      modal:  ['#usersModal']
    },
    {
      label: 'Orders',
      root:  '#orders-root',
      tables: ['#orders-table', 'table.orders'],  // fallback will skin any table if these aren't present
      pager:  { info: ['#orders-table-info'], controls: ['#orders-pagination'] },
      modal:  ['#ordersModal']
    },
    {
      label: 'Items',
      root:  '#items-root',
      tables: ['#items-table', 'table.items'],
      pager:  { info: ['#items-table-info'], controls: ['#items-pagination'] },
      modal:  ['#itemsModal']
    },
    {
      label: 'Dispatch',
      root:  '#dispatch-root',
      tables: ['#dispatch-table'],
      pager:  { info: ['#dispatch-table-info'], controls: ['#dispatch-pagination'] },
      modal:  ['#dispatchModal']
    }
  ];

  // ---- Root discovery (explicit id, else heading text) ----
  function findPaneRootByHeading(label) {
    if (!label) return null;
    const text = String(label).trim().toLowerCase();
    const headings = $$('h1,h2,h3').filter(h => (h.textContent || '').trim().toLowerCase() === text);
    for (const h of headings) {
      const sec = h.closest('section, .ws-admin-section, .panel, .card, .box, .content, .container, main') || h.parentElement;
      if (sec) return sec;
    }
    return null;
  }
  function getPaneRoot(entry) {
    if (entry.root) {
      const el = $(entry.root);
      if (el) return el;
    }
    return findPaneRootByHeading(entry.label);
  }

  // ---- Toolbar skin (adds classes only) ----
  function skinToolbar(root) {
    if (!root) return;

    // If a toolbar already exists, just enhance children
    let bar = $('.ws-admin-toolbar', root);

    // Otherwise: find a container near top that looks like filters (selects/inputs/buttons)
    if (!bar) {
      const candidates = $$('.filters, .toolbar, .controls, .actions, form, .row, div', root)
        .filter(el => el.querySelector('select, input[type="search"], input[type="text"], button'));
      bar = candidates[0] || null;
      if (bar) add(bar, 'ws-admin-toolbar');
    }
    if (!bar || !once(bar, 'toolbar')) return;

    // Enhance controls
    $$('select', bar).forEach(s => add(s, 'ws-select'));
    $$('input[type="search"], input[type="text"]', bar).forEach(i => add(i, 'ws-input'));
    $$('button, .btn', bar).forEach(btn => {
      add(btn, 'ws-btn');
      const txt = (btn.textContent || '').trim().toLowerCase();
      if (txt.startsWith('+') || /add/.test(txt)) add(btn, 'ws-btn-primary');
      if (/clear|reset/.test(txt)) add(btn, 'ws-btn-ghost');
    });
  }

  // ---- Table skin ----
  function skinTable(root, table) {
    if (!table || !once(table, 'table')) return;
    add(table, 'ws-table');
    const p = table.parentElement;
    if (p) add(p, 'ws-table-wrap');

    // Row actions
    $$('.ws-actions', table).forEach(a => a.classList.remove('ws-actions')); // normalize duplicates
    $$('.ws-actions', table).length; // noop

    $$('tbody tr', table).forEach(tr => {
      if (!once(tr, 'rowActions')) return;
      const last = tr.lastElementChild;
      if (!last) return;
      add(last, 'ws-actions');
      $$('button', last).forEach(btn => {
        add(btn, 'ws-btn', 'ws-btn-xs');
        const t = (btn.textContent || '').trim().toLowerCase();
        if (t === 'view' || t === 'edit') add(btn, 'ws-btn-primary');
        if (t === 'delete' || t === 'remove') add(btn, 'ws-btn-ghost');
      });
    });

    // Status badges
    const ths = $$('thead th', table);
    const statusIdx = ths.findIndex(th => (/status/i).test(th.textContent || ''));
    if (statusIdx !== -1) {
      $$('tbody tr', table).forEach(tr => {
        if (!once(tr, 'rowStatus')) return;
        const td = tr.children[statusIdx];
        if (!td) return;
        const raw = (td.textContent || '').trim();
        const val = raw.toLowerCase();
        td.textContent = '';
        const span = document.createElement('span');
        add(span, 'ws-badge', (val === 'active' ? 'ws-badge-success' : 'ws-badge-muted'));
        span.textContent = raw || '—';
        td.appendChild(span);
      });
    }
  }

  // ---- Pager skin (only when we know selectors) ----
  function skinPager(root, map) {
    if (!map) return;
    (map.info  || []).forEach(sel => $$(sel, root).forEach(el => add(el, 'ws-pager-info')));
    (map.controls || []).forEach(sel => $$(sel, root).forEach(el => add(el, 'ws-pager-controls')));
    const infoEl = (map.info||[]).map(s => $(s, root)).find(Boolean);
    const pagEl  = (map.controls||[]).map(s => $(s, root)).find(Boolean);
    if (infoEl && pagEl) {
      const same = infoEl.parentElement === pagEl.parentElement &&
                   infoEl.parentElement.classList.contains('ws-pager');
      if (!same) {
        const wrap = document.createElement('div');
        add(wrap, 'ws-pager');
        infoEl.parentNode.insertBefore(wrap, infoEl);
        wrap.appendChild(infoEl);
        wrap.appendChild(pagEl);
      }
    }
  }

  // ---- Modal skin ----
  function skinModal(root, selectors) {
    (selectors || []).forEach(sel => {
      $$(sel, root).forEach(modal => {
        if (!once(modal, 'modal')) return;
        add(modal, 'ws-modal');
        const dlg  = modal.querySelector('.ws-dialog') ||
                     modal.querySelector('.modal-dialog') ||
                     modal.firstElementChild;
        if (dlg) add(dlg, 'ws-dialog');
        const hdr = modal.querySelector('.ws-dialog-header') || modal.querySelector('.modal-header');
        const bdy = modal.querySelector('.ws-dialog-body')   || modal.querySelector('.modal-body');
        const ftr = modal.querySelector('.ws-dialog-footer') || modal.querySelector('.modal-footer');
        if (hdr) add(hdr, 'ws-dialog-header');
        if (bdy) add(bdy, 'ws-dialog-body');
        if (ftr) add(ftr, 'ws-dialog-footer');
      });
    });
  }

  function skinPane(entry) {
    const root = getPaneRoot(entry);
    if (!root) return;

    // Toolbar first (visual only)
    skinToolbar(root);

    // Known table selectors
    let tables = [];
    (entry.tables || []).forEach(sel => { tables = tables.concat($$(sel, root)); });
    // Fallback: any table inside the pane
    if (!tables.length) tables = $$('table', root).filter(t => !t.classList.contains('ws-table'));
    tables.forEach(t => skinTable(root, t));

    // Pager / Modal when known
    skinPager(root, entry.pager);
    skinModal(root, entry.modal);
  }

  function run(){ PANE_MAP.forEach(skinPane); }
  run();
  new MutationObserver(() => run()).observe(document.body, { childList: true, subtree: true });
})();
