// public/admin/js/orders-edit.js
// Edit modal: hydrates backend-valid Status options, supports Driver search+select,
// PATCHes the order, updates the table row, and broadcasts Step 6.4 signals.

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

  // If the orders table exposes a TBODY, we use it for row updates
  const ordersHost  = document.getElementById('ordersTbody') || document.getElementById('adminContent') || document.body;

  // -------------------- State --------------------
  let current = null;                  // order object being edited
  let allowedStatuses = null;          // Set<string>, hydrated from the Orders "Status" filter
  let driverChosen = { id: null, name: '' }; // local mirror for rendering the row

  // -------------------- Small helpers --------------------
  const setSaving = (on) => { if (!saveBtn) return; saveBtn.disabled = !!on; saveBtn.textContent = on ? 'Saving…' : 'Save'; };

  // debounce helper for driver search
  const debounce = (fn, ms = 260) => {
    let t = 0;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  // Try to find the Orders' "Status" filter on the page and hijack its options
  function findOrdersStatusFilter() {
    const scopes = [
      document.getElementById('adminContent'),
      document.querySelector('.main-section'),
      document
    ].filter(Boolean);

    for (const scope of scopes) {
      const sels = scope.querySelectorAll('select');
      for (const sel of sels) {
        // Most lists show "All" as the first option
        const first = sel.options?.[0]?.textContent?.trim().toLowerCase();
        if (first === 'all') return sel;
      }
    }
    return null;
  }

  function hydrateStatusOptions(currentStatus) {
    if (!statusSel) return;
    const filter = findOrdersStatusFilter();
    const list = [];

    if (filter) {
      for (const opt of filter.options) {
        const label = (opt.textContent || '').trim();
        if (!label || /^all$/i.test(label)) continue;
        list.push(label);
      }
    }

    // Fallback if filter is missing
    const fallback = ['Pending', 'Processing', 'Delivered', 'Cancelled'];

    const options = (list.length ? list : fallback);
    allowedStatuses = new Set(options.map(s => s.toLowerCase()));

    // rebuild the select
    statusSel.innerHTML = options.map(s => {
      const sel = (String(s).toLowerCase() === String(currentStatus || '').toLowerCase()) ? ' selected' : '';
      return `<option${sel}>${s}</option>`;
    }).join('');
  }

  // Locally available orders
  const getFromCache = (id) => {
    if (window.ORDERS_BY_ID?.[id]) return window.ORDERS_BY_ID[id];
    if (Array.isArray(window.ORDERS)) {
      const hit = window.ORDERS.find(o => String(o.id) === String(id) || String(o.orderNumber) === String(id));
      if (hit) return hit;
    }
    if (window.__ordersIndex?.[id]) return window.__ordersIndex[id];
    return null;
  };

  // Fallback: GET all orders then pick one
  const fetchOrderById = async (id) => {
    try {
      const r = await fetch('/api/admin/orders');
      if (!r.ok) return null;
      const arr = await r.json();
      return Array.isArray(arr) ? (arr.find(o => String(o.id) === String(id) || String(o.orderNumber) === String(id)) || null) : null;
    } catch { return null; }
  };

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
      li.textContent = d.name || d.fullName || d.email || `Driver ${d.id}`;
      li.tabIndex = 0;
      li.dataset.id = d.id;
      li.addEventListener('click', () => {
        if (driverIdH)  driverIdH.value = d.id;
        if (driverInp)  driverInp.value = d.name || d.fullName || d.email || `Driver ${d.id}`;
        driverChosen = { id: d.id, name: driverInp.value };
        driverList.style.display = 'none';
      });
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter') li.click(); });
      driverList.appendChild(li);
    }
    driverList.style.display = 'block';
  }

  async function searchDrivers(q) {
    const qs = encodeURIComponent(q || '');
    // Try multiple common endpoints (whichever your backend provides)
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
        if (list && list.length) return list;
      } catch { /* try next */ }
    }
    return [];
  }

  const onDriverType = debounce(async () => {
    const q = (driverInp?.value || '').trim();
    if (!q) { driverList.style.display = 'none'; return; }
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
      driverList.style.display = inside ? driverList.style.display : 'none';
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
  function openModalFor(order) {
    current = order || null;
    if (!current) return;

    hydrateStatusOptions(current.status);

    const idVal = current.id || current.orderNumber || '';
    if (idInput)     idInput.value = idVal;
    if (statusSel)   statusSel.value = current.status || statusSel.value || 'Pending';

    // If the order object carries driver info, use it; else leave empty.
    const initDriverId   = (current.driver_id != null ? Number(current.driver_id) : null);
    const initDriverName = current.driver_name || current.driver || '';
    if (driverIdH)  driverIdH.value = initDriverId ? String(initDriverId) : '';
    if (driverInp)  driverInp.value = initDriverName || (initDriverId ? `Driver ${initDriverId}` : '');
    driverChosen = { id: initDriverId, name: driverInp?.value || '' };

    if (notesEl) notesEl.value = current.notes || '';

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
      alert(`Status "${status}" isn’t allowed by this dashboard. Pick one of: ${[...allowedStatuses].join(', ')}`);
      return;
    }

    const payload = {
      status,
      driver_id: driverIdH?.value ? Number(driverIdH.value) : null,
      notes: (notesEl?.value || '').trim()
    };

    try {
      setSaving(true);
      const idForUrl = current.id || current.orderNumber;
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

      // Update the row inline (best effort)
      const selId = String(idForUrl);
      const row =
        ordersHost?.querySelector(`tr[data-oid="${selId}"]`) ||
        ordersHost?.querySelector(`button[data-oid="${selId}"]`)?.closest('tr') ||
        null;

      if (row) {
        const statusCell = row.querySelector('[data-col="status"], .col-status');
        if (statusCell) statusCell.textContent = payload.status;

        // Show the chosen driver "name" in the row if there is a column for it
        const driverCell = row.querySelector('[data-col="driver"], .col-driver');
        if (driverCell) driverCell.textContent = (driverChosen.name || (payload.driver_id ? `Driver ${payload.driver_id}` : ''));

        const notesCell = row.querySelector('[data-col="notes"], .col-notes');
        if (notesCell) notesCell.textContent = payload.notes || '';
      }

      // Step 6.4 broadcast for customer pages
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

  // If the original table binds edit buttons, we still provide an internal delegate as a safety net.
  document.addEventListener('DOMContentLoaded', () => {
    wireDriverCombo();

    if (!ordersHost) return;

    ordersHost.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action="edit"], .order-edit-btn, .js-order-edit-btn, button[title*="Edit" i], a[title*="Edit" i]');
      if (!btn) return;

      const row = btn.closest('tr');
      const oid =
        btn.dataset.oid || btn.getAttribute('data-id') || row?.dataset?.oid || row?.dataset?.id || '';

      if (!oid) { alert('Could not determine order id.'); return; }

      let order = getFromCache(oid);
      if (!order) order = await fetchOrderById(oid);
      openModalFor(order || { id: oid });
    });
  });

  // Programmatic hook used by the dashboard binder
  if (typeof window.openOrderEdit !== 'function') {
    window.openOrderEdit = (order) => openModalFor(order);
  }
})();
