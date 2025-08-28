/* === Step 6.5 Analysis Probes — ADDITIVE ONLY (v1.3) ===
   No behavior changes. Emits console.debug logs when WS_DEBUG_ORDERS === true.
   Always logs a one-time console.info on load.
*/
(() => {
  console.info('[ORDERS][probes] script loaded v1.3');

  if (window.__WS_ORDERS_PROBES_INSTALLED__) {
    console.info('[ORDERS][probes] already installed, skipping re-init');
    return;
  }
  window.__WS_ORDERS_PROBES_INSTALLED__ = true;

  if (!('WS_DEBUG_ORDERS' in window)) window.WS_DEBUG_ORDERS = true;
  const ON = () => !!window.WS_DEBUG_ORDERS;

  const now = () => new Date().toISOString().slice(11, 23);
  const post = (type, data = {}) => {
    if (!ON()) return;
    const msg = { t: now(), type, ...data };
    console.debug('[ORDERS]', msg);
    try { localStorage.setItem('__ORD_LAST', JSON.stringify(msg)); } catch (_) {}
  };
  const safe = (fnName, wrap) => {
    const parts = fnName.split('.');
    let ctx = window, key = parts.pop();
    for (const p of parts) ctx = ctx?.[p];
    if (!ctx || !key || typeof ctx[key] !== 'function') return null;
    const original = ctx[key];
    const wrapped = wrap(original);
    try { ctx[key] = wrapped; } catch (_) {}
    return { ctx, key, original, wrapped };
  };

  // ---------- helpers exposed ----------
  function extractText(el) {
    if (!el) return null;
    // Prefer visible text of common wrappers
    const t =
      el.querySelector?.('a,span,strong,em,div')?.textContent?.trim() ??
      el.textContent?.trim() ?? null;
    return t || null;
  }

  window.__ordersTrace = Object.assign(window.__ordersTrace || {}, {
    ev: post,
    debugRow(tr) {
      const cells = tr ? tr.querySelectorAll('td,th') : null;
      post('row:debug', {
        cellCount: cells?.length || 0,
        c0: extractText(cells?.[0]),
        c4: extractText(cells?.[4]),
        c5: extractText(cells?.[5]),
        html0: cells?.[0]?.innerHTML?.slice?.(0, 120) || null
      });
    },
    snapRow(tr) {
      if (!tr) return {
        orderId:null,total:null,deposit:null,currency:null,status:null,driver:null
      };
      const get = (sel) => tr?.querySelector(sel)?.textContent?.trim() || null;

      // semantic selectors (future-proof)
      let orderId = tr?.dataset?.orderId || get('[data-col="orderNumber"]') || get('.order-number');
      let status  = get('[data-col="status"]')  || get('.order-status');
      let total   = get('[data-col="total"]')   || get('.order-total');
      let deposit = get('[data-col="deposit"]') || get('.order-deposit');
      let currency= get('[data-col="currency"]')|| get('.order-currency');
      let driver  = tr?.dataset?.driverId || get('[data-col="driver"]') || get('.order-driver');

      // positional fallback (supports td or th)
      const cells = tr.querySelectorAll('td,th');
      if (cells.length >= 6) {
        if (!orderId) orderId = extractText(cells[0]);
        if (!status)  status  = extractText(cells[4]);
        if (!total)   total   = extractText(cells[5]);
        if (!currency && total) {
          // match "KES 2,500,000.00" or similar
          const m = total.match(/\b([A-Z]{3})\b/);
          if (m) currency = m[1];
        }
      }

      return { orderId, total, deposit, currency, status, driver };
    },
    async assertBackend(orderId, phone) {
      try {
        const r = await fetch(`/api/track?order=${encodeURIComponent(orderId)}&phone=${encodeURIComponent(phone||'')}`);
        const j = await r.json();
        const o = (j.orders || []).find(x => (x.orderNumber||x.id) === orderId) || null;
        post('assert:backend', { orderId, got: o ? {
          total:o.total, deposit:o.deposit, currency:o.currency, status:o.status, items:(o.items||[]).length
        } : null });
        return o;
      } catch (e) { post('assert:backend:error', { orderId, err: String(e) }); }
    }
  });

  // -------- breadcrumbs: storage + visibility ----------
  addEventListener('storage', (e) => {
    if (e.key === 'ordersUpdatedAt') post('storage:ordersUpdatedAt', { newValue: e.newValue });
  });
  document.addEventListener('visibilitychange', () => {
    post('doc:visibility', { state: document.visibilityState });
  });

  // -------- partial mount/unmount detection ----------
  const ORD_SEL = [
    '[data-partial="orders"]',
    '#orders', '.orders-partial', 'section.orders',
    'table#ordersTable', 'table[data-orders]', 'table.orders-table',
    '#ordersTable', '#ordersTbody'
  ].join(',');

  let mountedCount = 0;
  const seen = new WeakSet();
  const markMount = (node) => { if (!seen.has(node)) { seen.add(node); post('partial:orders:mount', { n: ++mountedCount }); } };
  const markUnmount = () => post('partial:orders:unmount', { n: mountedCount });

  const obs = new MutationObserver((mut) => {
    for (const m of mut) {
      [...m.addedNodes].forEach((n) => {
        if (n.nodeType !== 1) return;
        if (n.matches?.(ORD_SEL) || n.querySelector?.(ORD_SEL)) markMount(n);
      });
      [...m.removedNodes].forEach((n) => {
        if (n.nodeType !== 1) return;
        if (n.matches?.(ORD_SEL) || n.querySelector?.(ORD_SEL)) markUnmount();
      });
    }
  });
  try { obs.observe(document.body, { childList: true, subtree: true }); } catch (_) {}
  queueMicrotask(() => { const first = document.querySelector(ORD_SEL); if (first) markMount(first); });

  // -------- anchors: edit open / defaults ----------
  safe('OrdersEdit.openEditModal', (orig) => function wrappedOpenEdit(order, ...rest) {
    try { post('edit:open', { orderId: order?.orderNumber || order?.id }); } catch(_) {}
    return orig.apply(this, [order, ...rest]);
  });

  ['OrdersEdit.applyMoneyDefaults','OrdersEdit.prefillEditForm','OrdersEdit.fillEditFields']
  .forEach((name) => {
    safe(name, (orig) => function wrappedDefaults(order, ...rest) {
      const r = orig.apply(this, [order, ...rest]);
      try {
        const orderId = order?.orderNumber || order?.id;
        const totalCents   = (document.querySelector('#edit-total')?.value ?? '').trim();
        const depositCents = (document.querySelector('#edit-deposit')?.value ?? '').trim();
        const currency     = (document.querySelector('#edit-currency')?.value ?? '').trim();
        post('edit:defaults', { orderId, totalCents, depositCents, currency, source:'(filled)' });
      } catch(_) {}
      return r;
    });
  });

  // -------- PATCH success ----------
  let saveHooked = false;
  ['OrdersEdit.saveEdit','OrdersEdit.saveOrderPatch','OrdersEdit.submitEdit']
  .forEach((name) => {
    const h = safe(name, (orig) => async function wrappedSave(...args) {
      const result = await orig.apply(this, args);
      try {
        const orderId = (args[0]?.orderId) || document.querySelector('#edit-order-id')?.value || null;
        const totalCents   = (document.querySelector('#edit-total')?.value ?? '').trim();
        const depositCents = (document.querySelector('#edit-deposit')?.value ?? '').trim();
        const currency     = (document.querySelector('#edit-currency')?.value ?? '').trim();
        const status       = (document.querySelector('#edit-status')?.value ?? '').trim();
        const driverId     = (document.querySelector('#edit-driver')?.dataset?.driverId
                              || document.querySelector('#edit-driver-id')?.value || '').trim();
        post('patch:ok', { orderId, sent:{ totalCents, depositCents, currency, status, driverId } });
      } catch(_) {}
      return result;
    });
    if (h) saveHooked = true;
  });

  if (!saveHooked) {
    const _fetch = window.fetch;
    window.fetch = async function wrappedFetch(input, init = {}) {
      const url = typeof input === 'string' ? input : input?.url || '';
      const method = (init?.method || 'GET').toUpperCase();
      const isPatch = method === 'PATCH' && /\/api\/admin\/orders\//.test(url);
      let bodyObj = null;
      if (isPatch && init?.body) { try { bodyObj = JSON.parse(init.body); } catch (_) {} }
      const resp = await _fetch.apply(this, arguments);
      if (isPatch && resp.ok) {
        const orderId = url.split('/').pop();
        post('patch:ok', { orderId, sent: bodyObj || {} });
      }
      return resp;
    };
  }

  // -------- row UI updated ----------
  ['OrdersEdit.updateOrderRowUI','OrdersEdit.refreshRow','OrdersEdit.applyRowPatch']
  .forEach((name) => {
    safe(name, (orig) => function wrappedUpdateRow(tr, data, ...rest) {
      const r = orig.apply(this, [tr, data, ...rest]);
      try { post('row:update:ui', window.__ordersTrace.snapRow(tr)); } catch(_) {}
      return r;
    });
  });

  let rowEmitScheduled = false, lastEmitAt = 0;
  const rowObs = new MutationObserver(() => {
    if (rowEmitScheduled) return;
    rowEmitScheduled = true;
    queueMicrotask(() => {
      rowEmitScheduled = false;
      const tr = document.querySelector('table [data-order-id].editing, table [data-order-id].just-saved')
             || document.querySelector('table#ordersTable tbody tr.selected');
      if (!tr) return;
      const nowTs = Date.now();
      if (nowTs - lastEmitAt < 250) return;
      lastEmitAt = nowTs;
      post('row:update:ui', window.__ordersTrace.snapRow(tr));
    });
  });
  try { rowObs.observe(document.body, { subtree: true, childList: true, characterData: true }); } catch(_) {}

  // -------- view modal filled ----------
  ['OrdersEdit.openViewModal','OrdersEdit.showView','OrdersEdit.viewOrder']
  .forEach((name) => {
    safe(name, (orig) => function wrappedView(order, ...rest) {
      const res = orig.apply(this, [order, ...rest]);
      try {
        const orderId = order?.orderNumber || order?.id;
        const fields = ['status','total','deposit','currency'];
        const fieldsPresent = fields.every(id => !!document.querySelector(`#view-${id}`));
        const itemsCount = (order?.items || []).length;
        post('view:open:filled', { orderId, fieldsPresent, itemsCount });
      } catch(_) {}
      return res;
    });
  });

  setTimeout(() => post('probes:ready', { mode: 'orders-edit' }), 0);
})();
