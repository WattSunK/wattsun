// public/admin/js/orders-controller.js
// Admin Orders (rollback version): list/search/filter/pager + View + built-in Edit modal (no orders-edit.js required)

(function () {
  "use strict";

  // Data adapter must be present (set by your data adapter script)
  if (!window.WattSunAdminData) {
    console.warn("[OrdersController] WattSunAdminData missing");
    return;
  }
  const Data = window.WattSunAdminData;

  // ---- Selectors ----
  const SEL = {
    table: "#ordersTable",
    tbody: "#ordersTbody",
    search: "#ordersSearch",
    statusA: "#ordersStatus",
    statusB: "#ordersFilterType",
    pager: "#ordersPager",
  };

  // ---- tiny helpers ----
  const $ = (s, r = document) => r.querySelector(s);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
  const debounce = (fn, ms) => {
    let t;
    return (...a) => (clearTimeout(t), (t = setTimeout(() => fn(...a), ms)));
  };

  // ---- State ----
  const State = { raw: [], view: [], page: 1, per: 10, q: "", status: "" };

  // ---- Filters ----
  function applyFilters() {
    const q = (State.q || "").toLowerCase();
    const st = (State.status || "").toLowerCase();
    let arr = [...State.raw];

    if (q) {
      arr = arr.filter((o) =>
        [o.id, o.orderNumber, o.fullName, o.email, o.phone]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      );
    }
    if (st) arr = arr.filter((o) => String(o.status || "").toLowerCase() === st);

    // newest first
    arr.sort(
      (a, b) =>
        (b.createdAt ? +new Date(b.createdAt) : 0) -
        (a.createdAt ? +new Date(a.createdAt) : 0)
    );

    State.view = arr;
    const max = Math.max(1, Math.ceil(arr.length / State.per));
    if (State.page > max) State.page = 1;
  }

  function fmtKES(n) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "KES",
        maximumFractionDigits: 0,
      }).format(n || 0);
    } catch {
      return "KSh " + (n || 0).toLocaleString();
    }
  }

  // ---- Render ----
  function renderRows() {
    const tbody = $(SEL.tbody);
    if (!tbody) return;

    const start = (State.page - 1) * State.per;
    const end = start + State.per;

    const rows = State.view.slice(start, end).map((o) => {
      const id = o.id ?? o.orderNumber ?? "";
      const placed = o.createdAt ? new Date(o.createdAt).toLocaleString() : "—";
      const total = fmtKES(o.totalCents ? o.totalCents / 100 : o.total || 0);
      return `
        <tr data-oid="${id}">
          <td data-col="order">${id || "—"}</td>
          <td>${o.fullName || "—"}</td>
          <td data-col="phone">${o.phone || "—"}</td>
          <td data-col="email">${o.email || "—"}</td>
          <td data-col="status">${o.status || "Pending"}</td>
          <td>${total}</td>
          <td>${placed}</td>
          <td>
            <button type="button" class="btn-view" data-oid="${id}">View</button>
            <button type="button" class="btn-edit" data-oid="${id}">Edit</button>
          </td>
        </tr>
      `;
    }).join("");

    tbody.innerHTML =
      rows || `<tr><td colspan="8" style="text-align:center;padding:12px;">No orders found</td></tr>`;
  }

  function renderPager() {
    const el = $(SEL.pager);
    if (!el) return;

    const pages = Math.max(1, Math.ceil(State.view.length / State.per));
    const cur = Math.min(State.page, pages);
    State.page = cur;

    const B = (n, l, dis = false, curr = false) =>
      `<button type="button" class="pg-btn" data-page="${n}" ${
        dis ? "disabled" : ""
      } ${curr ? 'aria-current="page"' : ""}>${l}</button>`;

    let html = "";
    html += B(1, "«", cur === 1);
    html += B(Math.max(1, cur - 1), "‹", cur === 1);
    for (let i = 1; i <= pages; i++) {
      if (i === 1 || i === pages || Math.abs(i - cur) <= 1) {
        html += B(i, String(i), false, i === cur);
      } else if (i === 2 && cur > 3) {
        html += `<span class="pg-ellipsis">…</span>`;
      } else if (i === pages - 1 && cur < pages - 2) {
        html += `<span class="pg-ellipsis">…</span>`;
      }
    }
    html += B(Math.min(pages, cur + 1), "›", cur === pages);
    html += B(pages, "»", cur === pages);

    el.innerHTML = html;
  }

    // ---- Wire UI ----
  function wire() {
    const s = $(SEL.search),
      sa = $(SEL.statusA),
      sb = $(SEL.statusB),
      p = $(SEL.pager);

    on(
      s,
      "input",
      debounce(() => {
        State.q = (s.value || "").trim();
        State.page = 1;
        applyFilters();
        renderRows();
        renderPager();
      }, 180)
    );

    const bindStatus = (el) =>
      el &&
      on(el, "change", () => {
        State.status = (el.value || "").trim();
        State.page = 1;
        applyFilters();
        renderRows();
        renderPager();
      });
    bindStatus(sa);
    bindStatus(sb);

    on(p, "click", (e) => {
      const b = e.target.closest("button.pg-btn");
      if (!b) return;
      const n = parseInt(b.dataset.page, 10);
      if (!Number.isFinite(n)) return;
      State.page = n;
      renderRows();
      renderPager();
    });

    // View
    document.addEventListener("click", (e) => {
      const b = e.target.closest(".btn-view");
      if (!b) return;
      const id = b.getAttribute("data-oid");
      window.dispatchEvent(new CustomEvent("orders:view", { detail: { id } }));
    });

    // Edit (use real drawer defined in orders-edit.js)
document.addEventListener("click", (e) => {
  const b = e.target.closest(".btn-edit");
  if (!b) return;
  const id = b.getAttribute("data-oid");
  const o = State.raw.find((x) => String(x.id ?? x.orderNumber) === String(id));
  if (o && typeof window.openEditOrder === "function") {
    window.openEditOrder(o);
  } else {
    console.warn("[Orders] openEditOrder missing or order not found", { id, o });
  }
});
  }

  async function fetchOnce() {
    const { orders } = await Data.orders.get({ page: 1, per: 10000 });
    State.raw = Array.isArray(orders) ? orders : [];
    State.page = 1;
    applyFilters();
    renderRows();
    renderPager();
  }

  function auto() {
    if (!document.querySelector(SEL.table) || !document.querySelector(SEL.tbody))
      return;
    wire();
    fetchOnce().catch((err) => console.error("[Orders] load failed:", err));
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", auto);
  else auto();

  window.addEventListener("admin:partial-loaded", (e) => {
    if (e?.detail?.name === "orders") auto();
  });

  // -------- View dialog (kept) --------
  function ensureViewModal() {
    let dlg = document.getElementById("orderViewDialog");
    if (dlg) return dlg;
    dlg = document.createElement("dialog");
    dlg.id = "orderViewDialog";
    dlg.innerHTML = `<form method="dialog" class="ws-order-dialog" style="min-width:min(680px,95vw);border:none;">
      <h3 style="margin:0 0 10px;">Order</h3>
      <div class="content" style="max-height:60vh; overflow:auto;"></div>
      <div class="actions" style="margin-top:12px; display:flex; gap:8px; justify-content:flex-end;">
        <button value="close" class="btn">Close</button>
      </div></form>`;
    document.body.appendChild(dlg);
    return dlg;
  }
  function fmtKESdlg(n) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "KES",
        maximumFractionDigits: 0,
      }).format(n || 0);
    } catch {
      return "KSh " + (n || 0).toLocaleString();
    }
  }
  window.addEventListener("orders:view", (e) => {
    const id = e.detail?.id;
    const o = State.raw.find((x) => String(x.id ?? x.orderNumber) === String(id));
    if (!o) return;
    const dlg = ensureViewModal();
    const c = dlg.querySelector(".content");
    const items = (o.items || [])
      .map(
        (it) =>
          `<tr><td>${it.sku || "—"}</td><td>${it.name || "—"}</td><td>${
            it.qty || 1
          }</td><td>${fmtKESdlg(it.price || 0)}</td></tr>`
      )
      .join("");
    c.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div><strong>Order #</strong><div>${o.id || o.orderNumber || "—"}</div></div>
      <div><strong>Status</strong><div>${o.status || "Pending"}</div></div>
      <div><strong>Customer</strong><div>${o.fullName || "—"}</div></div>
      <div><strong>Phone</strong><div>${o.phone || "—"}</div></div>
      <div><strong>Email</strong><div>${o.email || "—"}</div></div>
      <div><strong>Placed</strong><div>${
        o.createdAt ? new Date(o.createdAt).toLocaleString() : "—"
      }</div></div>
      <div><strong>Total</strong><div>${fmtKESdlg(
        o.totalCents ? o.totalCents / 100 : o.total || 0
      )}</div></div>
    </div>
    <h4 style="margin:14px 0 6px;">Items</h4>
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr><th>SKU</th><th>Name</th><th>Qty</th><th>Price</th></tr></thead>
      <tbody>${items || `<tr><td colspan="4">No items</td></tr>`}</tbody>
    </table>`;
    try { dlg.showModal(); } catch { dlg.setAttribute("open", "true"); }
  });

  // Legacy hook: used to keep State in sync if other scripts update an order
  window.refreshOrderRow = function (id, patch = {}) {
    const idx = State.raw.findIndex((o) => String(o.id ?? o.orderNumber) === String(id));
    if (idx === -1) return;
    State.raw[idx] = { ...State.raw[idx], ...patch };
    applyFilters();
    renderRows();
    renderPager();
  };
})(); // end main controller IIFE
