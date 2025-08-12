// public/admin/js/orders-edit.js
// Wires the admin "Edit Order" modal to PATCH /api/admin/orders/:id

(() => {
  const modal = document.getElementById('orderEditModal');
  const saveBtn = document.getElementById('orderSaveBtn');
  const cancelBtn = document.getElementById('orderCancelBtn');

  const statusSel = document.getElementById('orderEditStatus');
  const driverSel = document.getElementById('orderEditDriver');
  const notesEl   = document.getElementById('orderEditNotes');

  const rowAnchor = document.getElementById('ordersTableBody'); // tbody
  const loading = (on) => {
    saveBtn.disabled = !!on;
    saveBtn.innerText = on ? 'Saving…' : 'Save';
  };

  // state
  let current = null; // { id, orderNumber, status, driver_id, notes }

  // open from controller
  window.openOrderEdit = function openOrderEdit(order) {
    current = order || null;
    if (!current) return;

    // set form values
    statusSel.value = current.status || 'Pending';
    if (current.driver_id) driverSel.value = String(current.driver_id);
    else driverSel.value = '';

    notesEl.value = current.notes || '';

    // show modal (basic)
    modal.style.display = 'block';
    modal.removeAttribute('aria-hidden');
  };

  function closeModal() {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    current = null;
  }

  cancelBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal();
  });

  saveBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!current) return;

    const payload = {
      status: statusSel.value || 'Pending',
      driver_id: driverSel.value ? Number(driverSel.value) : null,
      notes: (notesEl.value || '').trim()
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

      // inline refresh (update row in table)
      const updated = await res.json(); // { ok:true, order:{...} } or { ok:true }
      // broadcast to other tabs (customer reflection will hook this)
      try {
        localStorage.setItem('ws:orders:rev', String(Date.now()));
        window.postMessage({ type: 'orders-updated', orderId: current.id }, '*');
      } catch {}

      // Ask the controller to refresh this row if it's available
      if (window.refreshOrderRow) {
        window.refreshOrderRow(current.id, {
          status: payload.status,
          driver_id: payload.driver_id,
          notes: payload.notes
        });
      }

      closeModal();
    } catch (err) {
      console.error(err);
      alert('Failed to save order changes.');
    } finally {
      loading(false);
    }
  });

  // Simple ESC/overlay close (optional)
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal?.style.display === 'block') closeModal();
  });
})();
