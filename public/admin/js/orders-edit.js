// public/admin/js/orders-edit.js
// Edit modal (status + driver + notes), money fields (read-only), items list.
// PATCH on save, update table row, and broadcast Step 6.4 signals.

// -------------------- IIFE --------------------
(() => {
  // -------------------- Elements --------------------
  const modal       = document.getElementById('orderEditModal');
  const saveBtn     = document.getElementById('orderSaveBtn');
  const cancelBtn   = document.getElementById('orderCancelBtn');

  const idInput     = document.getElementById('orderEditId');
  const statusSel   = document.getElementById('orderEditStatus');

  // Driver combobox (search + select)
  const driverIdH   = document.getElementById('orderEditDriverId');     // hidden numeric id
  const driverInp   = document.getElementById('orderEditDriverInput');  // text input (search)
  const driverList  = document.getElementById('orderEditDriverList');   // results list (<ul>)
  const driverClear = document.getElementById('orderEditDriverClear');  // clear selected

  const notesEl     = document.getElementById('orderEditNotes');

  // Money read-only fields
  const moneyTotalEl   = document.getElementById('orderEditTotal');
  const moneyDepositEl = document.getElementById('orderEditDeposit');
  const moneyCurrEl    = document.getElementById('orderEditCurrency');

  // Items table body
  const itemsBody = document.getElementById('orderEditItemsBody');

  // Orders table host for inline refresh
  const host = document.getElementById('ordersTbody') || document.getElementById('adminContent') || document.body;

  // -------------------- State --------------------
  let current = null;                        // order object being edited
  let allowedStatuses = null;                // Set<string> hydrated from Orders list "Status" filter
  let driverChosen = { id: null, name: '' }; // display label for row update

  // -------------------- Helpers --------------------
  const setSaving = (on) => {
    if (!saveBtn) return;
    saveBtn.disabled = !!on;
    saveBtn.textContent = on ? 'Saving…' : 'Save';
  };

  const fmtMoney = (amt, cur) => {
    const n = Number(amt || 0);
    const c = (cur || 'KES') + '';
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: c }).format(n);
    } catch {
      return `${c} ${n.toLocaleString()}`;
    }
  };

  // Debounce
  const debounce = (fn, ms = 220) => {
    let t = 0;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  // -------------------- Status: hydrate from Orders filter --------------------
  function findOrdersStatusFilter() {
    const scopes = [
      document.getElementById('adminContent'),
      document.querySelector('.main-section'),
      document
    ].filter(Boolean);

    for (const s of scopes) {
      const sels = s.querySelectorAll('select');
      for (const sel of sels) {
        const first = sel.options?.[0]?.textContent?.trim()?.toLowerCase?.();
        if (first === 'all') return sel; // common pattern on Orders tab
      }
    }
    return null;
  }

  function hydrateStatusOptions(currentStatus) {
    if (!statusSel) return;
    const filter = findOrdersStatusFilter();
    const options = [];
    if (filter) {
      for (const opt of filter.options) {
        const label = (opt.textContent || '').trim();
        if (!label || /^all$/i.test(label)) continue;
        options.push(label);
      }
    }
    // Fallback if no filter found
    if (!options.length) options.push('Pending', 'Processing', 'Delivered', 'Cancelled');

    allowedStatuses = new Set(options.map(s => s.toLowerCase()));
    statusSel.innerHTML = options.map(s => {
      const sel = String(s).toLowerCase() === String(currentStatus || '').toLowerCase() ? ' selected' : '';
      return `<option${sel}>${s}</option>`;
    }).join('');
  }

  // -------------------- Data: fetch helpers --------------------
  function fromCache(id) {
    if (window.ORDERS_BY_ID?.[id]) return window.ORDERS_BY_ID[id];
    if (Array.isArray(window.ORDERS)) {
      const hit = window.ORDERS.find(o => String(o.id) === String(id) || String(o.orderNumber) === String(id));
      if (hit) return hit;
    }
    if (window.__ordersIndex?.[id]) return window.__ordersIndex[id];
    return null;
  }

  async function fetchOne(id) {
    // Prefer a per-order endpoint if present; fallback to full list
    const tryUrls = [
      `/api/admin/orders/${encodeURIComponent(id)}`,
      `/api/admin/orders?id=${encodeURIComponent(id)}`, // alternative style
      `/api/admin/orders` // last resort (pick by id)
    ];
    for (const url of tryUrls) {
      try {
        const r = await fetch(url);
        if (!r.ok) continue;
        const data = await r.json();
        if (Array.isArray(data)) {
          const found = data.find(o => String(o.id) === String(id) || String(o.orderNumber) === String(id));
          if (found) return found;
        } else if (data && (data.id || data.orderNumber)) {
          return data;
        }
      } catch { /* keep trying */ }
    }
    return null;
  }

  // Normalize different back-end shapes
  function coerceItems(o) {
    return (
      o?.items ||
      o?.lines ||
      o?.cart ||
      []
    );
  }
  function coerceTotals(o) {
    const total = o?.total ?? o?.net ?? o?.amount ?? 0;
    const deposit = o?.deposit ?? o?.depositAmount ?? o?.advance ?? o?.downpayment ?? 0;
    const currency = o?.currency ?? o?.curr ?? 'KES';
    return { total, deposit, currency };
  }

  function renderItems(o) {
    if (!itemsBody) return;
    const items = coerceItems(o);
    itemsBody.innerHTML = '';
    if (!Array.isArray(items) || !items.length) {
      itemsBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#6b7280">No items</td></tr>`;
      return;
    }
    const currency = o?.currency || 'KES';
    for (const it of items) {
      const sku  = it.sku || it.SKU || it.code || '';
      const name = it.name || it.title || it.productName || '';
      const qty  = it.qty || it.quantity || 1;
      const price = it.price || it.unitPrice || it.amount || 0;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${sku}</td>
        <td>${name}</td>
        <td>${qty}</td>
        <td>${fmtMoney(price, currency)}</td>
      `;
      itemsBody.appendChild(tr);
    }
  }

  function renderMoney(o) {
    if (!moneyTotalEl && !moneyDepositEl && !moneyCurrEl) return;
    const t = coerceTotals(o);
    if (moneyTotalEl)   moneyTotalEl.textContent   = fmtMoney(t.total, t.currency);
    if (moneyDepositEl) moneyDepositEl.textContent = fmtMoney(t.deposit, t.currency);
    if (moneyCurrEl)    moneyCurrEl.textContent    = (t.currency || 'KES');
  }

  // -------------------- Driver search/select --------------------
  function renderDriverResults(items) {
    if (!driverList) return;
    driverList.innerHTML = '';
    const arr = Array.isArray(items) ? items : [];

    if (!arr.length) {
      const li = document.createElement('li');
      li.className = 'ws-driver-empty';
      li.textContent = 'No drivers found';
      driverList.appendChild(li);
      driverList.style.display = 'block';
      return;
    }

    for (const d of arr) {
      const li = document.createElement('li');
      li.className = 'ws-driver-item';
      const label = d.name || d.fullName || d.email || `Driver ${d.id}`;
      li.textContent = label;
      li.tabIndex = 0;
      li.dataset.id = d.id;
      li.addEventListener('click', () => {
        if (driverIdH)  driverIdH.value = d.id;
        if (driverInp)  driverInp.value = label;
        driverChosen = { id: d.id, name: label };
        driverList.style.display = 'none';
      });
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter') li.click(); });
      driverList.appendChild(li);
    }
    driverList.style.display = 'block';
  }

  async function searchDrivers(q) {
    const qs = encodeURIComponent(q || '');
    const endpoints = [
      `/api/admin/users?type=driver&q=${qs}`,
      `/api/admin/users?role=driver&q=${qs}`,
      `/api/admin/users?q=${qs}&type=driver`,
      `/api/admin/drivers?q=${qs}`
    ];
    for (const url of endpoints) {
      try {
        const r = await fetch(url);
        if (!r.ok) continue;
        const data = await r.json();
        const list = Array.isArray(data) ? data : (Array.isArray(data?.users) ? data.users : []);
        if (list?.length) return list;
      } catch {}
    }
    return [];
  }

  const onDriverType = debounce(async () => {
    const q = (driverInp?.value || '').trim();
    if (!q) { if (driverList) driverList.style.display = 'none'; return; }
    const res = await searchDrivers(q);
    renderDriverResults(res);
  }, 200);

  function wireDriverCombo() {
    if (!driverInp || !driverList) return;
    driverInp.addEventListener('input', onDriverType);
    driverInp.addEventListener('focus', onDriverType);
    document.addEventListener('click', (e) => {
      if (!driverList) return;
      const inside = e.target === driverList || driverList.contains(e.target) || e.target === driverInp;
      if (!inside) driverList.style.display = 'none';
    });
    driverClear?.addEventListener('click', (e) => {
      e.preventDefault();
      if (driverIdH) driverIdH.value = '';
      if (driverInp) driverInp.value = '';
      driverChosen = { id: null, name: '' };
      driverList.style.display = 'none';
    });
  }

  // -------------------- Modal open/close --------------------
  async function openModalFor(order) {
    current = order || null;
    if (!current) return;

    // Fill from cache; if items/totals missing, fetch a fuller shape
    let full = current;
    const needDetails = !(coerceItems(full)?.length) || (full.total == null && full.amount == null);
    if (needDetails) {
      const fetched = await fetchOne(current.id || current.orderNumber);
      if (fetched) full = Object.assign({}, full, fetched);
    }

    hydrateStatusOptions(full.status);

    const idVal = full.id || full.orderNumber || '';
    if (idInput)   idInput.value   = idVal;
    if (statusSel) statusSel.value = full.status || statusSel.value || 'Pending';

    const initDriverId   = (full.driver_id != null ? Number(full.driver_id) : null);
    const initDriverName = full.driver_name || full.driver || '';
    if (driverIdH)  driverIdH.value = initDriverId ? String(initDriverId) : '';
    if (driverInp)  driverInp.value = initDriverName || (initDriverId ? `Driver ${initDriverId}` : '');
    driverChosen = { id: initDriverId, name: driverInp?.value || '' };

    if (notesEl) notesEl.value = full.notes || '';

    renderMoney(full);
    renderItems(full);

    if (modal) {
      modal.style.display = 'block';
      modal.removeAttribute('aria-hidden');
    }
  }

  function closeModal() {
    if (modal) {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    }
    current = null;
  }

  // -------------------- Events --------------------
  cancelBtn?.addEventListener('click', (e) => { e.preventDefault(); closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  saveBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!current) return;

    const status = (statusSel?.value || 'Pending').trim();
    if (allowedStatuses && !allowedStatuses.has(status.toLowerCase())) {
      alert(`Status "${status}" isn’t allowed. Choose one of: ${[...allowedStatuses].join(', ')}`);
      return;
    }

    const idForUrl = current.id || current.orderNumber;
    const payload = {
      status,
      driver_id: driverIdH?.value ? Number(driverIdH.value) : null,
      notes: (notesEl?.value || '').trim()
    };

    try {
      setSaving(true);
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(idForUrl)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const t = await res.text();
        alert(`Failed to save order changes.\n${t || res.status}`);
        return;
      }

      // Inline row update (best effort)
      const selId = String(idForUrl);
      const row =
        host?.querySelector(`tr[data-oid="${selId}"]`) ||
        host?.querySelector(`button[data-oid="${selId}"]`)?.closest('tr') ||
        null;

      if (row) {
        const statusCell = row.querySelector('[data-col="status"], .col-status');
        if (statusCell) statusCell.textContent = payload.status;

        const driverCell = row.querySelector('[data-col="driver"], .col-driver');
        if (driverCell) driverCell.textContent = (driverChosen.name || (payload.driver_id ? `Driver ${payload.driver_id}` : ''));

        const notesCell = row.querySelector('[data-col="notes"], .col-notes');
        if (notesCell) notesCell.textContent = payload.notes || '';
      }

      // Step 6.4 broadcast (success only)
      try {
        localStorage.setItem('ordersUpdatedAt', String(Date.now()));
        window.postMessage({ type: 'orders-updated', orderId: idForUrl }, '*');
      } catch {}

      closeModal();
    } catch (err) {
      console.error(err);
      alert('Failed to save order changes.');
    } finally {
      setSaving(false);
    }
  });

  // Safety delegate in case native edit binds are missing
  document.addEventListener('DOMContentLoaded', () => {
    wireDriverCombo();
    host?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action="edit"], .order-edit-btn, .js-order-edit-btn, button[title*="Edit" i], a[title*="Edit" i]');
      if (!btn) return;
      const row = btn.closest('tr');
      const oid = btn.dataset.oid || btn.getAttribute('data-id') || row?.dataset?.oid || row?.dataset?.id || '';
      if (!oid) { alert('Could not determine order id.'); return; }
      let order = fromCache(oid);
      if (!order) order = await fetchOne(oid);
      openModalFor(order || { id: oid });
    });
  });

  // Programmatic hook used by the dashboard binder
  if (typeof window.openOrderEdit !== 'function') {
    window.openOrderEdit = (order) => openModalFor(order);
  }
})();
