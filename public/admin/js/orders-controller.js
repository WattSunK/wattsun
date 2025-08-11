// public/admin/js/orders-controller.js
// Client-side filtering + pagination + safe "View" modal (no PATCH yet).
(function () {
  "use strict";

  if (!window.WattSunAdminData) {
    console.warn("[OrdersController] WattSunAdminData missing — load data-adapter.js first");
    return;
  }
  const Data = window.WattSunAdminData;

  // Prefer these IDs; falls back to legacy #ordersFilterType for status
  const SEL = {
    table:    "#ordersTable",
    tbody:    "#ordersTbody",
    search:   "#ordersSearch",
    statusA:  "#ordersStatus",
    statusB:  "#ordersFilterType", // legacy fallback
    pager:    "#ordersPager",
  };

  // ---- tiny helpers ----
  const $  = (s, r=document) => r.querySelector(s);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // ---- state ----
  const State = {
    raw: [],        // all orders from API
    view: [],       // filtered + sorted
    page: 1,
    per: 10,
    q: "",
    status: "",
  };

  // ---- client-side filter/sort/paginate ----
  function applyFilters() {
    const q = (State.q || "").toLowerCase();
    const st = (State.status || "").toLowerCase();

    let arr = [...State.raw];

    if (q) {
      arr = arr.filter(o => {
        return [
          o.id,
          o.fullName,
          o.email,
          o.phone
        ].some(v => (v || "").toString().toLowerCase().includes(q));
      });
    }
    if (st) {
      arr = arr.filter(o => (o.status || "").toLowerCase() === st);
    }

    // Newest first if we have dates
    arr.sort((a, b) => {
      const ax = a.createdAt ? +new Date(a.createdAt) : 0;
      const bx = b.createdAt ? +new Date(b.createdAt) : 0;
      return bx - ax;
    });

    State.view = arr;
    const maxPage = Math.max(1, Math.ceil(arr.length / State.per));
    if (State.page > maxPage) State.page = 1;
  }

  // ---- rendering ----
  function fmtKES(n) {
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(n || 0); }
    catch { return "KSH " + (n || 0).toLocaleString(); }
  }

  function renderRows() {
    const tbody = $(SEL.tbody);
    if (!tbody) return;

    const start = (State.page - 1) * State.per;
       const end   = start + State.per;
    const slice = State.view.slice(start, end);

    const rows = slice.map(o => {
      const placed = o.createdAt ? new Date(o.createdAt).toLocaleString() : "";
      const total  = fmtKES(o.total || 0);
      const status = o.status || "Pending";
      const id     = o.id || "—";
      const name   = o.fullName || "—";
      const phone  = o.phone || "—";
      const email  = o.email || "—";

      return `<tr data-id="${id}">
        <td>${id}</td>
        <td>${name}</td>
        <td>${phone}</td>
        <td>${email}</td>
        <td>${status}</td>
        <td>${total}</td>
        <td>${placed}</td>
        <td>
          <button type="button" class="btn-view" data-id="${id}">View</button>
        </td>
      </tr>`;
    }).join("");

    tbody.innerHTML = rows || `<tr><td colspan="8" style="text-align:center;padding:12px;">No orders found</td></tr>`;
  }

  function renderPager() {
    const el = $(SEL.pager);
    if (!el) return;

    const total = State.view.length;
    const pages = Math.max(1, Math.ceil(total / State.per));
    const cur   = Math.min(State.page, pages);
    State.page  = cur;

    const btn = (n, label, dis=false, act=false) =>
      `<button type="button" class="pg-btn" data-page="${n}" ${dis ? "disabled" : ""} ${act ? 'aria-current="page"' : ""}>${label}</button>`;

    let html = "";
    html += btn(1, "«", cur === 1);
    html += btn(Math.max(1, cur - 1), "‹", cur === 1);

    for (let i = 1; i <= pages; i++) {
      const near = Math.abs(i - cur) <= 1;
      if (i === 1 || i === pages || near) html += btn(i, String(i), false, i === cur);
      else if (i === 2 && cur > 3) html += `<span class="pg-ellipsis">…</span>`;
      else if (i === pages - 1 && cur < pages - 2) html += `<span class="pg-ellipsis">…</span>`;
    }

    html += btn(Math.min(pages, cur + 1), "›", cur === pages);
    html += btn(pages, "»", cur === pages);

    el.innerHTML = html;
  }

  // ---- modal (view-only for now) ----
  function ensureModal() {
    let dlg = document.getElementById("orderViewDialog");
    if (dlg) return dlg;

    dlg = document.createElement("dialog");
    dlg.id = "orderViewDialog";
    dlg.innerHTML = `
      <form method="dialog" class="ws-order-dialog" style="min-width: min(680px, 95vw); border: none;">
        <h3 style="margin:0 0 10px;">Order</h3>
        <div class="content" style="max-height:60vh; overflow:auto;"></div>
        <div class="actions" style="margin-top:12px; display:flex; gap:8px; justify-content:flex-end;">
          <button value="close" class="btn">Close</button>
        </div>
      </form>
    `;
    document.body.appendChild(dlg);
    return dlg;
  }

  function openView(id) {
    const o = State.raw.find(x => String(x.id) === String(id));
    const dlg = ensureModal();
    const content = dlg.querySelector(".content");
    if (!o || !content) return;

    const items = (o.items || []).map(it => `
      <tr>
        <td>${it.sku || "—"}</td>
        <td>${it.name || "—"}</td>
        <td>${it.qty || 1}</td>
        <td>${fmtKES(it.price || 0)}</td>
      </tr>
    `).join("");

    content.innerHTML = `
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
        <div><strong>Order #</strong><div>${o.id || "—"}</div></div>
        <div><strong>Status</strong><div>${o.status || "Pending"}</div></div>
        <div><strong>Customer</strong><div>${o.fullName || "—"}</div></div>
        <div><strong>Phone</strong><div>${o.phone || "—"}</div></div>
        <div><strong>Email</strong><div>${o.email || "—"}</div></div>
        <div><strong>Placed</strong><div>${o.createdAt ? new Date(o.createdAt).toLocaleString() : "—"}</div></div>
        <div><strong>Total</strong><div>${fmtKES(o.total || 0)}</div></div>
      </div>
      <h4 style="margin:14px 0 6px;">Items</h4>
      <table style="width:100%; border-collapse:collapse;">
        <thead><tr><th>SKU</th><th>Name</th><th>Qty</th><th>Price</th></tr></thead>
        <tbody>${items || `<tr><td colspan="4">No items</td></tr>`}</tbody>
      </table>
      <p style="margin-top:10px; color:#6b7280;">Edit/Update will be enabled in the next step when backend PATCH is live.</p>
    `;

    try { dlg.showModal(); } catch { dlg.setAttribute("open","true"); }
  }

  // ---- events ----
  function wire() {
    const s  = $(SEL.search);
    const sa = $(SEL.statusA);
    const sb = $(SEL.statusB);
    const p  = $(SEL.pager);

    on(s, "input", debounce(() => {
      State.q = (s.value || "").trim();
      State.page = 1;
      applyFilters(); renderRows(); renderPager();
    }, 200));

    const onStatus = (el) => el && on(el, "change", () => {
      State.status = (el.value || "").trim();
      State.page = 1;
      applyFilters(); renderRows(); renderPager();
    });
    onStatus(sa); onStatus(sb);

    on(p, "click", (e) => {
      const btn = e.target.closest("button.pg-btn");
      if (!btn) return;
      const n = parseInt(btn.dataset.page, 10);
      if (!Number.isFinite(n)) return;
      State.page = n;
      renderRows(); renderPager();
    });

    document.addEventListener("click", (e) => {
      const b = e.target.closest(".btn-view");
      if (!b) return;
      const id = b.getAttribute("data-id");
      openView(id);
    });
  }

  async function fetchOnce() {
    const tbody = $(SEL.tbody);
    try {
      // Fetch "a lot" so we can paginate/filter client-side reliably
      const { orders } = await Data.orders.get({ page: 1, per: 10000 });
      State.raw = Array.isArray(orders) ? orders : [];
    } catch (err) {
      console.error("[Orders] /api/orders failed:", err);
      if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="color:#a00;padding:12px;">Failed to load orders</td></tr>`;
      return;
    }
    State.page = 1;
    applyFilters();
    renderRows();
    renderPager();
  }

  function autoInit() {
    if (!$(SEL.table) || !$(SEL.tbody)) return; // not on Orders partial
    wire();
    fetchOnce();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoInit);
  else autoInit();

  // Init after dashboard loads a partial dynamically
  window.addEventListener("admin:partial-loaded", (e) => {
    if (e?.detail?.name === "orders") autoInit();
  });
})();
