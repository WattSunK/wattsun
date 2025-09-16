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

  // ------------ Local state ------------
  let booted = false;
  const State = {
    page: 1,
    pageSize: 20,
    total: 0,
    rows: [],
    raw: [],
    filter: {
      q: "",
      status: "",
      phone: "",
    },
    sort: {
      key: "createdAt",
      dir: "desc",
    },
  };

  // ------------ Utilities ------------
  function $(sel, root = document) { return root.querySelector(sel); }
  function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  function fmtMoney(cents, currency) {
    if (!Number.isFinite(cents)) return "—";
    const v = (cents / 100);
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currency || "KES",
        maximumFractionDigits: 2
      }).format(v);
    } catch {
      return `${currency || "KES"} ${v.toFixed(2)}`;
    }
  }

  function coerceInt(v, d = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
    }

  // ------------ DOM wiring helpers ------------
  function ensureTableHooks() {
    // Allow using the controller without editing HTML:
    // if table IDs are missing, assign at runtime.
    const table = document.querySelector('table[data-role="orders-table"]') || document.getElementById("ordersTable");
    const tbody = (table && table.tBodies && table.tBodies[0]) ? table.tBodies[0] : document.getElementById("ordersTbody");
    if (table && !table.id) table.id = "ordersTable";
    if (tbody && !tbody.id) tbody.id = "ordersTbody";
  }

  // ------------ Rendering ------------
  function renderRows() {
    const tbody = document.getElementById("ordersTbody");
    if (!tbody) return;

    const pageStart = (State.page - 1) * State.pageSize;
    const pageEnd = pageStart + State.pageSize;
    const slice = State.rows.slice(pageStart, pageEnd);

    const html = slice.map((o) => {
      const id = o.orderNumber || o.id;
      const created = o.createdAt ? new Date(o.createdAt).toLocaleString() : "—";
      const total = fmtMoney(o.totalCents, o.currency);
      const deposit = fmtMoney(o.depositCents, o.currency);
      return `
        <tr data-id="${id}">
          <td>${id}</td>
          <td>${o.fullName || "—"}</td>
          <td>${o.phone || "—"}</td>
          <td>${o.status || "Pending"}</td>
          <td>${created}</td>
          <td class="num">${total}</td>
          <td class="num">${deposit}</td>
          <td class="actions">
            <button class="btn btn-sm btn-view" data-oid="${id}">View</button>
            <button class="btn btn-sm btn-edit" data-oid="${id}" data-phone="${o.phone || ""}" data-email="${o.email || ""}">Edit</button>
          </td>
        </tr>
      `;
    }).join("");

    tbody.innerHTML = html || `<tr><td colspan="8" class="muted" style="text-align:center;">No orders</td></tr>`;
  }

  function renderPager() {
    const totalPages = Math.max(1, Math.ceil(State.rows.length / State.pageSize));
    const pager = document.getElementById("ordersPager");
    if (!pager) return;

    pager.innerHTML = `
      <div class="pager">
        <button class="btn prev" ${State.page <= 1 ? "disabled" : ""} data-page="prev">Prev</button>
        <span class="pages">Page ${State.page} / ${totalPages}</span>
        <button class="btn next" ${State.page >= totalPages ? "disabled" : ""} data-page="next">Next</button>
      </div>
    `;
  }

  function applyFilters() {
    const q = (State.filter.q || "").toLowerCase().trim();
    const status = (State.filter.status || "").toLowerCase().trim();
    const phone = (State.filter.phone || "").replace(/\D+/g, "");

    let rows = [...State.raw];

    if (q) {
      rows = rows.filter(o => {
        return String(o.orderNumber || o.id).toLowerCase().includes(q)
          || (o.fullName || "").toLowerCase().includes(q)
          || (o.email || "").toLowerCase().includes(q);
      });
    }
    if (status) rows = rows.filter(o => (o.status || "").toLowerCase() === status);
    if (phone)  rows = rows.filter(o => (o.phone || "").replace(/\D+/g, "").endsWith(phone));

    // sort
    const { key, dir } = State.sort;
    rows.sort((a, b) => {
      const av = a[key]; const bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av > bv) return dir === "asc" ? 1 : -1;
      if (av < bv) return dir === "asc" ? -1 : 1;
      return 0;
    });

    State.rows = rows;
    State.total = rows.length;
    State.page = Math.min(State.page, Math.max(1, Math.ceil(State.total / State.pageSize)));
  }

  // ------------ Data fetch ------------
  async function fetchOrders() {
    // Try robust adapter path first
    if (Data.orders && typeof Data.orders.list === "function") {
      const res = await Data.orders.list();
      State.raw = Array.isArray(res?.rows) ? res.rows : (Array.isArray(res) ? res : []);
      return;
    }
    // Fallback
    if (Data.orders && typeof Data.orders.get === "function") {
      const res = await Data.orders.get();
      State.raw = Array.isArray(res?.rows) ? res.rows : (Array.isArray(res) ? res : []);
      return;
    }
    console.warn("[OrdersController] No Data.orders.list/get available");
    State.raw = [];
  }

  // ------------ Boot ------------
  async function boot() {
    if (booted) return;
    booted = true;

    ensureTableHooks();

    // Filters
    const qInput = document.getElementById("ordersSearch");
    const statusSel = document.getElementById("ordersStatus");
    const phoneInput = document.getElementById("ordersPhone");

    qInput && qInput.addEventListener("input", (e) => {
      State.filter.q = e.target.value;
      applyFilters(); renderRows(); renderPager();
    });
    statusSel && statusSel.addEventListener("change", (e) => {
      State.filter.status = e.target.value;
      applyFilters(); renderRows(); renderPager();
    });
    phoneInput && phoneInput.addEventListener("input", (e) => {
      State.filter.phone = e.target.value;
      applyFilters(); renderRows(); renderPager();
    });

    // Pager clicks
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".pager .btn");
      if (!btn) return;
      const dir = btn.getAttribute("data-page");
      if (dir === "prev" && State.page > 1) State.page--;
      if (dir === "next") {
        const totalPages = Math.max(1, Math.ceil(State.rows.length / State.pageSize));
        if (State.page < totalPages) State.page++;
      }
      renderRows(); renderPager();
    }, { passive: true });

    // Table actions (View/Edit)
    document.addEventListener("click", (e) => {
      const viewBtn = e.target.closest(".btn-view[data-oid]");
      if (viewBtn) {
        const id = viewBtn.getAttribute("data-oid");
        window.dispatchEvent(new CustomEvent("orders:view", { detail: { id } }));
        return;
      }
      const editBtn = e.target.closest(".btn-edit[data-oid]");
      if (editBtn) {
        const id = editBtn.getAttribute("data-oid");
        const phone = editBtn.getAttribute("data-phone") || "";
        const email = editBtn.getAttribute("data-email") || "";
        window.dispatchEvent(new CustomEvent("orders:edit", { detail: { id, phone, email } }));
        return;
      }
    });

    await fetchOrders();
    applyFilters(); renderRows(); renderPager();

    // Auto-reboot if Orders partial loads later (defensive)
    const mo = new MutationObserver((muts, o) => {
      if (document.getElementById("ordersTable")) { o.disconnect(); boot(); }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  window.addEventListener("admin:partial-loaded", (e) => {
    const name = e?.detail?.partial || e?.detail?.name;
    if (name === "orders") boot();
  });

  window.__WS_ORDERS_FORCE_BOOT = () => { booted = false; boot(); };

  // ===== VIEW HANDLER (uses modern #orderViewModal) =====

  // lazy-load the orders modal partial if needed
  async function ensureModals() {
    if (document.getElementById("orderViewModal") && document.getElementById("orderEditModal")) return;
    try {
      const res = await fetch("/partials/orders-modal.html?v=20250915-01", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load orders-modal.html: ${res.status}`);
      const html = await res.text();
      const tpl = document.createElement("template");
      tpl.innerHTML = html;
      document.body.appendChild(tpl.content);
      console.debug("[orders-controller] orders-modal injected");
    } catch (err) {
      console.error("[orders-controller] modal injection failed:", err);
    }
  }

  function fmtDT(iso) {
    try { return new Date(iso).toLocaleString(); } catch { return iso || "—"; }
  }

  async function openViewModalWithData(o) {
    await ensureModals();
    const dlg = document.getElementById("orderViewModal");
    if (!dlg) { console.warn("[Orders] #orderViewModal not found after ensure"); return; }

    // map to IDs that exist in orders-modal.html
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = (val ?? "—"); };

    set("ov_orderNumber", o.orderNumber || o.id || "—");
    set("ov_status",      o.status || "Pending");
    set("ov_createdAt",   o.createdAt ? fmtDT(o.createdAt) : "—");
    set("ov_address",     o.address || o.shippingAddress || "—");

    set("ov_fullName",    o.fullName || "—");
    set("ov_phone",       o.phone || "—");
    set("ov_email",       o.email || "—");

    set("ov_total",       fmtMoney(o.totalCents, o.currency));
    set("ov_deposit",     fmtMoney(o.depositCents, o.currency));
    set("ov_currency",    o.currency || "—");

    // Items → tbody#ov_items with columns: Qty | Name | Line Total
    const body = document.getElementById("ov_items");
    if (body) {
      const rows = (o.items || []).map(it => {
        const qty = Number.isFinite(it.qty) ? it.qty : (it.quantity ?? 1);
        const lineTotalCents =
          Number.isFinite(it.lineTotalCents) ? it.lineTotalCents :
          Number.isFinite(it.totalCents)     ? it.totalCents     :
          (Number(qty) * (it.priceCents ?? 0));
        return `<tr>
          <td class="num">${qty}</td>
          <td>${it.name || it.sku || "—"}</td>
          <td class="num">${fmtMoney(lineTotalCents, o.currency)}</td>
        </tr>`;
      }).join("");
      body.innerHTML = rows || `<tr><td colspan="3" style="text-align:center;">No items</td></tr>`;
    }

    try { dlg.showModal(); } catch { dlg.setAttribute("open", "true"); }
  }

  window.addEventListener("orders:view", (e) => {
    const id = e.detail?.id;
    const o = State.raw.find(x => String(x.id) === String(id) || String(x.orderNumber) === String(id));
    if (!o) return;
    openViewModalWithData(o);
  });

  // Expose minimal row refresh helper
  window.refreshOrderRow = function (id, patch = {}) {
    const idx = State.raw.findIndex(o => String(o.id) === String(id) || String(o.orderNumber) === String(id));
    if (idx === -1) return;
    State.raw[idx] = { ...State.raw[idx], ...patch };
    applyFilters(); renderRows(); renderPager();
  };

  // --- Close handling for the View dialog (generic) ---
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("#orderViewModal button, #orderViewModal [data-close]");
    if (!btn) return;

    const wantsClose =
      btn.hasAttribute("data-close") ||
      /close/i.test((btn.textContent || "").trim());

    if (!wantsClose) return;

    e.preventDefault();
    const dlg = document.getElementById("orderViewModal");
    if (!dlg) return;
    try { dlg.close(); } catch { dlg.removeAttribute("open"); }
  });
})();
