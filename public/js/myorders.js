// /public/js/myorders.js
// Stable build: same-origin API, GET→POST fallback, locked to session phone.
// NOW also passes user email silently so the backend can fall back if phone finds 0.
// Links send ?order=<id>&status=Pending to /myaccount/track.html

(function () {
  const PAGE_SIZE = 5;

  // ---- DOM refs (match myorders.html) ----
  const $ = (id) => document.getElementById(id);
  const els = {
    tbody: $('wsTbody'),
    count: $('wsCount'),
    pageNum: $('wsPageNum'),
    first: $('wsFirst'),
    prev: $('wsPrev'),
    next: $('wsNext'),
    last: $('wsLast'),
    type: $('wsType'),
    from: $('wsFrom'),
    to: $('wsTo'),
    query: $('wsQuery'),
    searchBtn: $('wsSearchBtn'),
    clearBtn: $('wsClearBtn'),
  };

  // ---- State ----
  let all = [];
  let filtered = [];
  let page = 1;

  // ---- Helpers ----
  function getSession() {
    try {
      const raw = localStorage.getItem('wattsunUser') || localStorage.getItem('ws_user');
      if (!raw) return {};
      const o = JSON.parse(raw);
      return o.user ? o.user : o;
    } catch { return {}; }
  }

  function getUserPhone() {
    const s = getSession();
    return (s.phone || '').trim();
  }

  function getUserEmail() {
    const s = getSession();
    return (s.email || '').trim();
  }

  function fmtDate(d) {
    if (!d) return '—';
    const dt = typeof d === 'string' ? new Date(d) : d;
    return isNaN(dt) ? String(d) : dt.toLocaleString();
  }

  function fmtMoney(v) {
    const num = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
    if (isNaN(num)) return v ? String(v) : '—';
    return 'KSh ' + num.toLocaleString('en-KE', { minimumFractionDigits: 2 });
  }

  // Build the correct Track link depending on context (/myaccount/ vs root)
  function getTrackHref(orderId) {
    const inMyAccount = location.pathname.includes('/myaccount/');
    const base = inMyAccount ? '/myaccount/track.html' : '/track.html';
    const qs = new URLSearchParams({ order: orderId, status: 'Pending' }).toString();
    return `${base}?${qs}`;
  }

  // Normalize backend fields to our table columns
  function norm(o = {}, idx = 0) {
    return {
      _sl: idx + 1,
      id: o.orderNumber || o.id || o.orderId || o.order_id || '—',
      customerName: o.fullName || o.name || o.customer || '',
      orderType: o.orderType || o.type || o.status || '',
      orderDateTime: o.createdAt || o.timestamp || o.orderDate || o.date || o.updatedAt || null,
      dateDelivered: o.deliveredAt || o.dateDelivered || null,
      address: o.deliveryAddress || o.address || '',
      paymentType: o.paymentType || o.paymentMethod || o.payment || '—',
      netValue: o.netValue || o.total || o.amount || 0,
      raw: o,
    };
  }

  // ---- Fetch ----
  async function fetchOrders() {
    const phone = getUserPhone();
    const email = getUserEmail();
    if (!phone) { all = []; return; }

    let data = null;

    // Try GET first — include email for fallback on the server
    try {
      const res = await fetch(
        `/api/track?phone=${encodeURIComponent(phone)}&email=${encodeURIComponent(email)}`
      );
      if (res.ok) data = await res.json();
    } catch {}

    // Fallback to POST — include email + header for fallback
    if (!Array.isArray(data) && !(data && Array.isArray(data.orders))) {
      try {
        const res2 = await fetch(`/api/track`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-WS-Email': email || ''
          },
          body: JSON.stringify({ phone, email })
        });
        if (res2.ok) data = await res2.json();
      } catch {}
    }

    const list = Array.isArray(data) ? data : (data && data.orders) ? data.orders : [];
    all = list.map((o, i) => norm(o, i));

    // (Re)build order type dropdown
    const types = Array.from(new Set(all.map(x => x.orderType).filter(Boolean))).sort();
    if (els.type) {
      els.type.innerHTML = `<option value="">Select Order Type</option>` +
        types.map(t => `<option value="${t}">${t}</option>`).join('');
    }
  }

  // ---- Filter + render ----
  function applyFilters() {
    const q = (els.query?.value || '').trim().toLowerCase();
    const type = els.type?.value || '';
    const from = els.from?.value ? new Date(els.from.value) : null;
    const to   = els.to?.value   ? new Date(els.to.value)   : null;

    filtered = all.filter(o => {
      if (type && o.orderType !== type) return false;
      if (q) {
        const hay = `${o.id} ${o.customerName} ${o.address}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (from || to) {
        const d = o.orderDateTime ? new Date(o.orderDateTime) : null;
        if (!d || isNaN(d)) return false;
        if (from && d < from) return false;
        if (to) { const end = new Date(to); end.setHours(23,59,59,999); if (d > end) return false; }
      }
      return true;
    });

    page = 1;
  }

  function render() {
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    page = Math.min(page, totalPages);

    const start = (page - 1) * PAGE_SIZE;
    const rows = filtered.slice(start, start + PAGE_SIZE);

    if (els.tbody) {
      els.tbody.innerHTML = rows.map((o, i) => {
        const sl = start + i + 1;
        const link = getTrackHref(o.id);
        return `
          <tr>
            <td>${sl}</td>
            <td><a href="${link}">${o.id}</a></td>
            <td>${o.customerName || '—'}</td>
            <td>${o.orderType || '—'}</td>
            <td>${fmtDate(o.orderDateTime)}</td>
            <td>${fmtDate(o.dateDelivered)}</td>
            <td>${o.address || '—'}</td>
            <td>${o.paymentType || '—'}</td>
            <td>${fmtMoney(o.netValue)}</td>
            <td style="text-align:center;">
              <button class="ws-action" title="View" data-view="${o.id}">🔎</button>
            </td>
          </tr>`;
      }).join('') || `<tr><td colspan="10">No orders found.</td></tr>`;
    }

    if (els.count)   els.count.textContent = `Showing ${rows.length || 0} of ${total || 0} entries`;
    if (els.pageNum) els.pageNum.textContent = String(page);

    if (els.first) els.first.disabled = page <= 1;
    if (els.prev)  els.prev.disabled  = page <= 1;
    if (els.next)  els.next.disabled  = page >= totalPages;
    if (els.last)  els.last.disabled  = page >= totalPages;
  }

  function bind() {
    els.searchBtn?.addEventListener('click', () => { applyFilters(); render(); });
    els.clearBtn?.addEventListener('click', () => {
      if (els.type) els.type.value = '';
      if (els.from) els.from.value = '';
      if (els.to)   els.to.value   = '';
      if (els.query) els.query.value = '';
      applyFilters(); render();
    });
    els.query?.addEventListener('input', () => { applyFilters(); render(); });

    els.first?.addEventListener('click', () => { page = 1; render(); });
    els.prev ?.addEventListener('click', () => { page = Math.max(1, page - 1); render(); });
    els.next ?.addEventListener('click', () => { page = page + 1; render(); });
    els.last ?.addEventListener('click', () => { page = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)); render(); });

    els.tbody?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-view]');
      if (!btn) return;
      const id = btn.getAttribute('data-view');
      window.location.href = getTrackHref(id);
    });
  }

  // Public entry
  window.initMyOrders = async function initMyOrders() {
    // Rebind (partial injection safety)
    els.tbody = $('wsTbody');
    els.count = $('wsCount');
    els.pageNum = $('wsPageNum');
    els.first = $('wsFirst');
    els.prev = $('wsPrev');
    els.next = $('wsNext');
    els.last = $('wsLast');
    els.type = $('wsType');
    els.from = $('wsFrom');
    els.to = $('wsTo');
    els.query = $('wsQuery');
    els.searchBtn = $('wsSearchBtn');
    els.clearBtn = $('wsClearBtn');

    bind();
    try { await fetchOrders(); } catch (e) { console.error('[myorders] fetch failed', e); all = []; }
    applyFilters();
    render();
  };

  // Standalone safety for myorders.html direct load
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('wsTbody') && !window.__myOrdersBooted) {
      window.__myOrdersBooted = true;
      window.initMyOrders();
    }
  });
})();
