// public/js/track.js — strategy reset (Step 6.4 + UX fixes)
(function(){
  // ---- Utils ----
  function getSession(){ try{const raw=localStorage.getItem('wattsunUser')||localStorage.getItem('ws_user'); if(!raw) return {}; const o=JSON.parse(raw); return o.user?o.user:o;}catch{return{}} }
  function $(id){ return document.getElementById(id); }
  function qs(){ return new URLSearchParams(location.search); }
  function show(el,on=true){ if(el) el.style.display = on?'block':'none'; }
  function fmtMoney(v){ const n=Number(String(v??'').replace(/[^\d.-]/g,'')); return isNaN(n)?(v?String(v):'—') : 'KSh '+n.toLocaleString('en-KE',{minimumFractionDigits:2}); }
  function fmtDate(d){ if(!d) return '—'; const dt = typeof d==='string'? new Date(d): d; return isNaN(dt) ? String(d) : dt.toLocaleString(); }

  // ---- Render ----
  function renderList(list){
    const box = $('track-result');
    if (!box) return;
    box.innerHTML = '';
    if (!Array.isArray(list) || !list.length){
      box.innerHTML = '<p>No orders found for this phone.</p>';
      show(box, true); return;
    }
    box.innerHTML = list.map(o=>`
      <div class="order-card">
        <p><strong>Order Number:</strong> ${o.orderNumber||o.id||'—'}</p>
        <p><strong>Status:</strong> ${o.status||'Pending'}</p>
        <p><strong>Last Updated:</strong> ${fmtDate(o.updatedAt||o.createdAt)}</p>
        <p><strong>Customer:</strong> ${o.fullName||o.name||'—'}</p>
        <p><strong>Delivery Address:</strong> ${o.deliveryAddress||o.address||'—'}</p>
        <p><strong>Payment Type:</strong> ${o.paymentType||o.paymentMethod||'—'}</p>
        <p><strong>Net Value:</strong> ${typeof o.total==='number'?fmtMoney(o.total):(o.total||'—')}</p>
        ${o.cart_summary?`<p><strong>Items:</strong><br>${String(o.cart_summary).replaceAll('\\n','<br>')}</p>`:''}
      </div>
      <hr>`).join('');
    show(box, true);
  }

  // ---- API ----
  async function fetchTrack({ phone, status, order, email }){
    const payload = { phone, email };
    // Only send status if not empty (so server returns ALL on 'Any')
    if (status) payload.status = status;
    if (order)  payload.order  = order;

    const res = await fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-WS-Email': email || '' },
      body: JSON.stringify(payload)
    });
    let data=null; try{ data=await res.json(); }catch{ data=null; }
    return Array.isArray(data) ? data : (data && Array.isArray(data.orders) ? data.orders : []);
  }

  async function runTrack({ phone, status, order, email }){
    const box = $('track-result'); if (box) { show(box, false); box.textContent=''; }
    const list = await fetchTrack({ phone, status, order, email });
    renderList(list);
  }
  window.runTrack = runTrack;

  // ---- Filter badge + Clear ----
  
  function getOrCreateBadge(){
    let badge = document.getElementById('orderBadge');
    let pill = document.getElementById('orderPill');
    let clear = document.getElementById('orderClear');
    if (!badge){
      badge = document.createElement('div');
      badge.id = 'orderBadge';
      badge.style.display = 'none';
      badge.style.marginTop = '8px';
      const pillSpan = document.createElement('span');
      pillSpan.className = 'pill';
      const idSpan = document.createElement('span');
      idSpan.id = 'orderPill';
      const clr = document.createElement('a');
      clr.id = 'orderClear';
      clr.href = '#';
      clr.textContent = 'Clear';
      pillSpan.appendChild(idSpan);
      pillSpan.appendChild(document.createTextNode(' '));
      pillSpan.appendChild(clr);
      badge.appendChild(pillSpan);
      // insert after filters row if present, else at top of results
      const filters = document.querySelector('.track-filters') || document.getElementById('track-btn')?.parentElement || document.body;
      filters.parentNode.insertBefore(badge, filters.nextSibling);
      pill = idSpan; clear = clr;
    }
    return { badge: document.getElementById('orderBadge'), pill: document.getElementById('orderPill'), clear: document.getElementById('orderClear') };
  }

  function ensureBadge(order){
    const els = getOrCreateBadge(); const pill = els.pill, badge = els.badge, clear = els.clear;
    if (!pill || !badge) return;
    if (order){
      pill.textContent = order;
      show(badge, true);
      if (clear){
        clear.onclick = (e)=>{
          e.preventDefault();
          const p = qs();
          p.delete('order');
          const url = location.pathname + (p.toString()?('?'+p.toString()):'');
          history.replaceState({}, '', url);
          // Reset status to Any to show all orders
          const statusEl = $('track-status');
          if (statusEl) statusEl.value = '';
          reload();
        };
      }
    }else{
      show(badge, false);
    }
  }

  // ---- Auto-refresh (Step 6.4) ----
  async function reload(){
    const sess = getSession(), p = qs();
    const phone  = ($('track-phone')?.value || '').trim() || (sess.phone || '').trim();
    const status = $('track-status')?.value || p.get('status') || ''; // allow Any (empty)
    const order  = p.get('order') || '';
    await runTrack({ phone, status, order, email: sess.email || '' });
    ensureBadge(order);
  }

  function setupAutoRefresh(){
    let pending = false;
    const kick = ()=>{ if (pending) return; pending=true; queueMicrotask(async()=>{try{await reload()}finally{pending=false}}); };
    window.addEventListener('focus', kick);
    window.addEventListener('message', e=>{ if (e?.data?.type==='orders-updated') kick(); });
    window.addEventListener('storage', e=>{ if (e.key==='ordersUpdatedAt') kick(); });
  }

  // ---- Boot ----
  document.addEventListener('DOMContentLoaded', () => {
    const sess = getSession();
    const p = qs();

    const phoneEl = $('track-phone'), statusEl = $('track-status'), btn = $('track-btn');

    if (phoneEl && !phoneEl.value) phoneEl.value = (sess.phone || '').trim();
    if (statusEl) statusEl.value = p.get('status') || (statusEl.value || ''); // leave '' (Any) if set

    ensureBadge(p.get('order') || '');

    if (btn) btn.addEventListener('click', reload);
    [phoneEl, statusEl].forEach(el => el && el.addEventListener('keydown', (e)=>{ if (e.key==='Enter'){ e.preventDefault(); btn?.click(); }}));

    setupAutoRefresh();
    reload(); // initial load
  });
})();
