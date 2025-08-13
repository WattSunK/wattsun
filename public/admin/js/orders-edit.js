// public/admin/js/orders-edit.js
// Opens the Edit modal and PATCHes changes.
// Works with a table that has <tbody id="ordersTbody">, but also
// supports programmatic open via window.openOrderEdit({ id }).

(() => {
  // --- Elements (required IDs in dashboard.html) ---
  const modal     = document.getElementById('orderEditModal');
  const saveBtn   = document.getElementById('orderSaveBtn');
  const cancelBtn = document.getElementById('orderCancelBtn');

  const idInput   = document.getElementById('orderEditId');
  const statusSel = document.getElementById('orderEditStatus');
  const driverSel = document.getElementById('orderEditDriver');
  const notesEl   = document.getElementById('orderEditNotes');

  const tbody     = document.getElementById('ordersTbody'); // present on the orders partial

  // --- Helpers ---
  const loading = (on) => {
    if (!saveBtn) return;
    saveBtn.disabled = !!on;
    saveBtn.textContent = on ? 'Saving…' : 'Save';
  };

  const getOrderFromCache = (id) => {
    // Try common caches produced by controllers
    if (window.ORDERS_BY_ID && window.ORDERS_BY_ID[id]) return window.ORDERS_BY_ID[id];
    if (Array.isArray(window.ORDERS)) {
      const hit = window.ORDERS.find(o => String(o.id) === String(id));
      if (hit) return hit;
    }
    if (window.__ordersIndex && window.__ordersIndex[id]) return window.__ordersIndex[id];
    return null;
  };

  const fetchOrderById = async (id) => {
    try {
      const r = await fetch('/api/admin/orders');
      if (!r.ok) return null;
      const arr = await r.json();
      if (!Array.isArray(arr)) return null;
      return arr.find(o => String(o.id) === String(id) || String(o.orderNumber) === String(id)) || null;
    } catch { return null; }
  };

  // --- Modal state ---
  let current = null;

  function openModalFor(order) {
    current = order || null;
    if (!current) return;

    if (idInput)   idInput.value   = current.id || current.orderNumber || '';
    if (statusSel) statusSel.value = current.status || 'Pending';
    if (driverSel) driverSel.value = current.driver_id ? String(current.driver_id) : '';
    if (notesEl)   notesEl.value   = current.notes || '';

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

  // Close on ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Cancel just closes (no broadcasts)
  cancelBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal();
  });

  // Save → PATCH
  saveBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!current) return;

    const payload = {
      status:    (statusSel?.value || 'Pending').trim(),
      driver_id: driverSel?.value ? Number(driverSel.value) : null,
      notes:     (notesEl?.value || '').trim()
    };

    try {
      loading(true);
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(current.id || current.orderNumber)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const t = await res.text();
        alert(`Failed to save order changes.\n${t || res.status}`);
        return;
      }

      // Inline row refresh (best effort)
      if (typeof window.refreshOrderRow === 'function') {
        window.refreshOrderRow(current.id || current.orderNumber, payload);
      } else if (tbody) {
        const selId = String(current.id || current.orderNumber);
        const row =
          tbody.querySelector(`tr[data-oid="${selId}"]`) ||
          tbody.querySelector(`button[data-oid="${selId}"]`)?.closest('tr') ||
          null;
        if (row) {
          const statusCell = row.querySelector('[data-col="status"], .col-status');
          const driverCell = row.querySelector('[data-col="driver"], .col-driver');
          const notesCell  = row.querySelector('[data-col="notes"], .col-notes');

          if (statusCell) statusCell.textContent = payload.status;
          if (driverCell) {
            const driverName = payload.driver_id ? (driverSel?.selectedOptions?.[0]?.textContent || '') : '';
            driverCell.textContent = driverName;
          }
          if (notesCell)  notesCell.textContent = payload.notes || '';
        }
      }

      // Broadcast for customer reflection (Step 6.4) — fire **once**, on success
      try {
        localStorage.setItem('ordersUpdatedAt', String(Date.now()));
        window.postMessage({ type: 'orders-updated', orderId: current.id || current.orderNumber }, '*');
      } catch {}

      closeModal();
    } catch (err) {
      console.error(err);
      alert('Failed to save order changes.');
    } finally {
      loading(false);
    }
  });

  // Enable Edit buttons + delegate clicks inside #ordersTbody (if present)
  document.addEventListener('DOMContentLoaded', () => {
    if (!tbody) return;

    // Re-enable any disabled Edit buttons
    tbody
      .querySelectorAll('.js-order-edit-btn[disabled], .order-edit-btn[disabled], [data-action="edit"][disabled]')
      .forEach(btn => btn.removeAttribute('disabled'));

    // Delegate clicks for known edit buttons
    tbody.addEventListener('click', async (e) => {
      const btn = e.target.closest('.js-order-edit-btn, .order-edit-btn, [data-action="edit"]');
      if (!btn) return;

      const row = btn.closest('tr');
      const oid =
        btn.dataset.oid ||
        btn.getAttribute('data-id') ||
        row?.dataset?.oid ||
        row?.dataset?.id ||
        '';

      if (!oid) {
        alert('Could not determine order id for editing. Please ensure rows/buttons include data-oid.');
        return;
      }

      let order = getOrderFromCache(oid);
      if (!order) order = await fetchOrderById(oid);
      openModalFor(order || { id: oid });
    });
  });

  // Programmatic hook (used by dashboard binder)
  if (typeof window.openOrderEdit !== 'function') {
    window.openOrderEdit = (order) => openModalFor(order);
  }

  // Provide a fallback refresh hook if controller didn’t define one
  if (typeof window.refreshOrderRow !== 'function') {
    window.refreshOrderRow = (id, patch = {}) => {
      const selId = String(id);
      const row =
        tbody?.querySelector(`tr[data-oid="${selId}"]`) ||
        tbody?.querySelector(`button[data-oid="${selId}"]`)?.closest('tr') ||
        null;
      if (!row) return;
      if (patch.status) {
        const c = row.querySelector('[data-col="status"], .col-status');
        if (c) c.textContent = patch.status;
      }
      if ('driver_id' in patch) {
        const c = row.querySelector('[data-col="driver"], .col-driver');
        if (c) {
          c.textContent = patch.driver_id ? (driverSel?.selectedOptions?.[0]?.textContent || '') : '';
        }
      }
      if ('notes' in patch) {
        const c = row.querySelector('[data-col="notes"], .col-notes');
        if (c) c.textContent = patch.notes || '';
      }
    };
  }
})();
