// public/admin/js/orders-controller.js
// Admin Orders: client-side search, status filter & pagination.
// View button uses lightweight dialog (items if provided by API).
// Edit button is bound elsewhere (orders-edit.js binder). This file only renders rows.

(function () {
  "use strict";
  if (!window.WattSunAdminData) {
    console.warn("[OrdersController] WattSunAdminData missing");
    return;
  }
  const Data = window.WattSunAdminData;

  const SEL = {
    table: "#ordersTable",
    tbody: "#ordersTbody",
    pager: "#ordersPager",
    search: "#ordersSearch",
    filter: "#ordersStatus",
    viewDialog: "#viewOrderDialog",
    viewClose: "#viewOrderClose",
    viewContent: "#viewOrderContent",
  };

  const $ = (s, r = document) => r.querySelector(s);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
  const debounce = (fn, ms) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };

  const State = { raw: [], view: [], page: 1, per: 10, q: "", status: "" };

  // Step 6.5: freshness guard (additive only)
  const ORDERS_DIRTY_KEY = 'ordersUpdatedAt';
  const ORDERS_LAST_RENDERED_KEY = 'ordersLastRenderedAt';
  async function ensureFreshOrders(loadFn) {
    try {
      const dirtyAt = Number(localStorage.getItem(ORDERS_DIRTY_KEY) || '0');
      const lastAt  = Number(localStorage.getItem(ORDERS_LAST_RENDERED_KEY) || '0');
      if (dirtyAt > lastAt && typeof loadFn === 'function') {
        await loadFn();
        localStorage.setItem(ORDERS_LAST_RENDERED_KEY, String(dirtyAt));
      }
    } catch (e) { console.warn('[Orders] ensureFreshOrders failed', e); }
  }

  function applyFilters() {
    const q = (State.q || "").toLowerCase();
    const s = State.status || "";
    State.view = State.raw.filter((o) => {
      const matchesQ =
        !q ||
        String(o.id || "").toLowerCase().includes(q) ||
        String(o.fullName || "").toLowerCase().includes(q) ||
        String(o.phone || "").toLowerCase().includes(q) ||
        String(o.email || "").toLowerCase().includes(q);
      const matchesS = !s || (o.status || "").toLowerCase() === s.toLowerCase();
      return matchesQ && matchesS;
    });
  }

  function fmtKES(n) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "KES",
        maximumFractionDigits: 0,
      }).format(n || 0);
    } catch {
      return "KSH " + (n || 0).toLocaleString();
    }
  }

  function renderRows() {
    const tbody = $(SEL.tbody);
    if (!tbody) return;

    const start = (State.page - 1) * State.per;
    const rows = State.view.slice(start, start + State.per)
      .map((o) => {
        const totalKES = fmtKES(o.total || 0);
        const placed = o.createdAt ? new Date(o.createdAt).toLocaleString() : "—";
        return `
          <tr>
            <td>${o.id || ""}</td>
            <td>${o.fullName || ""}</td>
            <td>${o.phone || ""}</td>
            <td>${o.email || ""}</td>
            <td>${o.status || "Pending"}</td>
            <td>${totalKES}</td>
            <td>${placed}</td>
            <td>
              <button class="btn btn-sm btn-secondary btn-view" data-oid="${o.id}">View</button>
              <button class="btn btn-sm btn-primary btn-edit" data-order-id="${o.id}" data-phone="${o.phone || ""}" data-email="${o.email || ""}">Edit</button>
            </td>
          </tr>
        `;
      })
      .join("");

    tbody.innerHTML =
      rows ||
      `<tr><td colspan="8" style="text-align:center;color:#888;">No orders</td></tr>`;
  }

  function renderPager() {
    const pager = $(SEL.pager);
    if (!pager) return;

    const pages = Math.max(1, Math.ceil(State.view.length / State.per));
    const cur = Math.min(State.page, pages);

    const btn = (p, label = p, disabled = false, active = false) =>
      `<button class="btn btn-sm ${active ? "btn-primary" : "btn-light"}" data-page="${p}" ${disabled ? "disabled" : ""}>${label}</button>`;

    pager.innerHTML = [
      btn(1, "&laquo;", cur === 1),
      btn(Math.max(1, cur - 1), "&lsaquo;", cur === 1),
      ...Array.from({ length: pages }, (_, i) => btn(i + 1, i + 1, false, i + 1 === cur)),
      btn(Math.min(pages, cur + 1), "&rsaquo;", cur === pages),
      btn(pages, "&raquo;", cur === pages),
    ].join("");

    pager.querySelectorAll("button[data-page]").forEach((b) => {
      on(b, "click", () => {
        State.page = Number(b.getAttribute("data-page")) || 1;
        renderRows();
        renderPager();
      });
    });
  }

  function wire() {
    const search = $(SEL.search);
    const filter = $(SEL.filter);

    on(search, "input", debounce((e) => {
      State.q = e.target.value || "";
      State.page = 1;
      applyFilters();
      renderRows();
      renderPager();
    }, 150));

    on(filter, "change", (e) => {
      State.status = e.target.value || "";
      State.page = 1;
      applyFilters();
      renderRows();
      renderPager();
    });

    // delegate edit buttons (consumed by orders-edit.js)
    document.addEventListener("click", (e) => {
      const b = e.target.closest(".btn-edit");
      if (b) {
        const id = b.getAttribute("data-order-id");
        const phone = b.getAttribute("data-phone") || "";
        const email = b.getAttribute("data-email") || "";
        window.dispatchEvent(new CustomEvent("orders:edit", { detail: { id, phone, email } }));
      }
    });

    // native view handler (optional)
    document.addEventListener("click", (e) => {
      const b = e.target.closest(".btn-view");
      if (b) {
        const id = b.getAttribute("data-oid");
        window.dispatchEvent(new CustomEvent("orders:view", { detail: { id } }));
      }
    });
  }

  // Normalize server row -> UI row (ensure id always present)
  function normalizeRow(o) {
    const id = o.orderNumber || o.id || null;
    const total = (o.totalCents != null) ? (o.totalCents / 100) :
                  (typeof o.total === "number" ? o.total : null);
    const deposit = (o.depositCents != null) ? (o.depositCents / 100) :
                    (typeof o.deposit === "number" ? o.deposit : null);
    return {
      id,
      fullName: o.fullName || o.customerName || o.name || "",
      phone: o.phone || "",
      email: o.email || "",
      status: o.status || "Pending",
      total: total || 0,
      deposit: deposit || 0,
      currency: o.currency || "KES",
      createdAt: o.createdAt || o.placedAt || o.created_at || null,
      items: o.items || [],
      _raw: o
    };
  }

  async function fetchOnce() {
    const { orders } = await Data.orders.get({ page: 1, per: 10000 });
    const list = Array.isArray(orders) ? orders : [];
    State.raw = list.map(normalizeRow);

    State.page = 1;
    applyFilters();
    renderRows();
    renderPager();

    // Step 6.5: record last render watermark
    try {
      const dirty = localStorage.getItem(ORDERS_DIRTY_KEY);
      localStorage.setItem(ORDERS_LAST_RENDERED_KEY, dirty || String(Date.now()));
    } catch (e) {}
  }

  function auto() {
    if (!document.querySelector(SEL.table) || !document.querySelector(SEL.tbody))
      return;

    // Step 6.5: re-fetch once if list is dirty
    ensureFreshOrders(fetchOnce);

    wire();
    fetchOnce().catch((err) => console.error("[Orders] load failed:", err));

    ensureViewModal();
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", auto);
  else auto();

  window.addEventListener("admin:partial-loaded", (e) => {
    if (e?.detail?.name === "orders") auto();
  });

  // Step 6.5: refresh triggers
  window.addEventListener('orders:dirty', () => ensureFreshOrders(fetchOnce));
  window.addEventListener('storage', (e) => {
    if (e.key === ORDERS_DIRTY_KEY) ensureFreshOrders(fetchOnce);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') ensureFreshOrders(fetchOnce);
  });

  // Lightweight view dialog (pure client side, items optional)
  function ensureViewModal() {
    const dlg = $(SEL.viewDialog);
    const c = $(SEL.viewContent);
    const close = $(SEL.viewClose);
    if (!dlg || !c) return;

    window.addEventListener("orders:view", (ev) => {
      const id = ev?.detail?.id;
      if (!id) return;
      const o = State.raw.find((r) => String(r.id) === String(id));
      if (!o) return;

      function fmtKESdlg(n) {
        try {
          return new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: "KES",
          }).format(n || 0);
        } catch {
          return "KSH " + (n || 0).toLocaleString();
        }
      }

      c.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div><strong>Order #</strong><div>${o.id || "—"}</div></div>
        <div><strong>Status</strong><div>${o.status || "Pending"}</div></div>
        <div><strong>Customer</strong><div>${o.fullName || "—"}</div></div>
        <div><strong>Phone</strong><div>${o.phone || "—"}</div></div>
        <div><strong>Email</strong><div>${o.email || "—"}</div></div>
        <div><strong>Placed</strong><div>${
          o.createdAt ? new Date(o.createdAt).toLocaleString() : "—"
        }</div></div>
        <div><strong>Total</strong><div>${fmtKESdlg(o.total || 0)}</div></div>
      </div>
      <h4 style="margin:14px 0 6px;">Items</h4>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr><th>SKU</th><th>Name</th><th>Qty</th><th>Price</th></tr></thead>
        <tbody>${
          (o.items || [])
            .map(
              (it) =>
                `<tr><td>${it.sku || ""}</td><td>${it.name || ""}</td><td>${it.qty || ""}</td><td>${fmtKESdlg(
                  it.price || 0
                )}</td></tr>`
            )
            .join("") || `<tr><td colspan="4" style="text-align:center;color:#777;">No items</td></tr>`
        }</tbody>
      </table>
      `;

      dlg.setAttribute("open", "true");
    });

    on(close, "click", () => dlg.removeAttribute("open"));
  }

  // Expose tiny hook so the edit dialog can update a row and re-render
  window.refreshOrderRow = function (id, patch = {}) {
    const idx = State.raw.findIndex((o) => String(o.id) === String(id));
    if (idx === -1) return;
    State.raw[idx] = { ...State.raw[idx], ...patch };
    applyFilters();
    renderRows();
    renderPager();
  };
})();
