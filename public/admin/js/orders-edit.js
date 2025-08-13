// public/admin/js/orders-edit.js
// Enables Edit buttons, opens the modal, and PATCHes changes.
// Tailored to /public/partials/orders.html which uses <tbody id="ordersTbody">.

(() => {
  // --- Elements (required IDs) ---
  const modal     = document.getElementById('orderEditModal');
  const saveBtn   = document.getElementById('orderSaveBtn');
  const cancelBtn = document.getElementById('orderCancelBtn');

  const statusSel = document.getElementById('orderEditStatus');
  const driverSel = document.getElementById('orderEditDriver');
  const notesEl   = document.getElementById('orderEditNotes');

  const tbody     = document.getElementById('ordersTbody'); // ← matches orders.html

  // --- Helpers ---
  const loading = (on) => {
    if (!saveBtn) return;
    saveBtn.disabled = !!on;
    saveBtn.textContent = on ? 'Saving…' : 'Save';
  };

  // Try to get an order from controller caches (varies by version)
  const getOrderFromCache = (id) => {
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
      return arr.find(o => String(o.id) === String(id)) || null;
    } catch { return null; }
  };

  // --- Modal state ---
  let current = null;

  function openModalFor(order) {
    current = order || null;
    if (!current) return;

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

  cancelBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    try { localStorage.setItem('ordersUpdatedAt', String(Date.now())); } catch {}
try { window.postMessage({ type: 'orders-updated', orderId: current?.id }, '*'); } catch {}
closeModal();
  });

  // Save → PATCH
  saveBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!current) return;

    const payload = {
      status:    statusSel?.value || 'Pending',
      driver_id: driverSel?.value ? Number(driverSel.value) : null,
      notes:     (notesEl?.value || '').trim()
    };

    try {
      loading(true);
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(current.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const t = await res.text();
        alert(`Failed to save order changes.\n${t || res.status}`);
        return;
      }

      // Broadcast for customer reflection (6.4)
      try {
        localStorage.setItem('ws:orders:rev', String(Date.now()));
        window.postMessage({ type: 'orders-updated', orderId: current.id }, '*');
      } catch {}

      // Inline row refresh
      if (typeof window.refreshOrderRow === 'function') {
        window.refreshOrderRow(current.id, payload);
      } else {
        // Fallback: update visible cells by common selectors
        const row = (
          tbody?.querySelector(`tr[data-oid="${String(current.id)}"]`) ||
          tbody?.querySelector(`button[data-oid="${String(current.id)}"]`)?.closest('tr') ||
          null
        );
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

      try { localStorage.setItem('ordersUpdatedAt', String(Date.now())); } catch {}
try { window.postMessage({ type: 'orders-updated', orderId: current?.id }, '*'); } catch {}
closeModal();
    } catch (err) {
      console.error(err);
      alert('Failed to save order changes.');
    } finally {
      loading(false);
    }
  });

  // --- Enable Edit buttons + delegate clicks inside #ordersTbody ---
  document.addEventListener('DOMContentLoaded', () => {
    if (!tbody) return;

    // 1) Re-enable any disabled Edit buttons (leftover from earlier state)
    tbody
      .querySelectorAll(
        '.js-order-edit-btn[disabled], .order-edit-btn[disabled], [data-action="edit"][disabled]'
      )
      .forEach(btn => btn.removeAttribute('disabled'));

    // 2) Click delegation
    tbody.addEventListener('click', async (e) => {
      const btn = e.target.closest('.js-order-edit-btn, .order-edit-btn, [data-action="edit"]');
      if (!btn) return;

      // Get order id from button or row
      const row = btn.closest('tr');
      const oid =
        btn.dataset.oid ||
        btn.getAttribute('data-id') ||
        row?.dataset?.oid ||
        ''; // we strongly prefer a data-oid

      if (!oid) {
        alert('Could not determine order id for editing. Please ensure rows/buttons include data-oid.');
        return;
      }

      let order = getOrderFromCache(oid);
      if (!order) order = await fetchOrderById(oid);
      openModalFor(order || { id: oid });
    });
  });

  // Programmatic hook
  window.openOrderEdit = (order) => openModalFor(order);

  // Provide a fallback refresh hook if controller didn’t define one
  if (typeof window.refreshOrderRow !== 'function') {
    window.refreshOrderRow = (id, patch = {}) => {
      const row = (
        tbody?.querySelector(`tr[data-oid="${String(id)}"]`) ||
        tbody?.querySelector(`button[data-oid="${String(id)}"]`)?.closest('tr') ||
        null
      );
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
