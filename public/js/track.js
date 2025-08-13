// /public/js/track.js — FULL frontend for Track page
// - Implements runTrack({ phone, status, order, email })
// - Auto-refreshes when admin saves via focus/message/storage
// - Preserves UI and shows order badge if ?order=<id> is present

(function () {
  // ----- Utilities -----
  function getSession(){
    try{
      const raw = localStorage.getItem('wattsunUser') || localStorage.getItem('ws_user');
      if (!raw) return {};
      const o = JSON.parse(raw);
      return o.user ? o.user : o;
    }catch { return {}; }
  }
  function $(id){ return document.getElementById(id); }
  function qs(){ return new URLSearchParams(location.search); }
  function show(el, on=true){ if (el) el.style.display = on ? 'block' : 'none'; }
  function fmtMoney(v){
    const num = Number(String(v ?? '').replace(/[^\d.-]/g,''));
    if (isNaN(num)) return v ? String(v) : '—';
    return 'KSh ' + num.toLocaleString('en-KE',{ minimumFractionDigits: 2 });
  }
  function fmtDate(d){
    if(!d) return '—';
    const dt = typeof d === 'string' ? new Date(d) : d;
    return isNaN(dt) ? String(d) : dt.toLocaleString();
  }

  // ----- Render -----
  function renderResults(list){
    const box = $('track-result');
    if (!box) return;
    box.innerHTML = '';

    if (!Array.isArray(list) || list.length === 0){
      box.innerHTML = '<p>No orders found for this phone.</p>';
      show(box, true);
      return;
    }

    box.innerHTML = list.map(o => `
      <div class="order-card">
        <p><strong>Order Number:</strong> ${o.orderNumber || o.id || '—'}</p>
        <p><strong>Status:</strong> ${o.status || 'Pending'}</p>
        <p><strong>Last Updated:</strong> ${fmtDate(o.updatedAt || o.createdAt)}</p>
        <p><strong>Customer:</strong> ${o.fullName || o.name || '—'}</p>
        <p><strong>Delivery Address:</strong> ${o.deliveryAddress || o.address || '—'}</p>
        <p><strong>Payment Type:</strong> ${o.paymentType || o.paymentMethod || '—'}</p>
        <p><strong>Net Value:</strong> ${typeof o.total==='number' ? fmtMoney(o.total) : (o.total || '—')}</p>
        ${o.cart_summary ? `<p><strong>Items:</strong><br>${String(o.cart_summary).replaceAll('\\n','<br>')}</p>` : ''}
      </div>
      <hr/>`).join('');
    show(box, true);
  }

  // ----- Core fetch -----
  async function fetchTrack({ phone, status, order, email }){
    // Use POST (matches routes/track.js)
    const res = await fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-WS-Email': email || '' },
      body: JSON.stringify({ phone, status, order, email })
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    const list = Array.isArray(data) ? data : (data && Array.isArray(data.orders) ? data.orders : []);
    return list;
  }

  // ----- Public API: runTrack -----
  async function runTrack({ phone, status, order, email }){
    const box = $('track-result');
    if (box) { show(box, false); box.textContent = ''; }

    try{
      const list = await fetchTrack({ phone, status, order, email });
      renderResults(list);
    }catch(err){
      console.error('[track] fetch failed', err);
      if (box) { box.innerHTML = '<p>Something went wrong. Please try again.</p>'; show(box, true); }
    }
  }
  window.runTrack = runTrack; // expose to console/tests

  // ----- Auto-refresh (Step 6.4) -----
  async function reloadTrackPreservingUI() {
    const sess = getSession();
    const phoneEl = $('track-phone');
    const statusEl = $('track-status');
    const p = qs();
    const phone  = (phoneEl?.value || '').trim() || (sess.phone || '').trim();
    const status = statusEl?.value || p.get('status') || 'Pending';
    const order  = p.get('order') || '';
    const email  = sess.email || '';
    await runTrack({ phone, status, order, email });
    ensureBadge(order);
  }

  function setupTrackAutoRefresh(refetchFn) {
    let pending = false;
    const kick = () => {
      if (pending) return;
      pending = true;
      queueMicrotask(async () => {
        try { await refetchFn(); } finally { pending = false; }
      });
    };
    window.addEventListener('focus', kick);
    window.addEventListener('message', (e) => { if (e?.data?.type === 'orders-updated') kick(); });
    window.addEventListener('storage', (e) => { if (e.key === 'ordersUpdatedAt') kick(); });
  }

  function ensureBadge(order){
    const pill = $('orderPill');
    const badge = $('orderBadge');
    if (!pill || !badge) return;
    if (order) { pill.textContent = order; show(badge, true); }
    else { pill.textContent=''; show(badge, false); }
  }

  // ----- Boot -----
  document.addEventListener('DOMContentLoaded', () => {
    const sess = getSession();
    const p = qs();

    const phoneEl = $('track-phone');
    const statusEl = $('track-status');
    const btn = $('track-btn');

    // Prefill phone from session if empty
    if (phoneEl && !phoneEl.value) phoneEl.value = (sess.phone || '').trim();

    // Set status from query (default Pending)
    if (statusEl) statusEl.value = p.get('status') || 'Pending';

    // Badge from ?order=
    ensureBadge(p.get('order') || '');

    // Button / Enter to fetch
    if (btn) btn.addEventListener('click', () => {
      const phone  = (phoneEl?.value || '').trim();
      const status = statusEl?.value || 'Pending';
      const order  = p.get('order') || '';
      runTrack({ phone, status, order, email: sess.email || '' });
    });
    // Enter key handler on inputs
    [phoneEl, statusEl].forEach(el => el && el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); btn?.click(); }
    }));

    // Initial auto-run if we have a phone
    const phone = (phoneEl?.value || '').trim() || (sess.phone || '').trim();
    if (phone) {
      runTrack({ phone, status: statusEl?.value || 'Pending', order: p.get('order') || '', email: sess.email || '' });
    }

    // Step 6.4 listeners
    setupTrackAutoRefresh(reloadTrackPreservingUI);
  });
})();