// public/admin/js/orders-edit.js — final (Step 6.4 + view/edit enable)
(() => {
  const modal     = document.getElementById('orderEditModal');
  const saveBtn   = document.getElementById('orderSaveBtn');
  const cancelBtn = document.getElementById('orderCancelBtn');

  const statusSel = document.getElementById('orderEditStatus');
  const driverSel = document.getElementById('orderEditDriver');
  const notesEl   = document.getElementById('orderEditNotes');

  const tbody     = document.getElementById('ordersTbody');

  const loading = (on) => {
    if (!saveBtn) return;
    saveBtn.disabled = !!on;
    saveBtn.textContent = on ? 'Saving…' : 'Save';
  };

  function emitOrdersUpdated(orderId) {
    const ts = Date.now();
    try { localStorage.setItem('ordersUpdatedAt', String(ts)); } catch {}
    try { window.postMessage({ type: 'orders-updated', ts, orderId }, '*'); } catch {}
  }

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

  let current = null;
  function openModalFor(order) {
    current = order || null;
    if (!current) return;
    if (statusSel) statusSel.value = current.status || 'Pending';
    if (driverSel) driverSel.value = current.driver_id ? String(current.driver_id) : '';
    if (notesEl)   notesEl.value   = current.notes || '';
    if (modal) { modal.style.display = 'block'; modal.removeAttribute('aria-hidden'); }
  }
  function closeModal() {
    if (modal) { modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true'); }
    current = null;
  }
  cancelBtn?.addEventListener('click', (e) => { e.preventDefault(); closeModal(); });

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
      emitOrdersUpdated(current.id);

      if (typeof window.refreshOrderRow === 'function') {
        window.refreshOrderRow(current.id, payload);
      } else {
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
      closeModal();
    } catch (err) {
      console.error(err);
      alert('Failed to save order changes.');
    } finally {
      loading(false);
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    if (!tbody) return;

    // Re-enable both View and Edit buttons just in case they were disabled server-side
    tbody
      .querySelectorAll('.js-order-edit-btn[disabled], .order-edit-btn[disabled], [data-action="edit"][disabled], [data-action="view"][disabled], .js-order-view-btn[disabled], .order-view-btn[disabled]')
      .forEach(btn => btn.removeAttribute('disabled'));

    // Delegate clicks for View and Edit
    tbody.addEventListener('click', async (e) => {
      const btn = e.target.closest('.js-order-edit-btn, .order-edit-btn, [data-action="edit"], .js-order-view-btn, .order-view-btn, [data-action="view"]');
      if (!btn) return;

      const row = btn.closest('tr');
      const oid =
        btn.dataset.oid ||
        btn.getAttribute('data-id') ||
        row?.dataset?.oid ||
        '';
      if (!oid) { alert('Could not determine order id for this row.'); return; }

      let order = getOrderFromCache(oid);
      if (!order) order = await fetchOrderById(oid);
      openModalFor(order || { id: oid });
    });
  });

  window.openOrderEdit = (order) => openModalFor(order);

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
        if (c) c.textContent = patch.driver_id ? (driverSel?.selectedOptions?.[0]?.textContent || '') : '';
      }
      if ('notes' in patch) {
        const c = row.querySelector('[data-col="notes"], .col-notes');
        if (c) c.textContent = patch.notes || '';
      }
    };
  }
})();