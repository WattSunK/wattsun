// public/admin/js/orders-controller.js
// Admin Orders list controller — robust boot + adapter compatibility
// - Works with Data.orders.list() OR .get()
// - Boots when the Orders partial lands (detail.partial or detail.name)
// - Exposes window.__WS_ORDERS_FORCE_BOOT()
// - Auto-assigns #ordersTable/#ordersTbody if missing (no HTML edits needed)

(function () {
  "use strict";

  if (!window.WattSunAdminData) {
    console.warn("[OrdersController] WattSunAdminData missing");
    return;
  }
  const Data = window.WattSunAdminData;

  // ----- selectors -----
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
    per: 10,
    q: "",
    status: ""
  };

  // prevent duplicate wiring/boot
  let booted = false;

  // ---------- auto-detect table/tbody and assign IDs if missing ----------
  function ensureOrdersIds() {
    let table = document.querySelector(SEL.table);
    let tbody = document.querySelector(SEL.tbody);
    if (table && tbody) return true;

    // Try: the first table inside an element whose header contains "Orders"
    const card = [...document.querySelectorAll('section,.card,.panel,main,div')]
      .find(x => x && /(^|\s)Orders(\s|$)/i.test(x.querySelector('h1,h2,h3,h4,header,legend,summary')?.textContent || ""));
    table = table || card?.querySelector('table') || document.querySelector('table');
    if (!table) return false;

    tbody = tbody || table.querySelector('tbody') || table.appendChild(document.createElement('tbody'));
    if (!table.id) table.id = SEL.table.slice(1);
    if (!tbody.id) tbody.id = SEL.tbody.slice(1);
    return true;
  }

  // ----- formatting -----
  function fmtMoney(cents, currency = "KES") {
    if (!Number.isFinite(cents)) return "—";
    try {
      return new Intl.NumberFormat("en-KE", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
    } catch { return `${currency} ${(cents/100).toLocaleString('en-KE')}`; }
  }

  // ----- filter + sort -----
  function applyFilters() {
    const q = (State.q || "").toLowerCase();
    const st = (State.status || "").toLowerCase();
    let arr = [...State.raw];

    if (q) {
      arr = arr.filter(o => [o.id, o.orderNumber, o.fullName, o.phone, o.email]
        .some(v => String(v || "").toLowerCase().includes(q)));
    }
    if (st && st !== "all") {
      arr = arr.filter(o => String(o.status || "").toLowerCase() === st);
    }

    arr.sort((a, b) => (b.createdAt ? +new Date(b.createdAt) : 0) - (a.createdAt ? +new Date(a.createdAt) : 0));

    State.view = arr;
    const maxPage = Math.max(1, Math.ceil(arr.length / State.per));
    if (State.page > maxPage) State.page = 1;
  }

  // ----- render -----
  function renderRows() {
    const tbody = $(SEL.tbody); if (!tbody) return;
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
          <td data-col="action" style="text-align:center;">
            <button type="button" class="btn btn-sm btn-view" data-oid="${id}">View</button>
            <button type="button" class="btn btn-sm btn-edit" data-action="edit-order" data-oid="${id}" data-phone="${o.phone || ''}" data-email="${o.email || ''}">Edit</button>
          </td>
        </tr>`;
    }).join("");

    tbody.innerHTML = rows || `<tr><td colspan="6" style="text-align:center;padding:12px;">No data yet</td></tr>`;
  }

  function renderPager() {
  const el = $(SEL.pager); if (!el) return;

  const pages = Math.max(1, Math.ceil(State.view.length / State.per));
  const cur   = Math.min(State.page, pages);
  State.page  = cur;

  // helper to output an a11y-disabled button that still looks “enabled” per theme
  const B = (n, label, isDisabled = false, isCurrent = false) => {
    if (isDisabled) {
      return `<button type="button"
                      class="btn small pg-btn"
                      data-page="${n}"
                      aria-disabled="true"
                      tabindex="-1">${label}</button>`;
    }
    return `<button type="button"
                    class="btn small pg-btn"
                    data-page="${n}"
                    ${isCurrent ? 'aria-current="page"' : ''}>${label}</button>`;
  };

  el.innerHTML =
    B(1, "First",            cur === 1) +
    B(Math.max(1, cur - 1), "Previous",  cur === 1) +
    `<span class="pg-info"> ${cur} / ${pages} </span>` +
    B(Math.min(pages, cur + 1), "Next",  cur === pages) +
    B(pages, "Last",           cur === pages);
}

  // ----- wiring -----
  function wire() {
    const s = $(SEL.search);
    const st= $(SEL.status);
    const p = $(SEL.pager);

    on(s, "input", debounce(() => {
      State.q = (s.value || "").trim();
      State.page = 1; applyFilters(); renderRows(); renderPager();
    }, 200));

    on(st, "change", () => {
      State.status = (st.value || "").trim();
      State.page = 1; applyFilters(); renderRows(); renderPager();
    });

    on(p, "click", (e) => {
      const b = e.target.closest("button.pg-btn"); if (!b) return;
      const n = parseInt(b.dataset.page, 10); if (!Number.isFinite(n)) return;
      State.page = n; renderRows(); renderPager();
    });

    document.addEventListener("click", (e) => {
      const vb = e.target.closest(".btn-view");
      if (vb) {
        const id = vb.getAttribute("data-oid");
        window.dispatchEvent(new CustomEvent("orders:view", { detail: { id } }));
        return;
      }
      const eb = e.target.closest(".btn-edit");
      if (eb) {
        const id = eb.getAttribute("data-oid") || "";
        const phone = eb.getAttribute("data-phone") || "";
        const email = eb.getAttribute("data-email") || "";
        // If the modal exists, open it directly (keeps compat with your binder)
        const dlg = document.getElementById('orderEditModal');
        if (dlg) {
          const idEl = document.getElementById('oemOrderId');
          if (idEl) idEl.textContent = id;
          try { dlg.showModal(); } catch { dlg.open = true; }
        }
        // Also emit the event for any external save handler
        window.dispatchEvent(new CustomEvent("orders:edit", { detail: { id, phone, email } }));
      }
    });
  }

  // ----- data load -----
  async function fetchOnce() {
    // Use whichever function the adapter exposes
    const apiFn = Data?.orders && (Data.orders.list || Data.orders.get);
    if (typeof apiFn !== 'function') throw new Error('WattSunAdminData.orders.list/get not found');
    const result = await apiFn.call(Data.orders, { page: 1, per: 10000 });
    const orders = (result && (result.orders || result)) || [];
    State.raw = Array.isArray(orders) ? orders : [];
    State.page = 1;
    applyFilters(); renderRows(); renderPager();
  }

  function boot() {
    if (booted) return; // single-boot guard
    if (!ensureOrdersIds() || !$(SEL.table) || !$(SEL.tbody)) return; // wait until partial present
    booted = true;
    wire();
    fetchOnce().catch(err => console.error("[Orders] load failed:", err));
  }

  // Try now; if tbody not present yet, watch and boot once
  if (document.querySelector(SEL.tbody)) {
    boot();
  } else {
    const mo = new MutationObserver(() => { if (document.querySelector(SEL.tbody)) { mo.disconnect(); boot(); } });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // Also react to admin shell events the partial emits (support both keys)
  window.addEventListener("admin:partial-loaded", (e) => {
    const name = e?.detail?.partial || e?.detail?.name;
    if (name === "orders") boot();
  });

  // Manual hook for console or other scripts
  window.__WS_ORDERS_FORCE_BOOT = () => { booted = false; boot(); };

  // ----- lightweight viewer (unchanged) -----
function ensureViewDialog() {
  let dlg = document.getElementById("orderViewDialog");
  if (dlg) return dlg;

  dlg = document.createElement("dialog");
  dlg.id = "orderViewDialog";
  dlg.innerHTML = `
    <form method="dialog" class="ws-modal-card">
      <h3 class="ws-modal-title">Order</h3>
      <div class="content"></div>
      <div class="ws-actions">
        <button value="close" class="btn small">Close</button>
      </div>
    </form>`;
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

  // Expose minimal row refresh helper
  window.refreshOrderRow = function (id, patch = {}) {
    const idx = State.raw.findIndex(o => String(o.id) === String(id) || String(o.orderNumber) === String(id));
    if (idx === -1) return;
    State.raw[idx] = { ...State.raw[idx], ...patch };
    applyFilters(); renderRows(); renderPager();
  };
})();
