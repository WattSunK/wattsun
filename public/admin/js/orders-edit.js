// public/admin/js/orders-edit.js
// Edit modal: status + driver search/select + notes + editable money + items.
// Details are fetched from the Track API (order + phone + email); fallback to cached rows.
// On Save: PATCH to /api/admin/orders/:id with a compatibility payload,
// then update the row inline and broadcast Step 6.4 without touching any other files.

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
  let current = null;                        // order object being edited (may be minimal)
  let fullOrder = null;                      // fully-hydrated order (with items + totals)
  let allowedStatuses = null;                // Set<string> from Orders filter
  let driverChosen = { id: null, name: '' }; // display label for row update

  // -------------------- Helpers --------------------
  const setSaving = (on) => { if (saveBtn) { saveBtn.disabled = !!on; saveBtn.textContent = on ? 'Saving…' : 'Save'; } };

  const fmtMoney = (amt, cur) => {
    const n = Number(amt || 0), c = (cur || 'KES') + '';
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: c }).format(n); }
    catch { return `${c} ${n.toLocaleString()}`; }
  };

  const debounce = (fn, ms = 220) => { let t = 0; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // -------------------- Status: hydrate from Orders filter --------------------
  function findOrdersStatusFilter() {
    const scopes = [document.getElementById('adminContent'), document.querySelector('.main-section'), document].filter(Boolean);
    for (const s of scopes) for (const sel of s.querySelectorAll('select')) {
      const first = sel.options?.[0]?.textContent?.trim()?.toLowerCase?.();
      if (first === 'all') return sel;
    }
    return null;
  }

  function hydrateStatusOptions(currentStatus) {
    allowedStatuses = null;
    const filterSel = findOrdersStatusFilter();
    const statuses = filterSel
      ? Array.from(filterSel.options).map(o => o.value || o.textContent).filter(Boolean)
      : ['Pending','Confirmed','Dispatched','Delivered','Closed','Cancelled']; // safe default

    if (statusSel) {
      statusSel.innerHTML = '';
      for (const s of statuses) {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        statusSel.appendChild(opt);
      }
      if (currentStatus && statuses.includes(currentStatus)) statusSel.value = currentStatus;
    }
    allowedStatuses = new Set(statuses);
  }

  // -------------------- Hydration: GET /api/track --------------------
  function getSessionUser() {
    try { return JSON.parse(localStorage.getItem('wattsunUser') || 'null') || {}; } catch { return {}; }
  }

  async function fetchOrderFromTrack({ orderId, phone, email }) {
    const sess = getSessionUser();
    const params = new URLSearchParams();
    if (phone || sess.phone) params.set('phone', (phone || sess.phone || '').trim());
    if (orderId) params.set('order', String(orderId).trim());
    // server supports email fallback if phone not found (header or query)
    const headers = {};
    if (email || sess.email) headers['X-WS-Email'] = (email || sess.email || '').trim();

    try {
      const res = await fetch(`/api/track?${params.toString()}`, { headers });
      const data = await res.json().catch(() => ({}));
      const list = data && Array.isArray(data.orders) ? data.orders : [];
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

  function fillItemsTable(items) {
    if (!itemsBody) return;
    itemsBody.innerHTML = '';
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.style.textAlign = 'center';
      td.textContent = 'No items';
      tr.appendChild(td);
      itemsBody.appendChild(tr);
      return;
    }
    for (const it of list) {
      const tr = document.createElement('tr');
      const tdSku = document.createElement('td'); tdSku.textContent = it.sku || it.id || '—';
      const tdName = document.createElement('td'); tdName.textContent = it.name || it.title || it.product || '';
      const tdQty = document.createElement('td'); tdQty.textContent = String(it.qty || it.quantity || 1);
      const tdPrice = document.createElement('td'); tdPrice.textContent = fmtMoney(it.price || it.unitPrice || 0, (currInp && currInp.value) || 'KES');
      tr.append(tdSku, tdName, tdQty, tdPrice);
      itemsBody.appendChild(tr);
    }
  }

  // -------------------- Drivers combobox --------------------
  async function queryDrivers(q) {
    const url = `/api/admin/users?type=Driver${q ? '&q=' + encodeURIComponent(q) : ''}`;
    try {
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      return Array.isArray(data?.users) ? data.users : [];
    } catch { return []; }
  }

  const onDriverType = debounce(async () => {
    const q = (driverInp?.value || '').trim();
    const list = await queryDrivers(q);
    driverList.innerHTML = '';
    for (const u of list) {
      const li = document.createElement('li');
      li.textContent = `${u.name || u.fullName || 'Driver'} — ${u.phone || ''}`.trim();
      li.tabIndex = 0;
      li.addEventListener('click', () => {
        driverChosen = { id: u.id, name: u.name || u.fullName || '' };
        if (driverIdH) driverIdH.value = u.id;
        if (driverInp) driverInp.value = driverChosen.name;
        driverList.style.display = 'none';
      });
      driverList.appendChild(li);
    }
    driverList.style.display = 'block';
  }, 220);

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
    hydrateStatusOptions(current.status);

    // reset driver UI every time the modal opens
    if (driverIdH) driverIdH.value = current.driver_id || current.driverId || '';
    if (driverInp) driverInp.value = current.driverName || current.driver || '';
    driverChosen = { id: driverIdH?.value || null, name: driverInp?.value || '' };

    if (idInput)   idInput.value   = idVal;
    if (statusSel) statusSel.value = current.status || statusSel.value || 'Pending';
    if (notesEl)   notesEl.value   = current.notes || '';

    // money defaults (don’t block if missing)
    if (totalInp)   totalInp.value   = String(current.total || current.totalCents/100 || 0);
    if (depositInp) depositInp.value = String(current.deposit || current.depositCents/100 || 0);
    if (currInp)    currInp.value    = current.currency || 'KES';

    // Items + accurate totals via Track
    try {
      const hydrated = await fetchOrderFromTrack({ orderId: idVal, phone: current.phone, email: current.email });
      fullOrder = hydrated || null;

      // Money fields
      if (fullOrder) {
        if (typeof fullOrder.total === 'number' && totalInp)   totalInp.value   = String(fullOrder.total);
        if (typeof fullOrder.deposit === 'number' && depositInp) depositInp.value = String(fullOrder.deposit);
        if (fullOrder.currency && currInp) currInp.value = fullOrder.currency;
        // Items
        fillItemsTable(fullOrder.items || fullOrder.cart || fullOrder.cart_items || []);
      } else {
        fillItemsTable([]); // keep a neat empty state
      }
    } catch {
      fillItemsTable([]);
    }

    if (modal) modal.style.display = 'block';
  }

  function closeModal() {
    if (modal) modal.style.display = 'none';
  }

  cancelBtn?.addEventListener('click', (e) => { e.preventDefault(); closeModal(); });

  // -------------------- Save (PATCH /api/admin/orders/:id) --------------------
  async function save() {
    if (!current) return;
    const idForUrl = current.id || current.orderNumber || idInput?.value || '';

    const status  = statusSel?.value || current.status || 'Pending';
    const notes   = notesEl?.value || '';
    const driverIdRaw = driverIdH?.value || driverChosen.id || '';

    const payload = {
      // canonical
      status,
      notes,
      // driver: both shapes for compatibility
      driver_id: driverIdRaw || null,
      driverId:  driverIdRaw || null,
      // money (leave as-is; backend may ignore)
      total:   totalInp ? Number(totalInp.value || 0) : undefined,
      deposit: depositInp ? Number(depositInp.value || 0) : undefined,
      currency: currInp ? String(currInp.value || 'KES') : undefined,
      // id echoes (some legacy handlers look for these)
      id: idForUrl,
      orderNumber: idForUrl
    };

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(idForUrl)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const text = await res.text(); // capture raw text for useful errors
      let json; try { json = JSON.parse(text); } catch {}

      if (!res.ok || (json && json.success === false)) {
        const msg = (json && (json.error?.message || json.message)) || text || `HTTP ${res.status}`;
        throw new Error(msg);
      }

      // Inline refresh of the row (non-regressive)
      const row =
        host?.querySelector(`tr[data-oid="${String(idForUrl)}"]`) ||
        host?.querySelector(`button[data-oid="${String(idForUrl)}"]`)?.closest('tr') ||
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
      console.error('[orders-edit] save failed:', err);
      alert(`Failed to save order changes.\n\n${(err && err.message) ? err.message : ''}`);
    } finally {
      setSaving(false);
    }
  }

  saveBtn?.addEventListener('click', (e) => { e.preventDefault(); save(); });

  // -------------------- Binder (open from list/buttons) --------------------
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="edit-order"]');
    if (!btn) return;

    e.preventDefault();
    const oid   = btn.getAttribute('data-oid') || '';
    const phone = btn.getAttribute('data-phone') || '';
    const email = btn.getAttribute('data-email') || '';

    (async () => wireDriverCombo())();

    let order = fromCache(oid) || { id: oid, orderNumber: oid, phone, email };
    // pass phone/email so Track can resolve items/totals
    order.phone = order.phone || phone;
    order.email = order.email || email;

    openModalFor(order);
  });

  // Expose programmatic hook for the binder
  if (typeof window.openOrderEdit !== 'function') window.openOrderEdit = (order) => openModalFor(order);
})();
