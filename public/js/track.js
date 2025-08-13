// public/js/track.js — hotfix (also embedded inline in myaccount/track.html)
(function(){
  function getSession(){
    try{const raw=localStorage.getItem('wattsunUser')||localStorage.getItem('ws_user');if(!raw)return{};const o=JSON.parse(raw);return o.user?o.user:o;}catch{return{}}
  }
  function $(id){return document.getElementById(id)}
  function qs(){return new URLSearchParams(location.search)}
  function show(el,on=true){if(el)el.style.display=on?'block':'none'}
  function fmtMoney(v){const n=Number(String(v??'').replace(/[^\d.-]/g,''));return isNaN(n)?(v?String(v):'—'):'KSh '+n.toLocaleString('en-KE',{minimumFractionDigits:2})}
  function fmtDate(d){if(!d)return'—';const dt=typeof d==='string'?new Date(d):d;return isNaN(dt)?String(d):dt.toLocaleString()}

  function render(list){
    const box=$('track-result'); if(!box) return;
    box.innerHTML='';
    if(!Array.isArray(list)||!list.length){ box.innerHTML='<p>No orders found for this phone.</p>'; show(box,true); return; }
    box.innerHTML=list.map(o=>`
      <div class="order-card">
        <p><strong>Order Number:</strong> ${o.orderNumber||o.id||'—'}</p>
        <p><strong>Status:</strong> ${o.status||'Pending'}</p>
        <p><strong>Last Updated:</strong> ${fmtDate(o.updatedAt||o.createdAt)}</p>
        <p><strong>Customer:</strong> ${o.fullName||o.name||'—'}</p>
        <p><strong>Delivery Address:</strong> ${o.deliveryAddress||o.address||'—'}</p>
        <p><strong>Payment Type:</strong> ${o.paymentType||o.paymentMethod||'—'}</p>
        <p><strong>Net Value:</strong> ${typeof o.total==='number'?fmtMoney(o.total):(o.total||'—')}</p>
        ${o.cart_summary?`<p><strong>Items:</strong><br>${String(o.cart_summary).replaceAll('\\n','<br>')}</p>`:''}
      </div><hr>`).join('');
    show(box,true);
  }

  async function fetchTrack({phone,status,order,email}){
    const res=await fetch('/api/track',{method:'POST',headers:{'Content-Type':'application/json','X-WS-Email':email||''},body:JSON.stringify({phone,status,order,email})});
    let data=null; try{data=await res.json()}catch{data=null}
    return Array.isArray(data)?data:(data&&Array.isArray(data.orders)?data.orders:[]);
  }

  async function runTrack({phone,status,order,email}){
    const box=$('track-result'); if(box){ show(box,false); box.textContent=''; }
    try{ const list=await fetchTrack({phone,status,order,email}); render(list); }catch(e){ console.error('[track] failed',e); if(box){box.innerHTML='<p>Something went wrong. Please try again.</p>'; show(box,true);}}
  }
  window.runTrack = runTrack;

  function ensureBadge(order){
    const pill=$('orderPill'), badge=$('orderBadge'); if(!pill||!badge) return;
    if(order){pill.textContent=order; show(badge,true);} else {pill.textContent=''; show(badge,false);}
  }

  function updateCartCountBadge(){
    let c=0; try{const cart=JSON.parse(localStorage.getItem('cart'))||[]; c=cart.reduce((s,i)=>s+(i.quantity||1),0);}catch{}
    const b=document.getElementById('cart-count'); if(b) b.textContent=c;
  }

  async function reloadTrackPreservingUI(){
    const sess=getSession(), p=qs();
    const phone=($('track-phone')?.value||'').trim()||(sess.phone||'').trim();
    const status=$('track-status')?.value||p.get('status')||'Pending';
    const order=p.get('order')||'';
    await runTrack({phone,status,order,email:sess.email||''});
    ensureBadge(order);
  }

  function setupAutoRefresh(refetch){
    let pending=false;
    const kick=()=>{ if(pending) return; pending=true; queueMicrotask(async()=>{ try{await refetch()}finally{pending=false} }); };
    window.addEventListener('focus',kick);
    window.addEventListener('message',e=>{ if(e?.data?.type==='orders-updated') kick(); });
    window.addEventListener('storage',e=>{ if(e.key==='ordersUpdatedAt') kick(); if(e.key==='cart') updateCartCountBadge(); });
  }

  document.addEventListener('DOMContentLoaded',()=>{
    updateCartCountBadge();
    const sess=getSession(), p=qs();
    const phoneEl=$('track-phone'), statusEl=$('track-status'), btn=$('track-btn');
    if(phoneEl && !phoneEl.value) phoneEl.value=(sess.phone||'').trim();
    if(statusEl) statusEl.value=p.get('status')||'Pending';
    ensureBadge(p.get('order')||'');
    if(btn) btn.addEventListener('click',()=>{
      const phone=(phoneEl?.value||'').trim();
      const status=statusEl?.value||'Pending';
      const order=p.get('order')||'';
      runTrack({phone,status,order,email:sess.email||''});
    });
    [phoneEl,statusEl].forEach(el=>el && el.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); btn?.click(); } }));
    const phone=(phoneEl?.value||'').trim()||(sess.phone||'').trim();
    if(phone){ runTrack({phone,status:statusEl?.value||'Pending',order:p.get('order')||'',email:sess.email||''}); }
    setupAutoRefresh(reloadTrackPreservingUI);
  });
})();