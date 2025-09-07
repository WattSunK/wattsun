// public/admin/js/orders-controller.js
// Admin Orders list controller — aligned to the new contract & UI.
// Adds a tiny auto-detect so if the Orders table/tbody don't have the
// expected IDs, we assign them (no HTML changes required).

(function () {
  "use strict";

  if (!window.WattSunAdminData) {
    console.warn("[OrdersController] WattSunAdminData missing");
    return;
  }
  const Data = window.WattSunAdminData;

  // ----- selectors (single status select; drop legacy duplicates) -----
  const SEL = {
    table:  "#ordersTable",
    tbody:  "#ordersTbody",
    search: "#ordersSearch",
    status: "#ordersStatus",
    pager:  "#ordersPager"
  };

  const $  = (s, r = document) => r.querySelector(s);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  const State = {
    raw: [],
    view: [],
    page: 1,
    per: 10,     // UI page size (client-side)
    q: "",
    status: ""   // "All" or empty = no filter
  };

  // ---------- auto-detect table/tbody and assign IDs if missing ----------
  function ensureOrdersIds() {
    let table = document.querySelector(SEL.table);
    let tbody = document.querySelector(SEL.tbody);
    if (table && tbody) return;

    // Try: the first table inside the "Orders" card/section
    const card = [...document.querySelectorAll('section,.card,.panel,main,div')]
      .find(x => x && /(^|\s)Orders(\s|$)/i.test(x.querySelector('h2,h3,h4,header,legend,summary')?.textContent || ""));
    table = table || card?.querySelector('table') || document.querySelector('table');
    if (!table) return;

    tbody = tbody || table.querySelector('tbody') || table.appendChild(document.createElement('tbody'));
    if (!table.id) table.id = SEL.table.slice(1);
    if (!tbody.id) tbody.id = SEL.tbody.slice(1);
  }

  // ----- formatting -----
  function fmtMoney(cents, currency = "KES") {
    if (!Number.isFinite(cents)) return "—";
    try {
      return new Intl.NumberFormat("en-KE", {
        style: "currency",
        currency,
        maximumFractionDigits: 0
      }).format(cents / 100);
    } catch {
      return `${currency} ${(cents / 100).toLocaleString("en-KE")}`;
    }
  }

  // ----- filter + sort -----
  function applyFilters() {
    const q = (State.q || "").toLowerCase();
    const st = (State.status || "").toLowerCase();
    let arr = [...State.raw];

    if (q) {
      arr = arr.filter(o =>
        [o.id, o.orderNumber, o.fullName, o.phone, o.email]
          .some(v => String(v || "").toLowerCase().includes(q))
      );
    }
    if (st && st !== "all") {
      arr = arr.filter(o => String(o.status || "").toLowerCase() === st);
    }

    // newest first by createdAt
    arr.sort((a, b) =>
      (b.createdAt ? +new Date(b.createdAt) : 0) -
      (a.createdAt ? +new Date(a.createdAt) : 0)
    );

    State.view = arr;
    const maxPage = Math.max(1, Math.ceil(arr.length / State.per));
    if (State.page > maxPage) State.page = 1;
  }

  // ----- render -----
  function renderRows() {
    const tbody = $(SEL.tbody);
    if (!tbody) return;

    const start = (State.page - 1) * State.per;
    const end   = start + State.per;
    const rows  = State.view.slice(start, end).map(o => {
      const id    = o.orderNumber || o.id || "";
      const name  = o.fullName || "—";
      const when  = o.createdAt ? new Date(o.createdAt).toLocaleString() : "—";
      const total = fmtMoney(o.totalCents, o.currency);
      const status= o.status || "Pending";

      return `
        <tr data-oid="${id}">
          <td data-col="order">${id}</td>
          <td data-col="customer">${name}</td>
          <td data-col="status">${status}</td>
          <td data-col="created">${when}</td>
          <td data-col="total">${total}</td>
          <td data-col="action">
            <button type="button" class="btn-view" data-oid="${id}">View</button>
            <button type="button" class="btn-edit" data-action="edit-order"
                    data-oid="${id}" data-phone="${o.phone || ''}" data-email="${o.email || ''}">
              Edit
            </button>
          </td>
        </tr>`;
    }).join("");

    tbody.innerHTML = rows || `<tr><td colspan="6" style="text-align:center;padding:12px;">No data yet</td></tr>`;
  }

  function renderPager() {
    const el = $(SEL.pager);
    if (!el) return;
    const pages = Math.max(1, Math.ceil(State.view.length / State.per));
    const cur   = Math.min(State.page, pages);
    State.page  = cur;

    const B = (n, l, dis = false, curp = false) =>
      `<button type="button" class="pg-btn" data-page="${n}" ${dis ? "disabled" : ""} ${curp ? 'aria-current="page"' : ""}>${l}</button>`;

    let html = "";
    html += B(1, "First", cur === 1);
    html += B(Math.max(1, cur - 1), "Previous", cur === 1);
    html += `<span class="pg-info"> ${cur} / ${pages} </span>`;
    html += B(Math.min(pages, cur + 1), "Next", cur === pages);
    html += B(pages, "Last", cur === pages);
    el.innerHTML = html;
  }

  // ----- wiring -----
  function wire() {
    const s = $(SEL.search);
    const st= $(SEL.status);
    const p = $(SEL.pager);

    on(s, "input", debounce(() => {
      State.q = (s.value || "").trim();
      State.page = 1;
      applyFilters(); renderRows(); renderPager();
    }, 200));

    on(st, "change", () => {
      State.status = (st.value || "").trim();
      State.page = 1;
      applyFilters(); renderRows(); renderPager();
    });

    on(p, "click", (e) => {
      const b = e.target.closest("button.pg-btn");
      if (!b) return;
      const n = parseInt(b.dataset.page, 10);
      if (!Number.isFinite(n)) return;
      State.page = n;
      renderRows(); renderPager();
    });

    // View
    document.addEventListener("click", (e) => {
      const b = e.target.closest(".btn-view");
      if (!b) return;
      const id = b.getAttribute("data-oid");
      window.dispatchEvent(new CustomEvent("orders:view", { detail: { id } }));
    });

    // Edit (orders-edit.js listens to [data-action="edit-order"])
    document.addEventListener("click", (e) => {
      const b = e.target.closest(".btn-edit");
      if (!b) return;
      const id = b.getAttribute("data-oid") || "";
      const phone = b.getAttribute("data-phone") || "";
      const email = b.getAttribute("data-email") || "";
      window.dispatchEvent(new CustomEvent("orders:edit", { detail: { id, phone, email } }));
    });
  }

  // ----- data load -----
  async function fetchOnce() {
    // Ask server for up to 10k; paginate client-side for smooth UI.
    const { orders } = await Data.orders.get({ page: 1, per: 10000 });
    State.raw = Array.isArray(orders) ? orders : [];
    State.page = 1;
    applyFilters(); renderRows(); renderPager();
  }

  function boot() {
    ensureOrdersIds();        // <-- ensures #ordersTable/#ordersTbody exist
    if (!$(SEL.table) || !$(SEL.tbody)) return;
    wire();
    fetchOnce().catch(err => console.error("[Orders] load failed:", err));
  }

  // Start now, or when the partial arrives
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // Also react to admin shell events if emitted
  window.addEventListener("admin:partial-loaded", (e) => {
    if (e?.detail?.name === "orders") boot();
  });

  // ----- lightweight viewer (kept minimal) -----
  function ensureViewDialog() {
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

  window.addEventListener("orders:view", (e) => {
    const id = e.detail?.id;
    const o = State.raw.find(x => String(x.id) === String(id) || String(x.orderNumber) === String(id));
    if (!o) return;
    const dlg = ensureViewDialog();
    const c = dlg.querySelector(".content");

    const items = (o.items || []).map(it =>
      `<tr><td>${it.sku || "—"}</td><td>${it.name || "—"}</td><td>${it.qty || 1}</td><td>${fmtMoney((it.priceCents ?? 0), o.currency)}</td></tr>`
    ).join("");

    c.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div><strong>Order #</strong><div>${o.orderNumber || o.id || "—"}</div></div>
        <div><strong>Status</strong><div>${o.status || "Pending"}</div></div>
        <div><strong>Customer</strong><div>${o.fullName || "—"}</div></div>
        <div><strong>Phone</strong><div>${o.phone || "—"}</div></div>
        <div><strong>Email</strong><div>${o.email || "—"}</div></div>
        <div><strong>Placed</strong><div>${o.createdAt ? new Date(o.createdAt).toLocaleString() : "—"}</div></div>
        <div><strong>Total</strong><div>${fmtMoney(o.totalCents, o.currency)}</div></div>
      </div>
      <h4 style="margin:14px 0 6px;">Items</h4>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr><th>SKU</th><th>Name</th><th>Qty</th><th>Price</th></tr></thead>
        <tbody>${items || `<tr><td colspan="4">No items</td></tr>`}</tbody>
      </table>
    `;
    try { dlg.showModal(); } catch { dlg.setAttribute("open", "true"); }
  });

  // Expose minimal hook for inline refresh after a PATCH
  window.refreshOrderRow = function (id, patch = {}) {
    const idx = State.raw.findIndex(o =>
      String(o.id) === String(id) || String(o.orderNumber) === String(id)
    );
    if (idx === -1) return;
    State.raw[idx] = { ...State.raw[idx], ...patch };
    applyFilters(); renderRows(); renderPager();
  };
})();
