/* Wattsun Admin — Auto Skin Shim (idempotent, additive-only)
   Purpose: give legacy admin partials the Items-style look without editing HTML.
   Scope:  strictly pane-root scoped; safe to run repeatedly (idempotent).
   How:    adds ws-* classes & light DOM tweaks; no removals, no event binding.
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

  // Map of pane roots -> legacy selectors to skin.
  // Fill these out as we roll to other partials.
  const PANE_MAP = [
    // USERS (already styled; keep for consistency)
    { root: '#users-root',
      tables: ['#users-table'],
      pager:  { info: ['#users-table-info'], controls: ['#users-pagination'] },
      modal:  ['#usersModal']
    },

    // ORDERS — adjust selectors once you share that partial
    { root: '#orders-root',
      tables: ['#orders-table','table.orders'],
      pager:  { info: ['#orders-table-info'], controls: ['#orders-pagination'] },
      modal:  ['#ordersModal']
    },

    // ITEMS — adjust to match your markup
    { root: '#items-root',
      tables: ['#items-table','table.items'],
      pager:  { info: ['#items-table-info'], controls: ['#items-pagination'] },
      modal:  ['#itemsModal']
    },

    // DISPATCH / DRIVERS — placeholders
    { root: '#dispatch-root',
      tables: ['#dispatch-table'],
      pager:  { info: ['#dispatch-table-info'], controls: ['#dispatch-pagination'] },
      modal:  ['#dispatchModal']
    },
    { root: '#drivers-root',
      tables: ['#drivers-table'],
      pager:  { info: ['#drivers-table-info'], controls: ['#drivers-pagination'] },
      modal:  ['#driversModal']
    }
  ];

  function skinTable(root, table) {
    if (!table || !once(table, 'table')) return;

    // Table class
    add(table, 'ws-table');

    // Try to mark the immediate container as the visual wrapper (no reparenting)
    const p = table.parentElement;
    if (p) add(p, 'ws-table-wrap');

    // Style the action buttons in the last column (View/Edit/Delete)
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
        if (txt === 'delete') add(btn, 'ws-btn-ghost');
      });
    });

    // Status badges (auto-detect the STATUS column by header text)
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

    // If both info and controls exist but there's no wrapper, create one adjacent (purely visual)
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

        // Try to identify common parts; add ws-dialog wrappers if present
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
    const root = $(entry.root);
    if (!root) return;

    // Tables
    (entry.tables || []).forEach(sel => $$(sel, root).forEach(t => skinTable(root, t)));

    // Pager
    skinPager(root, entry.pager);

    // Modal
    skinModal(root, entry.modal);
  }

  function run() {
    PANE_MAP.forEach(skinPane);
  }

  // Initial run + observe DOM swaps (SPA-ish dashboard)
  run();
  new MutationObserver(() => run()).observe(document.body, { childList: true, subtree: true });
})();
