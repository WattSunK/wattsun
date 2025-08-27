/* Wattsun Admin — Auto Skin Shim (idempotent, additive-only)
   v1.1: Adds heading-based pane discovery + generic table skin fallback.
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

  // === Pane map ===
  // You can add/adjust selectors here at any time.
  // `label` is used as a fallback to find the pane by heading text.
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
      root:  '#orders-root',                // if present, we use it
      tables: ['#orders-table', 'table.orders'],  // if missing, fallback will skin any table under the "Orders" pane
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
    },
    {
      label: 'Drivers',
      root:  '#drivers-root',
      tables: ['#drivers-table'],
      pager:  { info: ['#drivers-table-info'], controls: ['#drivers-pagination'] },
      modal:  ['#driversModal']
    }
  ];

  // === Fallback: find pane root by heading text (H1/H2/H3) ===
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
    // Use explicit root if it exists
    if (entry.root) {
      const el = $(entry.root);
      if (el) return el;
    }
    // Fallback: heading-based discovery
    return findPaneRootByHeading(entry.label);
  }

  // === Skinners ===
  function skinTable(root, table) {
    if (!table || !once(table, 'table')) return;

    // Table classes
    add(table, 'ws-table');

    // Mark parent as wrapper (no reparenting)
    const p = table.parentElement;
    if (p) add(p, 'ws-table-wrap');

    // Row actions
    const rows = $$('tbody tr', table);
    rows.forEach(tr => {
      if (!once(tr, 'rowActions')) return;
      const last = tr.lastElementChild;
      if (!last) return;
      add(last, 'ws-actions');
      $$('button', last).forEach(btn => {
        add(btn, 'ws-btn', 'ws-btn-xs');
        const txt = (btn.textContent || '').trim().toLowerCase();
        if (txt === 'view' || txt === 'edit') add(btn, 'ws-btn-primary');
        if (txt === 'delete' || txt === 'remove') add(btn, 'ws-btn-ghost');
      });
    });

    // Status badges: detect STATUS column by header text
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

  function skinPager(root, map) {
    if (!map) return;
    (map.info  || []).forEach(sel => $$(sel, root).forEach(el => add(el, 'ws-pager-info')));
    (map.controls || []).forEach(sel => $$(sel, root).forEach(el => add(el, 'ws-pager-controls')));

    // If both exist but no wrapper, create one sibling wrapper (visual only)
    const infoEl = (map.info||[]).map(s => $(s, root)).find(Boolean);
    const pagEl  = (map.controls||[]).map(s => $(s, root)).find(Boolean);
    if (infoEl && pagEl) {
      const alreadyWrapped = infoEl.parentElement === pagEl.parentElement &&
                             infoEl.parentElement.classList.contains('ws-pager');
      if (!alreadyWrapped) {
        const wrap = document.createElement('div');
        add(wrap, 'ws-pager');
        infoEl.parentNode.insertBefore(wrap, infoEl);
        wrap.appendChild(infoEl);
        wrap.appendChild(pagEl);
      }
    }
  }

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

    // 1) Known table selectors first
    let tables = [];
    (entry.tables || []).forEach(sel => { tables = tables.concat($$(sel, root)); });

    // 2) Fallback: if none matched, skin any visible table inside the pane
    if (!tables.length) {
      tables = $$('table', root).filter(t => !t.classList.contains('ws-table'));
    }
    tables.forEach(t => skinTable(root, t));

    // Pager: only applied if known selectors exist; we avoid guessing here
    skinPager(root, entry.pager);

    // Modal: applied if present
    skinModal(root, entry.modal);
  }

  function run() { PANE_MAP.forEach(skinPane); }

  run();
  new MutationObserver(() => run()).observe(document.body, { childList: true, subtree: true });
})();
