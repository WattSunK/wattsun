/* Wattsun Admin — Auto Skin Shim (idempotent, additive-only)
   v1.4
   - Skins legacy admin partials to the Items look without changing templates
   - Heading fallback to find pane roots
   - Generic table/pager/modal skin
   - Toolbar skin even if controls are "loose"
   - Items: group top controls into a single toolbar row automatically
   - Dispatch: Status / Driver / Date range filters (client-side)
*/
(function () {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const add = (el, ...cls) => el && cls.forEach(c => el.classList.add(c));
  const once = (el, key) => { if (!el) return false; const k=`__wsSkinned:${key}`; if (el[k]) return false; el[k]=true; return true; };
  const isBefore = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  // ---------------- Pane registry ----------------
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
      tables: ['#orders-table', 'table.orders'],
      pager:  { info: ['#orders-table-info'], controls: ['#orders-pagination'] },
      modal:  ['#ordersModal']
    },
    {
      label: 'Items',
      root:  '#items-root',
      tables: ['#items-table', 'table.items'],
      pager:  { info: ['#items-table-info'], controls: ['#items-pagination'] },
      modal:  ['#itemsModal'],
      enhance: ensureSingleRowToolbar // group loose controls into one row
    },
    {
      label: 'Dispatch',
      root:  '#dispatch-root',
      tables: ['#dispatch-table'],
      pager:  { info: ['#dispatch-table-info'], controls: ['#dispatch-pagination'] },
      modal:  ['#dispatchModal'],
      enhance: enhanceDispatchFilters // add Status/Driver/Date filters
    }
  ];

  // --------------- Root discovery ----------------
  function findPaneRootByHeading(label) {
    if (!label) return null;
    const text = String(label).trim().toLowerCase();
    const heads = $$('h1,h2,h3').filter(h => (h.textContent||'').trim().toLowerCase() === text);
    for (const h of heads) {
      const sec = h.closest('section, .ws-admin-section, .panel, .card, .box, .content, .container, main') || h.parentElement;
      if (sec) return sec;
    }
    return null;
  }
  function getPaneRoot(entry) {
    if (entry.root) { const el=$(entry.root); if (el) return el; }
    return findPaneRootByHeading(entry.label);
  }

  // --------------- Toolbar helpers ----------------
  function styleControlsIn(el) {
    $$('select', el).forEach(s => add(s, 'ws-select'));
    $$('input[type="search"], input[type="text"]', el).forEach(i => add(i, 'ws-input'));
    $$('button, .btn', el).forEach(btn => {
      add(btn, 'ws-btn');
      const txt = (btn.textContent || '').trim().toLowerCase();
      if (txt.startsWith('+') || /add|manage/.test(txt)) add(btn, 'ws-btn-primary');
      if (/clear|reset/.test(txt)) add(btn, 'ws-btn-ghost');
    });
  }

  // Find or create a toolbar; if none, still style top controls
  function skinToolbar(root) {
    if (!root) return;
    let bar = root.querySelector('.ws-admin-toolbar');

    // 1) Prefer existing container
    if (!bar) {
      const candidates = $$('.filters, .toolbar, .controls, .actions, form, .row, div', root)
        .filter(el => el.querySelector('select, input[type="search"], input[type="text"], button, .btn'));
      bar = candidates[0] || null;
      if (bar) add(bar, 'ws-admin-toolbar');
    }
    if (bar && once(bar, 'toolbar')) styleControlsIn(bar);

    // 2) Also style "loose" top-of-pane controls even if no wrapper
    const firstTable = $('table', root);
    const topControls = $$('button, .btn, select, input[type="search"], input[type="text"]', root)
      .filter(el => !bar || !bar.contains(el))
      .filter(el => !firstTable || isBefore(el, firstTable))
      // exclude DataTables length control like: <select name="items_length">
      .filter(el => !(el.name && /_length$/.test(el.name)));
    topControls.forEach(el => {
      const tag = el.tagName;
      if (tag === 'SELECT') add(el, 'ws-select');
      else if (tag === 'INPUT') add(el, 'ws-input');
      else add(el, 'ws-btn');
    });
  }

  // Group a sequence of loose top controls into one row (used on Items)
  function ensureSingleRowToolbar(root) {
    if (!root || !once(root, 'groupToolbar')) return;
    const firstTable = $('table', root);
    if (!firstTable) return;

    // Gather loose controls that appear before the first table (exclude DataTables length)
    const controls = $$('button, .btn, select, input[type="search"], input[type="text"]', root)
      .filter(el => isBefore(el, firstTable))
      .filter(el => !(el.name && /_length$/.test(el.name)))
      .filter(el => !el.closest('.ws-admin-toolbar'));

    if (controls.length < 2) return; // nothing to group

    // Create toolbar wrapper and move them in order
    const bar = document.createElement('div');
    add(bar, 'ws-admin-toolbar');
    root.insertBefore(bar, firstTable);
    controls.forEach(el => bar.appendChild(el));
    styleControlsIn(bar);
  }

  // --------------- Table skin ----------------
  function skinTable(root, table) {
    if (!table || !once(table, 'table')) return;
    add(table, 'ws-table');
    const p = table.parentElement; if (p) add(p, 'ws-table-wrap');

    // Row actions
    $$('tbody tr', table).forEach(tr => {
      if (!once(tr, 'rowActions')) return;
      const last = tr.lastElementChild; if (!last) return;
      add(last, 'ws-actions');
      $$('button', last).forEach(btn => {
        add(btn, 'ws-btn', 'ws-btn-xs');
        const t = (btn.textContent || '').trim().toLowerCase();
        if (t === 'view' || t === 'edit' || t === 'assign') add(btn, 'ws-btn-primary');
        if (t === 'delete' || t === 'remove' || t === 'unassign') add(btn, 'ws-btn-ghost');
      });
    });

    // Status badges (auto-detect STATUS column)
    const ths = $$('thead th', table);
    const statusIdx = ths.findIndex(th => (/status/i).test(th.textContent||''));
    if (statusIdx !== -1) {
      $$('tbody tr', table).forEach(tr => {
        if (!once(tr, 'rowStatus')) return;
        const td = tr.children[statusIdx]; if (!td) return;
        const raw = (td.textContent || '').trim();
        const val = raw.toLowerCase();
        td.textContent = '';
        const span = document.createElement('span');
        add(span, 'ws-badge', (val === 'active' || val === 'pending' || val === 'open') ? 'ws-badge-success' : 'ws-badge-muted');
        span.textContent = raw || '—';
        td.appendChild(span);
      });
    }
  }

  // --------------- Pager skin (when known) ----------------
  function skinPager(root, map) {
    if (!map) return;
    (map.info  || []).forEach(sel => $$(sel, root).forEach(el => add(el, 'ws-pager-info')));
    (map.controls || []).forEach(sel => $$(sel, root).forEach(el => add(el, 'ws-pager-controls')));

    const infoEl = (map.info || []).map(s => $(s, root)).find(Boolean);
    const pagEl  = (map.controls || []).map(s => $(s, root)).find(Boolean);
    if (infoEl && pagEl) {
      const same = infoEl.parentElement === pagEl.parentElement && infoEl.parentElement.classList.contains('ws-pager');
      if (!same) {
        const wrap = document.createElement('div'); add(wrap, 'ws-pager');
        infoEl.parentNode.insertBefore(wrap, infoEl);
        wrap.appendChild(infoEl); wrap.appendChild(pagEl);
      }
    }
  }

  // --------------- Modal skin ----------------
  function skinModal(root, selectors) {
    (selectors || []).forEach(sel => {
      $$(sel, root).forEach(modal => {
        if (!once(modal, 'modal')) return;
        add(modal, 'ws-modal');
        const dlg = modal.querySelector('.ws-dialog') || modal.querySelector('.modal-dialog') || modal.firstElementChild;
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

  // --------------- Dispatch extra filters ----------------
  function enhanceDispatchFilters(root) {
    if (!root || !once(root, 'dispatchFilters')) return;

    const table = $('table', root);
    if (!table) return;

    // Column indexes by header
    const ths = $$('thead th', table).map(th => (th.textContent||'').trim().toLowerCase());
    const idx = {
      status:  ths.findIndex(t => /status/.test(t)),
      driver:  ths.findIndex(t => /driver/.test(t)),
      created: ths.findIndex(t => /created|date/.test(t)),
    };

    // Build toolbar above table
    const bar = document.createElement('div');
    add(bar, 'ws-admin-toolbar', 'ws-dispatch-filters');
    table.parentNode.insertBefore(bar, table);

    const mkSelect = (placeholder) => {
      const s = document.createElement('select'); add(s, 'ws-select');
      const o = document.createElement('option'); o.value=''; o.textContent=placeholder; s.appendChild(o);
      return s;
    };
    const mkDate = () => { const i=document.createElement('input'); i.type='date'; add(i,'ws-input'); return i; };

    // Collect unique values from table rows
    const rows = $$('tbody tr', table);
    const statuses = new Set(), drivers = new Set();
    rows.forEach(tr => {
      // Status: plain text
      if (idx.status !== -1) {
        const td = tr.children[idx.status];
        statuses.add((td ? td.textContent : '').trim());
      }
      // Driver: select inside cell (use selected option text if present)
      if (idx.driver !== -1) {
        const td = tr.children[idx.driver];
        const sel = td ? td.querySelector('select') : null;
        if (sel) {
          const opt = sel.selectedOptions && sel.selectedOptions[0];
          drivers.add((opt ? opt.textContent : sel.value || '').trim());
          // Also add all options (so you can filter by drivers that aren’t currently selected)
          Array.from(sel.options).forEach(o => drivers.add((o.textContent||'').trim()));
        } else {
          drivers.add((td ? td.textContent : '').trim());
        }
      }
    });

    // Controls
    const statusSel = mkSelect('All Status');
    Array.from(statuses).filter(Boolean).sort().forEach(v => { const o=document.createElement('option'); o.value=v; o.textContent=v; statusSel.appendChild(o); });

    const driverSel = mkSelect('All Drivers');
    Array.from(drivers).filter(Boolean).sort().forEach(v => { const o=document.createElement('option'); o.value=v; o.textContent=v; driverSel.appendChild(o); });

    const fromDate = mkDate(); fromDate.placeholder='From';
    const toDate   = mkDate(); toDate.placeholder  ='To';

    const clearBtn = document.createElement('button');
    clearBtn.type='button'; clearBtn.textContent='Clear'; add(clearBtn,'ws-btn','ws-btn-ghost');

    bar.appendChild(statusSel);
    bar.appendChild(driverSel);
    bar.appendChild(fromDate);
    bar.appendChild(toDate);
    bar.appendChild(clearBtn);

    // Helpers for date parsing
    function parseDate(text) {
      const s=(text||'').trim();
      const m=s.match(/(\d{2})\/(\d{2})\/(\d{4})(?:[^\d](\d{2}):(\d{2})(?::(\d{2}))?)?/);
      if (m) { const d=+m[1], mo=+m[2]-1, y=+m[3], hh=+(m[4]||0), mm=+(m[5]||0), ss=+(m[6]||0); return new Date(y,mo,d,hh,mm,ss); }
      const dt=new Date(s); return isNaN(dt.getTime()) ? null : dt;
    }
    const rowDate = (tr) => {
      if (idx.created === -1) return null;
      const td = tr.children[idx.created];
      return parseDate(td ? td.textContent : '');
    };
    const rowDriver = (tr) => {
      if (idx.driver === -1) return '';
      const td = tr.children[idx.driver];
      const sel = td ? td.querySelector('select') : null;
      if (sel) {
        const opt = sel.selectedOptions && sel.selectedOptions[0];
        return (opt ? opt.textContent : sel.value || '').trim();
      }
      return (td ? td.textContent : '').trim();
    };
    const rowStatus = (tr) => {
      if (idx.status === -1) return '';
      const td = tr.children[idx.status];
      return (td ? td.textContent : '').trim();
    };

    function applyFilters() {
      const sVal = statusSel.value;
      const dVal = driverSel.value;
      const fVal = fromDate.value ? new Date(fromDate.value) : null;
      const tVal = toDate.value   ? new Date(toDate.value)   : null;

      $$('tbody tr', table).forEach(tr => {
        let show = true;

        if (sVal)  show = show && (rowStatus(tr) === sVal);
        if (dVal)  show = show && (rowDriver(tr) === dVal);

        if (show && (fVal || tVal)) {
          const when = rowDate(tr);
          if (!when) show = false;
          if (show && fVal && when < new Date(fVal.getFullYear(), fVal.getMonth(), fVal.getDate())) show = false;
          if (show && tVal && when > new Date(tVal.getFullYear(), tVal.getMonth(), tVal.getDate(), 23, 59, 59)) show = false;
        }
        tr.style.display = show ? '' : 'none';
      });
    }

    [statusSel, driverSel, fromDate, toDate].forEach(el => el.addEventListener('change', applyFilters));
    clearBtn.addEventListener('click', () => { statusSel.value=''; driverSel.value=''; fromDate.value=''; toDate.value=''; applyFilters(); });

    // Keep options fresh if rows/pagination change
    const tbody = $('tbody', table);
    if (tbody) {
      new MutationObserver(() => {
        const sKeep=statusSel.value, dKeep=driverSel.value;
        const st=new Set(), dr=new Set();
        $$('tr', tbody).forEach(tr => {
          if (idx.status !== -1) st.add(rowStatus(tr));
          if (idx.driver !== -1) {
            dr.add(rowDriver(tr));
            // collect all choices from selects
            const sel = tr.children[idx.driver]?.querySelector('select');
            if (sel) Array.from(sel.options).forEach(o => dr.add((o.textContent||'').trim()));
          }
        });
        statusSel.length = 1; Array.from(st).filter(Boolean).sort().forEach(v => { const o=document.createElement('option'); o.value=v; o.textContent=v; statusSel.appendChild(o); });
        driverSel.length = 1; Array.from(dr).filter(Boolean).sort().forEach(v => { const o=document.createElement('option'); o.value=v; o.textContent=v; driverSel.appendChild(o); });
        statusSel.value = sKeep || ''; driverSel.value = dKeep || '';
        applyFilters();
      }).observe(tbody, { childList:true, subtree:true });
    }

    applyFilters();
  }

  // --------------- Skin a pane ----------------
  function skinPane(entry) {
    const root = getPaneRoot(entry);
    if (!root) return;

    skinToolbar(root);

    // Known tables first; fallback to any table
    let tables = [];
    (entry.tables || []).forEach(sel => { tables = tables.concat($$(sel, root)); });
    if (!tables.length) tables = $$('table', root).filter(t => !t.classList.contains('ws-table'));
    tables.forEach(t => skinTable(root, t));

    skinPager(root, entry.pager);
    skinModal(root, entry.modal);

    if (typeof entry.enhance === 'function') entry.enhance(root);
  }

  // --------------- Boot & observe ----------------
  function run(){ PANE_MAP.forEach(skinPane); }
  run();
  new MutationObserver(() => run()).observe(document.body, { childList:true, subtree:true });
})();
