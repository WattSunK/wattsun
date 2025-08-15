// Orders Edit — loads modal HTML, wires Save, mirrors Items modal look
window.WSOrdersEdit = (() => {
  let modal, host, saving = false;

  async function ensureModalLoaded() {
    host = document.querySelector('#ordersModalHost');
    if (!host) return;
    if (host.dataset.loaded === '1') { modal = host.querySelector('.ws-modal'); return; }
    const html = await fetch('/public/partials/orders-modal.html').then(r => r.text());
    host.innerHTML = html;
    host.dataset.loaded = '1';
    modal = host.querySelector('.ws-modal');

    // close handlers
    modal.addEventListener('click', (e) => {
      if (e.target.matches('[data-action="close"], .ws-modal__overlay')) close();
    });

    // save handler
    modal.querySelector('#omSave')?.addEventListener('click', onSave);
  }

  function open(id, opts = {}) {
    if (!modal) return;
    modal.classList.add('is-open');
    load(id, !!opts.viewOnly).catch(console.error);
  }

  function close() {
    modal?.classList.remove('is-open');
  }

  function setForm(data) {
    const g = (sel) => modal.querySelector(sel);
    g('#omOrderNumber').value = data.orderNumber || data.id || '';
    g('#omStatus').value = data.status || 'Pending';
    g('#omCustomer').textContent = data.fullName || data.name || '-';
    g('#omPhone').textContent = data.phone || '-';
    g('#omEmail').textContent = data.email || '-';
    g('#omCreated').textContent = data.createdAt ? new Date(data.createdAt).toLocaleString() : '-';
    g('#omTotal').value = (data.totalCents ?? 0);
    g('#omDeposit').value = (data.depositCents ?? 0);
    g('#omNotes').value = data.notes ?? '';

    // load drivers list
    fetch('/api/admin/users?type=Driver')
      .then(r => r.json())
      .then(({ users = [] }) => {
        const dl = g('#omDriverList'); dl.innerHTML = '';
        users.forEach(u => {
          const o = document.createElement('option');
          o.value = `${u.id} — ${u.name} (${u.phone || u.email || ''})`;
          dl.appendChild(o);
        });
        if (data.driver && typeof data.driver === 'string') g('#omDriver').value = data.driver;
        if (data.driverUserId) g('#omDriver').value = String(data.driverUserId);
      })
      .catch(console.error);
  }

  async function load(id, viewOnly = false) {
    // Try admin/read first; fallback to public if needed
    const res = await fetch(`/api/admin/orders?q=${encodeURIComponent(id)}&per=1&page=1`);
    if (!res.ok) throw new Error('Failed to load order');
    const data = await res.json();
    const o = (data.orders && data.orders[0]) || {};
    setForm(o);

    // toggle view only
    modal.querySelector('#omSave').style.display = viewOnly ? 'none' : '';
  }

  async function onSave() {
    if (saving) return;
    saving = true;
    const g = (sel) => modal.querySelector(sel);
    const id = g('#omOrderNumber').value.trim();

    // parse driver id if typed from datalist "123 — Name"
    const rawDriver = g('#omDriver').value.trim();
    const driverId = /^\d+/.test(rawDriver) ? Number(rawDriver.split('—')[0].trim()) : (Number(rawDriver) || null);

    const body = {
      status: g('#omStatus').value,
      notes: g('#omNotes').value.trim(),
      driverId: driverId || undefined,
      totalCents: Number(g('#omTotal').value || 0),
      depositCents: Number(g('#omDeposit').value || 0),
    };

    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      // signal for customer reflection (Step 6.4 ready)
      try {
        localStorage.setItem('ordersUpdatedAt', String(Date.now()));
        window.postMessage({ type: 'orders-updated' }, '*');
      } catch {}
      close();
      // optimistic UI: reload orders list
      document.querySelector('#ordersRefresh')?.click();
    } catch (e) {
      console.error(e);
      alert('Could not save changes. See console/logs.');
    } finally {
      saving = false;
    }
  }

  // bootstrap
  (async () => {
    await ensureModalLoaded();
    // expose
    window.WSOrdersEdit = { open, close };
  })();

  return { open, close };
})();
