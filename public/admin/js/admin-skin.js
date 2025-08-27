/* Wattsun Admin — Auto Skin Shim (idempotent, additive-only)
   v1.3
   - Skins legacy admin partials to the Items look without changing HTML
   - Heading fallback to find pane roots
   - Generic table/pager/modal skin
   - Toolbar skin even if controls are "loose" before the first table
   - Dispatch extras: Status, Driver, Date range filters (client-side)
*/
(function () {
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const add = (el, ...cls) => el && cls.forEach(c => el.classList.add(c));
  const once = (el, key) => {
    if (!el) return false;
    const k = `__wsSkinned:${key}`;
    if (el[k]) return false;
    el[k] = true;
    return true;
  };

  // ---------- Pane registry ----------
  const PANE_MAP = [
    {
      label: 'Users',
      root:  '#users-root',
      tables: ['#users-table'],
      pager:  { info: ['#users-table-info'], controls: ['#users-pagination'] },
      modal:  ['#usersModal']
      // no extras needed
    },
    {
      label: 'Orders',
      root:  '#orders-root',
      tables: ['#orders-table', 'table.orders'],
      pager:  { info: ['#orders-table-info'], controls: ['#orders-pagination'] },
      modal:  ['#ordersModal']
      // optional future extras
    },
    {
      label: 'Items',
      root:  '#items-root',
      tables: ['#items-table', 'table.items'],
      pager:  { info: ['#items-table-info'], controls: ['#items-pagination'] },
      modal:  ['#itemsModal']
      // toolbar skin handles loose controls
    },
    {
      label: 'Dispatch',
      root:  '#dispatch-root',
      tables: ['#dispatch-table'],
      pager:  { info: ['#dispatch-table-info'], controls: ['#dispatch-pagination'] },
      modal:  ['#dispatchModal'],
      enhance: enhanceDispatch // <- inject Status/Driver/Date filters
    }
  ];

  // ---------- Root discovery (id or heading text) ----------
  function findPaneRootByHeading(label) {
    if (!label) return null;
    const text = String(label).trim().toLowerCase();
    const heads = $$('h1,h2,h3').filter(h => (h.textContent || '').trim().toLowerCase() === text);
    for (const h of heads) {
      const sec =
        h.closest('section, .ws-admin-section, .panel, .card, .box, .content, .container, main') ||
        h.parentElement;
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

  // ---------- Toolbar skin ----------
  function skinToolbar(root) {
    if (!root) return;

    // 1) Prefer an existing wrapper that already looks like a toolbar
    let bar = root.querySelector('.ws-admin-toolbar');
    if (!bar) {
      const candidates = $$('.filters, .toolbar, .controls, .actions, form, .row, div', root)
        .filter(el => el.querySelector('select, input[type="search"], input[type="text"], button, .btn'));
      bar = candidates[0] || null;
      if (bar) add(bar, 'ws-admin-toolbar');
    }
    if (bar && once(bar, 'toolbar')) {
      $$('select', bar).forEach(s => add(s, 'ws-select'));
      $$('input[type="search"], input[type="text"]', bar).forEach(i => add(i, 'ws-input'));
      $$('button, .btn', bar).forEach(btn => {
        add(btn, 'ws-btn');
        const txt = (btn.textContent || '').trim().toLowerCase();
        if (txt.startsWith('+') || /add|manage/.test(txt)) add(btn, 'ws-btn-primary');
        if (/clear|reset/.test(txt)) add(btn, 'ws-btn-ghost');
      });
    }

    // 2) Fallback: style any top-of-pane controls even if there is no wrapper.
    const firstTable = root.querySelector('table');
    const topControls = $$('button, .btn, select, input[type="search"], input[type="text"]', root)
      .filter(el => {
        if (!firstTable) return true;
        // keep only those that appear BEFORE the first table
        return !!(el.compareDocumentPosition(firstTable) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
    topControls.forEach(el => {
      const tag = el.tagName;
      if (tag === 'SELECT') add(el, 'ws-select');
      else if (tag === 'INPUT') add(el, 'ws-input');
      else add(el, 'ws-btn');
    });
  }

  // ---------- Table skin ----------
  function skinTable(root, table) {
    if (!table || !once(table, 'table')) return;

    add(table, 'ws-table');
    const p = table.parentElement;
    if (p) add(p, 'ws-table-wrap');

    // Row action buttons
    $$('tbody tr', table).forEach(tr => {
      if (!once(tr, 'rowActions')) return;
      const last = tr.lastElementChild;
      if (!last) return;
      add(last, 'ws-actions');
      $$('button', last).forEach(btn => {
        add(btn, 'ws-btn', 'ws-btn-xs');
        const t = (btn.textContent || '').trim().toLowerCase();
        if (t === 'view' || t === 'edit' || t === 'assign') add(btn, 'ws-btn-primary');
        if (t === 'delete' || t === 'remove' || t === 'unassign') add(btn, 'ws-btn-ghost');
      });
    });

    // Status badges by header text
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
        add(span, 'ws-badge', (val === 'active' || val === 'pending' || val === 'open')
          ? 'ws-badge-success'
          : 'ws-badge-muted');
        span.textContent = raw || '—';
        td.appendChild(span);
      });
    }
  }

  // ---------- Pager skin (when we know selectors) ----------
  function skinPager(root, map) {
    if (!map) return;
    (map.info  || []).forEach(sel => $$(sel, root).forEach(el => add(el, 'ws-pager-info')));
    (map.controls || []).forEach(sel => $$(sel, root).forEach(el => add(el, 'ws-pager-controls')));

    const infoEl = (map.info || []).map(s => $(s, root)).find(Boolean);
    const pagEl  = (map.controls || []).map(s => $(s, root)).find(Boolean);
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

  // ---------- Modal skin ----------
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

  // ---------- Dispatch extras (Status, Driver, Date range) ----------
  function enhanceDispatch(root) {
    if (!root) return;
    const table = $('table', root);
    if (!table) return;

    // Only build once
    if (!once(root, 'dispatchFilters')) return;

    // Column indexes
    const ths = $$('thead th', table).map(th => (th.textContent || '').trim().toLowerCase());
    const idx = {
      status: ths.findIndex(t => /status/.test(t)),
      driver: ths.findIndex(t => /driver/.test(t)),
      created: ths.findIndex(t => /created|date/.test(t))
    };

    // Build container right above the table
    const bar = document.createElement('div');
    add(bar, 'ws-admin-toolbar', 'ws-dispatch-filters');
    table.parentNode.insertBefore(bar, table);

    // Helper: create select
    const mkSelect = (placeholder, cls = 'ws-select') => {
      const s = document.createElement('select');
      add(s, cls);
      const opt = document.createElement('option');
      opt.value = ''; opt.textContent = placeholder;
      s.appendChild(opt);
      return s;
    };
    // Helper: create input date
    const mkDate = () => { const i = document.createElement('input'); i.type = 'date'; add(i, 'ws-input'); return i; };

    // Collect unique values from rows
    const rows = $$('tbody tr', table);
    const statuses = new Set(), drivers = new Set();
    rows.forEach(tr => {
      if (idx.status !== -1) statuses.add(($('td:nth-child('+(idx.status+1)+')', tr)?.textContent || '').trim());
      if (idx.driver !== -1) drivers.add(($('td:nth-child('+(idx.driver+1)+')', tr)?.textContent || '').trim());
    });

    // Controls
    const statusSel = mkSelect('All Status');
    Array.from(statuses).filter(Boolean).sort().forEach(v => {
      const o = document.createElement('option'); o.value = v; o.textContent = v; statusSel.appendChild(o);
    });

    const driverSel = mkSelect('All Drivers');
    Array.from(drivers).filter(Boolean).sort().forEach(v => {
      const o = document.createElement('option'); o.value = v; o.textContent = v; driverSel.appendChild(o);
    });

    const fromDate = mkDate(); fromDate.placeholder = 'From';
    const toDate   = mkDate(); toDate.placeholder   = 'To';

    // Label-ish buttons (optional)
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button'; clearBtn.textContent = 'Clear';
    add(clearBtn, 'ws-btn', 'ws-btn-ghost');

    // Append
    bar.appendChild(statusSel);
    bar.appendChild(driverSel);
    bar.appendChild(fromDate);
    bar.appendChild(toDate);
    bar.appendChild(clearBtn);

    // Filtering
    function parseDate(text) {
      const s = (text || '').trim();
      // try dd/MM/yyyy HH:mm[:ss]
      const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})(?:[^\d](\d{2}):(\d{2})(?::(\d{2}))?)?/);
      if (m) {
        const d = Number(m[1]), mo = Number(m[2]) - 1, y = Number(m[3]);
        const hh = Number(m[4] || 0), mm = Number(m[5] || 0), ss = Number(m[6] || 0);
        return new Date(y, mo, d, hh, mm, ss);
      }
      // ISO or anything Date can parse
      const dt = new Date(s);
      return isNaN(dt.getTime()) ? null : dt;
    }

    function rowDate(tr) {
      if (idx.created === -1) return null;
      const cell = $('td:nth-child('+(idx.created+1)+')', tr);
      return parseDate(cell ? cell.textContent : '');
    }

    function applyFilters() {
      const sVal = statusSel.value;
      const dVal = driverSel.value;
      const fVal = fromDate.value ? new Date(fromDate.value) : null;
      const tVal = toDate.value   ? new Date(toDate.value)   : null;

      $$('tbody tr', table).forEach(tr => {
        let show = true;

        if (sVal && idx.status !== -1) {
          const txt = ($('td:nth-child('+(idx.status+1)+')', tr)?.textContent || '').trim();
          show = show && (txt === sVal);
        }

        if (dVal && idx.driver !== -1) {
          const txt = ($('td:nth-child('+(idx.driver+1)+')', tr)?.textContent || '').trim();
          show = show && (txt === dVal);
        }

        if ((fVal || tVal) && idx.created !== -1) {
          const when = rowDate(tr);
          if (!when) show = false;
          if (show && fVal && when < new Date(fVal.getFullYear(), fVal.getMonth(), fVal.getDate())) show = false;
          if (show && tVal && when > new Date(tVal.getFullYear(), tVal.getMonth(), tVal.getDate(), 23, 59, 59)) show = false;
        }

        tr.style.display = show ? '' : 'none';
      });
    }

    [statusSel, driverSel, fromDate, toDate].forEach(el => el.addEventListener('change', applyFilters));
    clearBtn.addEventListener('click', () => {
      statusSel.value = ''; driverSel.value = ''; fromDate.value = ''; toDate.value = '';
      applyFilters();
    });

    // Rebuild driver/status lists if rows change (e.g., pagination/refresh)
    const tbody = $('tbody', table);
    if (tbody) {
      new MutationObserver(() => {
        // preserve current selections
        const sKeep = statusSel.value, dKeep = driverSel.value;
        const st = new Set(), dr = new Set();
        $$('tr', tbody).forEach(tr => {
          if (idx.status !== -1) st.add(($('td:nth-child('+(idx.status+1)+')', tr)?.textContent || '').trim());
          if (idx.driver !== -1) dr.add(($('td:nth-child('+(idx.driver+1)+')', tr)?.textContent || '').trim());
        });
        // repopulate
        statusSel.length = 1; Array.from(st).filter(Boolean).sort().forEach(v => {
          const o = document.createElement('option'); o.value = v; o.textContent = v; statusSel.appendChild(o);
        });
        driverSel.length = 1; Array.from(dr).filter(Boolean).sort().forEach(v => {
          const o = document.createElement('option'); o.value = v; o.textContent = v; driverSel.appendChild(o);
        });
        // restore + reapply
        statusSel.value = sKeep || '';
        driverSel.value = dKeep || '';
        applyFilters();
      }).observe(tbody, { childList: true, subtree: true });
    }

    // Initial pass
    applyFilters();
  }

  // ---------- Skin a single pane ----------
  function skinPane(entry) {
    const root = getPaneRoot(entry);
    if (!root) return;

    skinToolbar(root);

    // Known tables first
    let tables = [];
    (entry.tables || []).forEach(sel => { tables = tables.concat($$(sel, root)); });
    // Fallback: any table under root
    if (!tables.length) tables = $$('table', root).filter(t => !t.classList.contains('ws-table'));
    tables.forEach(t => skinTable(root, t));

    skinPager(root, entry.pager);
    skinModal(root, entry.modal);

    // Extras (e.g., Dispatch filters)
    if (typeof entry.enhance === 'function') entry.enhance(root);
  }

  // ---------- Boot & observe ----------
  function run() { PANE_MAP.forEach(skinPane); }

  run();
  new MutationObserver(() => run()).observe(document.body, { childList: true, subtree: true });
})();
