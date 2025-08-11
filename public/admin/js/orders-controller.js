// public/admin/js/orders-controller.js
// Populates Orders table using WattSunAdminData; no CSS/HTML changes needed.
(function () {
  "use strict";
  if (!window.WattSunAdminData) return console.warn("[OrdersController] WattSunAdminData missing");
  const Data = window.WattSunAdminData;
  const fmt = Data.utils;

  const SEL = {
    table: "#ordersTable",
    tbody: "#ordersTbody",
    search: "#ordersSearch",
    status: "#ordersStatus",
    pager: "#ordersPager",
  };

  function $(s, r=document){ return r.querySelector(s); }
  function on(el, ev, fn){ el && el.addEventListener(ev, fn); }
  const State = { page:1, per:10, q:"", status:"", total:0, orders:[] };

  function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

  function renderRows(){
    const tbody = $(SEL.tbody);
    if (!tbody) return;
    const start = (State.page-1)*State.per, end = start + State.per;
    const rows = State.orders.slice(start, end).map(o => {
      const placed = o.createdAt ? new Date(o.createdAt).toLocaleString() : "";
      const total = fmt.fmtKES(o.total||0);
      return `<tr data-id="${o.id||""}">
        <td>${o.id||"—"}</td>
        <td>${o.fullName||"—"}</td>
        <td>${o.phone||"—"}</td>
        <td>${o.email||"—"}</td>
        <td>${o.status||"Pending"}</td>
        <td>${total}</td>
        <td>${placed}</td>
        <td><button type="button" class="btn-view" data-id="${o.id||""}">View</button></td>
      </tr>`;
    }).join("");
    tbody.innerHTML = rows || `<tr><td colspan="8" style="text-align:center;padding:12px;">No orders found</td></tr>`;
  }

  function renderPager(){
    const pager = $(SEL.pager); if(!pager) return;
    const pages = Math.max(1, Math.ceil(State.total/State.per));
    const cur = Math.min(State.page, pages); State.page = cur;
    const b = (n,l,d=false,a=false)=>`<button type="button" class="pg-btn" data-page="${n}" ${d?"disabled":""} ${a?'aria-current="page"':""}>${l}</button>`;
    let html = "";
    html += b(1,"«", cur===1);
    html += b(Math.max(1,cur-1),"‹", cur===1);
    for(let i=1;i<=pages;i++){
      if(i===1||i===pages||Math.abs(i-cur)<=1) html += b(i,String(i),false,i===cur);
      else if(i===2 && cur>3) html += `<span class="pg-ellipsis">…</span>`;
      else if(i===pages-1 && cur<pages-2) html += `<span class="pg-ellipsis">…</span>`;
    }
    html += b(Math.min(pages,cur+1),"›", cur===pages);
    html += b(pages,"»", cur===pages);
    pager.innerHTML = html;
  }

  async function load(){
    const { orders, total } = await Data.orders.get({
      q: State.q, status: State.status, page: State.page, per: State.per
    });
    State.orders = orders; State.total = total || orders.length;
    renderRows(); renderPager();
  }

  function wire(){
    const s = $(SEL.search), f=$(SEL.status), p=$(SEL.pager);
    on(s,"input", debounce(()=>{ State.q = (s.value||"").trim(); State.page=1; load(); },250));
    on(f,"change", ()=>{ State.status = (f.value||"").trim(); State.page=1; load(); });
    on(p,"click", (e)=>{
      const btn = e.target.closest("button.pg-btn"); if(!btn) return;
      const n = parseInt(btn.dataset.page,10); if(!Number.isFinite(n)) return;
      State.page=n; renderRows(); renderPager();
    });
    document.addEventListener("click", (e)=>{
      const b = e.target.closest(".btn-view"); if(!b) return;
      const id = b.getAttribute("data-id"); console.info("[Orders] View:", id);
      // hook your modal open here if needed
    });
  }

  function auto(){
    // Only run when Orders partial is present
    if (!document.querySelector(SEL.table) || !document.querySelector(SEL.tbody)) return;
    wire(); load().catch(err=>console.error("[Orders] load failed:", err));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", auto);
  else auto();

  // Also init when dashboard loads a partial dynamically
  window.addEventListener("admin:partial-loaded", (e)=>{
    if (e?.detail?.name === "orders") auto();
  });
})();
