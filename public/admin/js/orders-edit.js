// public/admin/js/orders-edit.js — hotfix with MutationObserver (Step 6.4 + robust view/edit)
(() => {
  const modal     = document.getElementById('orderEditModal');
  const saveBtn   = document.getElementById('orderSaveBtn');
  const cancelBtn = document.getElementById('orderCancelBtn');

  const statusSel = document.getElementById('orderEditStatus');
  const driverSel = document.getElementById('orderEditDriver');
  const notesEl   = document.getElementById('orderEditNotes');

  const tbody     = document.getElementById('ordersTbody') || document.querySelector('tbody#ordersTbody') || document.querySelector('#ordersTable tbody');

  const loading = (on) => { if (saveBtn) { saveBtn.disabled = !!on; saveBtn.textContent = on ? 'Saving…' : 'Save'; } };

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
      }
      closeModal();
    } catch (err) {
      console.error(err);
      alert('Failed to save order changes.');
    } finally {
      loading(false);
    }
  });

  function enableButtonsAndBind(root){
    if (!root) return;
    // Re-enable buttons (view + edit)
    root.querySelectorAll(
      '.js-order-edit-btn[disabled], .order-edit-btn[disabled], [data-action="edit"][disabled], ' +
      '.js-order-view-btn[disabled], .order-view-btn[disabled], [data-action="view"][disabled]'
    ).forEach(btn => btn.removeAttribute('disabled'));

    // Delegate clicks
    root.addEventListener?.('click', async (e) => {
      const sel = '.js-order-edit-btn, .order-edit-btn, [data-action="edit"], .js-order-view-btn, .order-view-btn, [data-action="view"]';
      const btn = e.target.closest?.(sel);
      if (!btn) return;
      const row = btn.closest('tr');
      const oid = btn.dataset.oid || btn.getAttribute('data-id') || row?.dataset?.oid || '';
      if (!oid) { alert('Could not determine order id for this row.'); return; }
      let order = getOrderFromCache(oid);
      if (!order) order = await fetchOrderById(oid);
      openModalFor(order || { id: oid });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Initial enable/bind
    if (tbody) enableButtonsAndBind(tbody);

    // MutationObserver to catch table redraws
    const table = document.getElementById('ordersTable') || tbody?.closest('table') || document.getElementById('orders');
    const target = table || tbody || document.body;
    const mo = new MutationObserver(() => {
      enableButtonsAndBind(target);
    });
    mo.observe(target, { childList: true, subtree: true });
  });

  window.openOrderEdit = (order) => openModalFor(order);
})();