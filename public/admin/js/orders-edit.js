// public/admin/js/orders-edit.js
// Edit modal: status + driver search/select + notes + editable money + items.
// Loads details from the Track API (order + phone + email) first,
// then PATCHes to /api/admin/orders/:id. On success: inline row update + Step 6.4 broadcast.

(() => {
  // -------------------- Elements --------------------
  const modal       = document.getElementById('orderEditModal');
  const saveBtn     = document.getElementById('orderSaveBtn');
  const cancelBtn   = document.getElementById('orderCancelBtn');

  const idInput     = document.getElementById('orderEditId');
  const statusSel   = document.getElementById('orderEditStatus');

  // Driver combobox (search + select)
  const driverIdH   = document.getElementById('orderEditDriverId');
  const driverInp   = document.getElementById('orderEditDriverInput');
  const driverList  = document.getElementById('orderEditDriverList');
  const driverClear = document.getElementById('orderEditDriverClear');

  const notesEl     = document.getElementById('orderEditNotes');

  // Editable money fields
  const totalInp    = document.getElementById('orderEditTotalInput');
  const depositInp  = document.getElementById('orderEditDepositInput');
  const currInp     = document.getElementById('orderEditCurrencyInput');

  // Items table body
  const itemsBody   = document.getElementById('orderEditItemsBody');

  // Orders table host for inline refresh
  const host = document.getElementById('ordersTbody') || document.getElementById('adminContent') || document.body;

  // -------------------- State --------------------
  let current = null;                        // order object being edited
  let allowedStatuses = null;                // Set<string> from Orders filter
  let driverChosen = { id: null, name: '' }; // display label for row update

  // -------------------- Helpers --------------------
  const setSaving = (on) => {
    if (saveBtn) {
      saveBtn.disabled = !!on;
      saveBtn.textContent = on ? 'Saving…' : 'Save';
    }
  };

  const fmtMoney = (amt, cur) => {
    const n = Number(amt || 0);
    const c = (cur || 'KES') + '';
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: c }).format(n); }
    catch { return `${c} ${n.toLocaleString()}`; }
  };

  const debounce = (fn, ms = 220) => { let t = 0; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // -------------------- Status: hydrate from Orders filter --------------------
  function findOrdersStatusFilter() {
    const scopes = [document.getElementById('adminContent'), document.querySelector('.main-section'), document]
      .filter(Boolean);
    for (const s of scopes) {
      for (const sel of s.querySelectorAll('select')) {
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
    if (!options.length) options.push('Pending', 'Processing', 'Delivered', 'Cancelled');

    allowedStatuses = new Set(options.map(s => s.toLowerCase()));
    statusSel.innerHTML = options
      .map(s => `<option${String(s).toLowerCase() === String(currentStatus || '').toLowerCase() ? ' selected' : ''}>${s}</option>`)
      .join('');
  }

  // -------------------- Data: Track first, admin as fallback --------------------
  function getSession() {
    try {
      const raw = localStorage.getItem('wattsunUser') || localStorage.getItem('ws_user');
      if (!raw) return {};
      const o = JSON.parse(raw);
      return o.user ? o.user : o;
    } catch { return {}; }
  }

  async function fetchViaTrack(orderId) {
    // Use same inputs Track uses
    const sess = getSession();
    const body = {
      order: orderId,
      phone: (sess.phone || '').trim(),
      email: (sess.email || '').trim()
    };
    try {
      const res = await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data) ? data : (data && Array.isArray(data.orders) ? data.orders : []);
      if (list && list.length) {
        const hit = list.find(o => String(o.orderNumber) === String(orderId)) || list[0];
        return hit || null;
      }
      return null;
    } catch { return null; }
  }

  function fromCache(id) {
    if (window.ORDERS_BY_ID?.[id]) return window.ORDERS_BY_ID[id];
    if (Array.isArray(window.ORDERS)) {
      const hit = window.ORDERS.find(o => String(o.id) === String(id) || String(o.orderNumber) === String(id));
      if (hit) return hit;
    }
    if (window.__ordersIndex?.[id]) return window.__ordersIndex[id];
    return null;
  }

  async function fetchViaAdmin(id) {
    const tryUrls = [
      `/api/admin/orders/${encodeURIComponent(id)}`,
      `/api/admin/orders?id=${encodeURIComponent(id)}`,
      `/api/admin/orders`
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
      } catch {}
    }
    return null;
  }

  function coerceTotals(o) {
    const total = o?.total ?? o?.net ?? o?.amount ?? 0;
    const deposit = o?.deposit ?? o?.depositAmount ?? o?.advance ?? o?.downpayment ?? 0;
    const currency = o?.currency ?? o?.curr ?? 'KES';
    return { total: Number(total || 0), deposit: Number(deposit || 0), currency };
  }

  function coerceItems(o) { return o?.items || o?.lines || o?.cart || []; }

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

  // -------------------- Driver search/select --------------------
  const onDriverType = debounce(async () => {
    const q = (driverInp?.value || '').trim();
    if (!q) { if (driverList) driverList.style.display = 'none'; return; }
    const endpoints = [
      `/api/admin/users?type=driver&q=${encodeURIComponent(q)}`,
      `/api/admin/users?role=driver&q=${encodeURIComponent(q)}`,
      `/api/admin/users?q=${encodeURIComponent(q)}&type=driver`,
      `/api/admin/drivers?q=${encodeURIComponent(q)}`
    ];
    let list = [];
    for (const url of endpoints) {
      try {
        const r = await fetch(url);
        if (!r.ok) continue;
        const data = await r.json();
        list = Array.isArray(data) ? data : (Array.isArray(data?.users) ? data.users : []);
        if (list?.length) break;
      } catch {}
    }
    renderDriverResults(list);
  }, 200);

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

  function wireDriverCombo() {
    if (!driverInp || !driverList) return;
    driverInp.addEventListener('input', onDriverType);
    driverInp.addEventListener('focus', onDriverType);
    document.addEventListener('click', (e) => {
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

    const idVal = current.id || current.orderNumber || current.order || '';
    let full = (await fetchViaTrack(idVal)) || current;
    if (!coerceItems(full)?.length || (full.total == null && full.amount == null)) {
      const fallback = await fetchViaAdmin(idVal);
      if (fallback) full = Object.assign({}, full, fallback);
    }

    hydrateStatusOptions(full.status);

    if (idInput)   idInput.value   = idVal;
    if (statusSel) statusSel.value = full.status || statusSel.value || 'Pending';

    // Money (editable)
    const totals = coerceTotals(full);
    if (totalInp)   totalInp.value   = String(totals.total ?? '');
    if (depositInp) depositInp.value = String(totals.deposit ?? '');
    if (currInp)    currInp.value    = totals.currency || 'KES';

    // Driver
    const initDriverId   = (full.driver_id != null ? Number(full.driver_id) : null);
    const initDriverName = full.driver_name || full.driver || '';
    if (driverIdH)  driverIdH.value = initDriverId ? String(initDriverId) : '';
    if (driverInp)  driverInp.value = initDriverName || (initDriverId ? `Driver ${initDriverId}` : '');
    driverChosen = { id: initDriverId, name: driverInp?.value || '' };

    if (notesEl) notesEl.value = full.notes || '';

    renderItems(full);

    if (modal) { modal.style.display = 'block'; modal.removeAttribute('aria-hidden'); }
  }

  function closeModal() {
    if (modal) { modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true'); }
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
      notes: (notesEl?.value || '').trim(),
      // money fields (editable)
      total:   totalInp?.value !== ''   ? Number(totalInp.value)   : undefined,
      deposit: depositInp?.value !== '' ? Number(depositInp.value) : undefined,
      currency: (currInp?.value || '').trim() || undefined
    };

    // Defensive: coerce NaNs to undefined so backend validator doesn’t choke
    if (Number.isNaN(payload.total))   payload.total = undefined;
    if (Number.isNaN(payload.deposit)) payload.deposit = undefined;

    try {
      setSaving(true);

      const res = await fetch(`/api/admin/orders/${encodeURIComponent(idForUrl)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const t = await res.text().catch(()=>'');
        alert(`Failed to save order changes.\n${t || res.status}`);
        return;
      }

      // Inline row update (best effort) — does NOT touch filters/pagination
      const selId = String(idForUrl);
      const row =
        host?.querySelector(`tr[data-oid="${selId}"]`) ||
        host?.querySelector(`button[data-oid="${selId}"]`)?.closest('tr') ||
        null;

      if (row) {
        const statusCell = row.querySelector('[data-col="status"], .col-status');
        if (statusCell) statusCell.textContent = status;

        const driverCell = row.querySelector('[data-col="driver"], .col-driver');
        if (driverCell) driverCell.textContent = driverChosen.name || (payload.driver_id ? `Driver ${payload.driver_id}` : '');

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

  // Safety delegate (if native binds are missing)
  document.addEventListener('DOMContentLoaded', () => {
    wireDriverCombo();
    host?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action="edit"], .order-edit-btn, .js-order-edit-btn, button[title*="Edit" i], a[title*="Edit" i]');
      if (!btn) return;
      const row = btn.closest('tr');
      const oid = btn.dataset.oid || btn.getAttribute('data-id') || row?.dataset?.oid || row?.dataset?.id || '';
      if (!oid) { alert('Could not determine order id.'); return; }
      let order = fromCache(oid);
      if (!order) order = await fetchViaTrack(oid) || await fetchViaAdmin(oid);
      openModalFor(order || { id: oid });
    });
  });

  // Expose programmatic hook for the binder
  if (typeof window.openOrderEdit !== 'function') window.openOrderEdit = (order) => openModalFor(order);
})();
