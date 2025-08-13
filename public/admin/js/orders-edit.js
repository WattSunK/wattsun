// public/admin/js/orders-edit.js
// Edit Order modal: reliably load order amounts & items, then allow status/driver/notes save.
// Surgical fix: make Track call use GET first (per contract), with robust fallbacks.

(() => {
  // ---------- Element refs ----------
  const modal            = document.getElementById('orderEditModal');
  const saveBtn          = document.getElementById('orderSaveBtn');
  const cancelBtn        = document.getElementById('orderCancelBtn');

  const idInput          = document.getElementById('orderEditId');
  const statusSel        = document.getElementById('orderEditStatus');
  const notesEl          = document.getElementById('orderEditNotes');

  const totalInp         = document.getElementById('orderEditTotalInput');
  const depositInp       = document.getElementById('orderEditDepositInput');
  const currencyInp      = document.getElementById('orderEditCurrencyInput');

  // Driver combobox parts (if present in your modal)
  const driverInp        = document.getElementById('orderEditDriverInput');
  const driverList       = document.getElementById('orderEditDriverList');
  const driverClearBtn   = document.getElementById('orderEditDriverClear');
  const driverIdHidden   = document.getElementById('orderEditDriverId');

  const itemsBody        = document.getElementById('orderEditItemsBody');

  // table body for inline row refresh
  const ordersTbody      = document.getElementById('ordersTbody');

  // ---------- State ----------
  let currentOrder  = null;
  let fullOrderData = null;
  let saving = false;
  let driverChosen = null;

  // ---------- Helpers ----------
  const fmtMoney = (val, currency = 'KES') => {
    const n = Number(val || 0);
    return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  };

  const getSession = () => {
    try {
      const j = localStorage.getItem('wattsunUser');
      return j ? JSON.parse(j) : null;
    } catch { return null; }
  };

  const moneyFromCents = (cents) => {
    const n = Number(cents || 0);
    return Math.round(n) / 100;
  };

  // map various server shapes to amounts/currency
  const coerceTotals = (o) => {
    if (!o || typeof o !== 'object') return { total: 0, deposit: 0, currency: 'KES' };

    // prefer integer cents if present
    const hasCents = (x) => Number.isFinite(Number(x));
    const total =
      hasCents(o.totalCents) ? moneyFromCents(o.totalCents) :
      o.total ?? o.net ?? o.amount ?? 0;

    const deposit =
      hasCents(o.depositCents) ? moneyFromCents(o.depositCents) :
      o.deposit ?? o.depositAmount ?? o.advance ?? o.downpayment ?? 0;

    const currency = o.currency ?? o.curr ?? 'KES';
    return { total: Number(total || 0), deposit: Number(deposit || 0), currency };
  };

  const coerceItems = (o) => {
    if (!o || typeof o !== 'object') return [];
    return Array.isArray(o.items) ? o.items :
           Array.isArray(o.lines) ? o.lines :
           Array.isArray(o.cart)  ? o.cart  : [];
  };

  const hydrateStatusOptions = (current) => {
    if (!statusSel) return;
    const known = ['Pending', 'Confirmed', 'Dispatched', 'Delivered', 'Closed', 'Cancelled'];
    // add if missing; keeps existing options intact
    for (const s of known) {
      if (![...statusSel.options].some(opt => opt.value === s)) {
        const opt = document.createElement('option');
        opt.value = opt.textContent = s;
        statusSel.appendChild(opt);
      }
    }
    if (current && known.includes(current)) statusSel.value = current;
  };

  // ---------- Rendering ----------
  const renderMoneyAndItems = (o) => {
    const t = coerceTotals(o);
    if (totalInp)   totalInp.value   = t.total || '';
    if (depositInp) depositInp.value = t.deposit || '';
    if (currencyInp) currencyInp.value = t.currency || 'KES';

    // items
    if (itemsBody) {
      const items = coerceItems(o);
      itemsBody.innerHTML = '';
      if (!items.length) {
        itemsBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#6b7280">No items</td></tr>`;
      } else {
        const cur = t.currency || 'KES';
        for (const it of items) {
          const sku   = it.sku ?? it.SKU ?? it.code ?? '';
          const name  = it.name ?? it.title ?? it.productName ?? '';
          const qty   = it.qty ?? it.quantity ?? 1;
          const price =
            Number.isFinite(it.priceCents) ? moneyFromCents(it.priceCents) :
            it.price ?? it.unitPrice ?? it.amount ?? 0;
          const tr = document.createElement('tr');
          tr.innerHTML = `<td>${sku}</td><td>${name}</td><td>${qty}</td><td>${fmtMoney(price, cur)}</td>`;
          itemsBody.appendChild(tr);
        }
      }
    }
  };

  // ---------- Data fetch (Track first, then Admin) ----------
  async function fetchViaTrack(orderId, phone, email) {
    // per ADR: GET /api/track?phone=&status=&page=&per= (list), but we support both list and POST fallbacks. 
    const sess = getSession() || {};
    const ph = (phone || sess.phone || '').trim();
    const em = (email || sess.email || '').trim();

    // try GET first
    const tryGet = async () => {
      const qs = new URLSearchParams({ phone: ph || '', page: '1', per: '5' });
      const r = await fetch(`/api/track?${qs.toString()}`, { method: 'GET' });
      if (!r.ok) return null;
      const data = await r.json().catch(() => null);
      const list = Array.isArray(data?.orders) ? data.orders : (Array.isArray(data) ? data : []);
      if (!list || !list.length) return null;
      // find by orderNumber or id
      const hit = list.find(o =>
        String(o.orderNumber || o.id || o.order) === String(orderId)
      ) || list[0];
      return hit || null;
    };

    // fallback POST (legacy)
    const tryPost = async () => {
      const body = { order: orderId, phone: ph, email: em };
      const r = await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!r.ok) return null;
      const data = await r.json().catch(() => null);
      return (Array.isArray(data?.orders) ? data.orders[0] : null) || null;
    };

    try {
      return (await tryGet()) || (await tryPost());
    } catch {
      return null;
    }
  }

  async function fetchViaAdmin(orderId) {
    // fallback set — we’ll accept either a single object or a list we need to filter
    const candidates = [
      `/api/admin/orders/${encodeURIComponent(orderId)}`,
      `/api/admin/orders?id=${encodeURIComponent(orderId)}`,
      `/api/admin/orders`
    ];
    for (const url of candidates) {
      try {
        const r = await fetch(url);
        if (!r.ok) continue;
        const data = await r.json();
        if (data && (data.id || data.orderNumber)) {
          return data;
        }
        if (Array.isArray(data?.orders)) {
          const found = data.orders.find(o => String(o.id) === String(orderId) || String(o.orderNumber) === String(orderId));
          if (found) return found;
        }
        if (Array.isArray(data)) {
          const found = data.find(o => String(o.id) === String(orderId) || String(o.orderNumber) === String(orderId));
          if (found) return found;
        }
      } catch {}
    }
    return null;
  }

  // ---------- Driver combobox (optional UI) ----------
  let driverSearchTimer = null;

  function setDriver(id, name) {
    if (driverIdHidden) driverIdHidden.value = id ? String(id) : '';
    if (driverInp) driverInp.value = name || (id ? `Driver ${id}` : '');
    driverChosen = id ? { id, name: name || '' } : null;
  }

  async function queryDrivers(q) {
    const urls = [
      `/api/admin/users?type=driver&q=${encodeURIComponent(q)}`,
      `/api/admin/users?role=driver&q=${encodeURIComponent(q)}`,
      `/api/admin/users?q=${encodeURIComponent(q)}&type=driver`,
      `/api/admin/drivers?q=${encodeURIComponent(q)}`
    ];
    for (const url of urls) {
      try {
        const r = await fetch(url);
        if (!r.ok) continue;
        const data = await r.json();
        const list = Array.isArray(data?.users) ? data.users : (Array.isArray(data) ? data : []);
        if (list?.length) return list;
      } catch {}
    }
    return [];
  }

  function renderDriverList(items) {
    if (!driverList) return;
    driverList.innerHTML = '';
    if (!items.length) {
      const li = document.createElement('li');
      li.textContent = 'No drivers';
      li.className = 'empty';
      driverList.appendChild(li);
      return;
    }
    for (const d of items) {
      const li = document.createElement('li');
      li.textContent = d.name || d.fullName || d.email || d.phone || `Driver ${d.id}`;
      li.tabIndex = 0;
      li.addEventListener('click', () => setDriver(d.id ?? d.userId ?? null, li.textContent));
      driverList.appendChild(li);
    }
  }

  if (driverInp) {
    driverInp.addEventListener('input', (e) => {
      const q = (e.target.value || '').trim();
      clearTimeout(driverSearchTimer);
      driverSearchTimer = setTimeout(async () => {
        const list = q ? await queryDrivers(q) : [];
        renderDriverList(list);
      }, 200);
    });
  }

  if (driverClearBtn) {
    driverClearBtn.addEventListener('click', () => setDriver(null, ''));
  }

  // ---------- Modal lifecycle ----------
  function openModal(orderLike = {}) {
    currentOrder = orderLike || null;
    if (!currentOrder) return;

    const idVal = currentOrder.id || currentOrder.orderNumber || currentOrder.order || '';
    if (idInput) idInput.value = idVal;

    hydrateStatusOptions(currentOrder.status);
    if (statusSel) statusSel.value = currentOrder.status || statusSel.value || 'Pending';

    // seed driver & notes
    const initDriverId = currentOrder.driver_id ?? currentOrder.driverId ?? null;
    const initDriverNm = currentOrder.driver_name ?? currentOrder.driver ?? '';
    setDriver(initDriverId ? Number(initDriverId) : null, initDriverNm || driverInp?.value || '');

    if (notesEl) notesEl.value = currentOrder.notes || '';

    // fetch full details: Track first, then Admin
    (async () => {
      const byTrack = await fetchViaTrack(idVal, currentOrder.phone, currentOrder.email);
      fullOrderData = byTrack || (await fetchViaAdmin(idVal)) || currentOrder;

      renderMoneyAndItems(fullOrderData);
    })();

    if (!modal) return;
    modal.style.display = 'block';
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }

  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  // ---------- Save ----------
  function setSaving(flag) {
    saving = !!flag;
    if (saveBtn) {
      saveBtn.disabled = saving;
      saveBtn.textContent = saving ? 'Saving…' : 'Save';
    }
  }

  async function doPatch(id) {
    const body = {
      status: statusSel ? statusSel.value : undefined,
      notes: notesEl ? notesEl.value.trim() : undefined
    };
    if (driverChosen?.id != null) body.driverId = Number(driverChosen.id);

    const r = await fetch(`/api/admin/orders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error('PATCH failed');
    return r.json().catch(() => ({}));
  }

  function refreshRowInline(id, payload) {
    if (!ordersTbody) return;
    const row = ordersTbody.querySelector(`[data-id="${CSS.escape(String(id))}"]`);
    if (!row) return;

    // status
    const statusCell = row.querySelector('[data-col="status"], .col-status');
    if (statusCell && payload.status) statusCell.textContent = payload.status;

    // notes
    const notesCell = row.querySelector('[data-col="notes"], .col-notes');
    if (notesCell && typeof payload.notes === 'string') notesCell.textContent = payload.notes;

    // driver
    const driverCell = row.querySelector('[data-col="driver"], .col-driver');
    if (driverCell && driverChosen?.name) driverCell.textContent = driverChosen.name;
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      if (!currentOrder) return;
      const idForUrl = currentOrder.id || currentOrder.orderNumber || currentOrder.order;
      if (!idForUrl) {
        alert('Missing order ID.');
        return;
      }

      try {
        setSaving(true);
        const res = await doPatch(idForUrl);

        // inline row refresh with what we just sent
        refreshRowInline(idForUrl, {
          status: statusSel?.value,
          notes: notesEl?.value
        });

        // Step 6.4: broadcast to other tabs
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
  }

  // ---------- Open hooks ----------
  // 1) Rows with a data attribute
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-open-order-edit]');
    if (!btn) return;
    const oid   = btn.getAttribute('data-id') || btn.getAttribute('data-order') || '';
    const phone = btn.getAttribute('data-phone') || '';
    const email = btn.getAttribute('data-email') || '';

    const o = { id: oid, orderNumber: oid, phone, email };
    openModal(o);
  });

  // 2) Global hook for other scripts
  if (typeof window.openOrderEdit !== 'function') {
    window.openOrderEdit = openModal;
  }
})();
