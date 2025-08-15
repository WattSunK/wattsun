// Orders Controller — styled rows + pager parity with Items
(() => {
  const TPL_EMPTY = `<tr><td colspan="8" class="empty">No orders found.</td></tr>`;
  const el = {
    search: document.querySelector('#ordersSearch'),
    status: document.querySelector('#ordersStatus'),
    refresh: document.querySelector('#ordersRefresh'),
    tbody: document.querySelector('#ordersTbody'),
    pager: document.querySelector('#ordersPager'),
    table: document.querySelector('#ordersTable'),
  };

  let state = {
    page: 1,
    per: 10,
    total: 0,
    q: '',
    status: '',
    orders: [],
  };

  function badge(status) {
    const s = (status || 'Pending').trim();
    return `<span class="ws-badge ws-badge--${s}">${s}</span>`;
  }

  function fmtMoney(centsOrNumber) {
    const n = Number(centsOrNumber || 0);
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(n);
  }

  function renderRows(rows) {
    if (!rows || !rows.length) {
      el.tbody.innerHTML = TPL_EMPTY;
      return;
    }
    el.tbody.innerHTML = rows.map(r => {
      const total = fmtMoney(r.totalCents ?? r.total ?? 0);
      const created = r.createdAt ? new Date(r.createdAt).toLocaleString() : '';
      const customer = r.fullName || r.name || `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim();
      return `
        <tr data-id="${r.id || r.orderNumber}">
          <td>${r.orderNumber || r.id || ''}</td>
          <td>${customer || '-'}</td>
          <td>${r.phone || '-'}</td>
          <td>${r.email || '-'}</td>
          <td>${badge(r.status)}</td>
          <td class="num">${total}</td>
          <td>${created}</td>
          <td class="actions">
            <button class="ws-btn--ghost js-view">View</button>
            <button class="ws-btn js-edit">Edit</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderPager() {
    const pages = Math.max(1, Math.ceil(state.total / state.per));
    const make = (p) => `<button class="page ${p === state.page ? 'active':''}" data-page="${p}">${p}</button>`;
    const around = (p, min, max) => Array.from({length:max-min+1}, (_,i)=>min+i).map(make).join('');
    if (pages <= 1) {
      el.pager.innerHTML = `<div class="page active" data-page="1">1</div>`;
      return;
    }
    const min = Math.max(1, state.page - 2);
    const max = Math.min(pages, state.page + 2);
    el.pager.innerHTML = around(state.page, min, max);
  }

  async function fetchOrders() {
    const params = new URLSearchParams({
      page: String(state.page),
      per: String(state.per),
    });
    if (state.q) params.set('q', state.q);
    if (state.status) params.set('status', state.status);

    const res = await fetch(`/api/admin/orders?${params.toString()}`, { headers: { 'Accept': 'application/json' }});
    if (!res.ok) throw new Error(`Failed to load orders: ${res.status}`);
    const data = await res.json();

    // Expected shape: { success, page, per, total, orders: [...] }
    state.page = Number(data.page ?? state.page);
    state.per  = Number(data.per  ?? state.per);
    state.total = Number(data.total ?? 0);
    state.orders = Array.isArray(data.orders) ? data.orders : [];

    renderRows(state.orders);
    renderPager();
  }

  // Events
  el.refresh?.addEventListener('click', () => { state.page = 1; fetchOrders().catch(console.error); });
  el.search?.addEventListener('input', (e) => { state.q = e.target.value.trim(); state.page = 1; fetchOrders().catch(console.error); });
  el.status?.addEventListener('change', (e) => { state.status = e.target.value; state.page = 1; fetchOrders().catch(console.error); });

  el.pager?.addEventListener('click', (e) => {
    const btn = e.target.closest('.page'); if (!btn) return;
    const p = Number(btn.dataset.page || '1');
    if (p !== state.page) { state.page = p; fetchOrders().catch(console.error); }
  });

  el.tbody?.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    const id = tr.dataset.id;
    if (e.target.closest('.js-edit')) window.WSOrdersEdit?.open(id);
    if (e.target.closest('.js-view')) window.WSOrdersEdit?.open(id, { viewOnly: true });
  });

  // Initial
  fetchOrders().catch(console.error);
})();
