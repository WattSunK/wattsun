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

  const State = {
    raw: [],
    filtered: [],
    page: 1,
    per: 20,
    q: "",
    status: "All",
  };

  function $(sel) {
    return document.querySelector(sel);
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
    const rows = State.filtered.slice(start, start + State.per);
    tbody.innerHTML = rows
      .map((o) => {
        const totalKES = fmtKES(o.total || 0);
        const placed =
          o.createdAt ? new Date(o.createdAt).toLocaleString() : "—";
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
  }

  function renderPager() {
    const pager = $(SEL.pager);
    if (!pager) return;
    const pages = Math.max(1, Math.ceil(State.filtered.length / State.per));
    const cur = Math.min(State.page, pages);

    const btn = (p, label = p, disabled = false, active = false) =>
      `<button class="btn btn-sm ${
        active ? "btn-primary" : "btn-light"
      }" data-page="${p}" ${disabled ? "disabled" : ""}>${label}</button>`;

    pager.innerHTML = [
      btn(1, "&laquo;", cur === 1),
      btn(Math.max(1, cur - 1), "&lsaquo;", cur === 1),
      ...Array.from({ length: pages }, (_, i) => btn(i + 1, i + 1, false, i + 1 === cur)),
      btn(Math.min(pages, cur + 1), "&rsaquo;", cur === pages),
      btn(pages, "&raquo;", cur === pages),
    ].join("");

    pager.querySelectorAll("button[data-page]").forEach((b) => {
      b.addEventListener("click", () => {
        State.page = Number(b.getAttribute("data-page")) || 1;
        renderRows();
        renderPager();
      });
    });
  }

  function applyFilters() {
    const q = (State.q || "").toLowerCase();
    const s = State.status || "All";
    State.filtered = State.raw.filter((o) => {
      const matchesQ =
        !q ||
        String(o.id || "")
          .toLowerCase()
          .includes(q) ||
        String(o.fullName || "")
          .toLowerCase()
          .includes(q) ||
        String(o.phone || "")
          .toLowerCase()
          .includes(q) ||
        String(o.email || "")
          .toLowerCase()
          .includes(q);
      const matchesS = s === "All" || (o.status || "Pending") === s;
      return matchesQ && matchesS;
    });
  }

  function wire() {
    const search = $(SEL.search);
    const filter = $(SEL.filter);

    if (search) {
      search.addEventListener("input", (e) => {
        State.q = e.target.value || "";
        State.page = 1;
        applyFilters();
        renderRows();
        renderPager();
      });
    }

    if (filter) {
      filter.addEventListener("change", (e) => {
        State.status = e.target.value || "All";
        State.page = 1;
        applyFilters();
        renderRows();
        renderPager();
      });
    }

    // delegate edit buttons (emit event consumed by orders-edit.js)
    document.addEventListener("click", (e) => {
      const b = e.target.closest(".btn-edit");
      if (b) {
        const id = b.getAttribute("data-order-id");
        const phone = b.getAttribute("data-phone") || "";
        const email = b.getAttribute("data-email") || "";
        // fallback dispatch for other listeners (optional)
        window.dispatchEvent(new CustomEvent("orders:edit", { detail: { id, phone, email } }));
      }
    });

    // native view handler
      document.addEventListener("click", (e) => {
        const b = e.target.closest(".btn-view");
        if (b) {
          const id = b.getAttribute("data-oid");
          window.dispatchEvent(new CustomEvent("orders:view", { detail: { id } }));
        }
      });
    }

  async function fetchOnce() {
    // Fetch many and paginate client-side for now (fastest minimal change)
    const { orders } = await Data.orders.get({ page: 1, per: 10000 });
    State.raw = Array.isArray(orders) ? orders : [];
    // --- Probe: capture list response snapshot (analysis-only) ---
    try {
      window.__ordersProbe = window.__ordersProbe || [];
      const snapshot = {
        ts: Date.now(),
        source: 'admin/orders fetch',
        orders: (orders || []).map(o => ({
          id: o.orderNumber || o.id || null,
          status: o.status ?? null,
          total: (o.totalCents != null ? o.totalCents : (o.total != null ? Math.round(o.total*100) : null)),
          deposit: (o.depositCents != null ? o.depositCents : (o.deposit != null ? Math.round(o.deposit*100) : null)),
          currency: o.currency ?? null
        }))
      };
      window.__ordersProbe.push(snapshot);
      // eslint-disable-next-line no-console
      console.log('[orders-probe]', snapshot);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[orders-probe] failed to snapshot', e);
    }
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

  // Lightweight view dialog (pure client side, items optional)
  (function setupViewDialog() {
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

    if (close) {
      close.addEventListener("click", () => dlg.removeAttribute("open"));
    }
  })();

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
