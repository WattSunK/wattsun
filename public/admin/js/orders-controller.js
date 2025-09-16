// public/admin/js/orders-controller.js
(function () {
  "use strict";

  const getData = () => window.WattSunAdminData;

  let booted = false;
  const State = {
    page: 1,
    pageSize: 20,
    total: 0,
    rows: [],
    raw: [],
    filter: { q: "", status: "", phone: "" },
    sort:   { key: "createdAt", dir: "desc" },
  };

  const $    = (s, r = document) => r.querySelector(s);

  function fmtMoney(cents, currency) {
    if (!Number.isFinite(cents)) return "—";
    const v = cents / 100;
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "KES", maximumFractionDigits: 2 }).format(v);
    } catch { return `${currency || "KES"} ${v.toFixed(2)}`; }
  }
  const fmtDT = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return iso || "—"; } };

  function ensureTableHooks() {
    const table = document.querySelector('table[data-role="orders-table"]') || document.getElementById("ordersTable");
    const tbody = (table && table.tBodies && table.tBodies[0]) ? table.tBodies[0] : document.getElementById("ordersTbody");
    if (table && !table.id) table.id = "ordersTable";
    if (tbody && !tbody.id) tbody.id = "ordersTbody";
  }

  function renderRows() {
  const tbody = $(SEL.tbody); if (!tbody) return;

  const start = (State.page - 1) * State.per;
  const end   = start + State.per;

  const rows = State.view.slice(start, end).map(o => {
    const id      = o.orderNumber || o.id || "";
    const name    = o.fullName || "—";
    const phone   = o.phone || o.customerPhone || o.contactPhone || "—";
    const when    = o.createdAt ? new Date(o.createdAt).toLocaleString() : "—";
    const total   = fmtMoney(o.totalCents, o.currency);
    const status  = o.status || "Pending";

    // accept several possible deposit shapes
    const depositCents =
      [o.depositCents, o.deposit_cents, o.depositAmountCents, o.deposit]
        .find(v => Number.isFinite(v));
    const deposit = Number.isFinite(depositCents) ? fmtMoney(depositCents, o.currency) : "—";

    return `
      <tr data-oid="${id}">
        <td data-col="order">${id}</td>
        <td data-col="customer">${name}</td>
        <td data-col="phone">${phone}</td>
        <td data-col="status">${status}</td>
        <td data-col="created">${when}</td>
        <td data-col="total">${total}</td>
        <td data-col="deposit">${deposit}</td>
        <td data-col="action" style="text-align:center;">
          <button type="button" class="btn btn-sm btn-view" data-oid="${id}">View</button>
          <button type="button" class="btn btn-sm btn-edit" data-action="edit-order" data-oid="${id}" data-phone="${o.phone || ""}" data-email="${o.email || ""}">Edit</button>
        </td>
      </tr>`;
  }).join("");

  // header now has 8 columns
  tbody.innerHTML = rows || `<tr><td colspan="8" style="text-align:center;padding:12px;">No data yet</td></tr>`;
}


  function renderPager() {
    const pager = document.getElementById("ordersPager");
    if (!pager) return;
    const pages = Math.max(1, Math.ceil(State.rows.length / State.pageSize));
    pager.innerHTML = `
      <div class="pager">
        <button class="btn prev" ${State.page <= 1 ? "disabled" : ""} data-page="prev">Prev</button>
        <span class="pages">Page ${State.page} / ${pages}</span>
        <button class="btn next" ${State.page >= pages ? "disabled" : ""} data-page="next">Next</button>
      </div>`;
  }

  function applyFilters() {
    const q = (State.filter.q || "").toLowerCase().trim();
    const status = (State.filter.status || "").toLowerCase().trim();
    const phone  = (State.filter.phone  || "").replace(/\D+/g, "");
    let rows = [...State.raw];

    if (q) rows = rows.filter(o =>
      String(o.orderNumber || o.id).toLowerCase().includes(q)
      || (o.fullName || "").toLowerCase().includes(q)
      || (o.email || "").toLowerCase().includes(q)
    );
    if (status) rows = rows.filter(o => (o.status || "").toLowerCase() === status);
    if (phone)  rows = rows.filter(o => (o.phone  || "").replace(/\D+/g, "").endsWith(phone));

    const { key, dir } = State.sort;
    rows.sort((a, b) => {
      const av = a[key], bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av > bv) return dir === "asc" ? 1 : -1;
      if (av < bv) return dir === "asc" ? -1 : 1;
      return 0;
    });

    State.rows = rows;
    State.total = rows.length;
    State.page  = Math.min(State.page, Math.max(1, Math.ceil(State.total / State.pageSize)));
  }

  // --- Data fetch (robust: supports `orders` or `rows`, with pagination) ---
async function fetchOrders() {
  const Data = getData();
  if (!Data || !Data.orders) {
    console.debug("[orders-controller] Data adapter not ready; will retry.");
    State.raw = [];
    return false;
  }

  // Helper: normalize one response into an array of orders
  const normalize = (res) => {
    if (!res) return [];
    if (Array.isArray(res)) return res;                // plain array
    if (Array.isArray(res.rows)) return res.rows;      // { rows: [...] }
    if (Array.isArray(res.orders)) return res.orders;  // { orders: [...] }
    if (Array.isArray(res.data)) return res.data;      // { data: [...] }
    return [];
  };

  // Request as much as the adapter allows in one go
  const PER = 200;           // safe upper bound; adjust if your API supports more/less
  const HAS_LIST = typeof Data.orders.list === "function";
  const HAS_GET  = typeof Data.orders.get  === "function";

  let all = [];

  if (HAS_LIST) {
    // First page
    let page = 1;
    let per  = PER;

    const first = await Data.orders.list({ page, per, q: "", status: "", phone: "" });
    let rows    = normalize(first);
    all.push(...rows);

    // If the adapter reports totals, keep paging until we have them all
    const total = Number(first?.total ?? rows.length);
    const perFromApi = Number(first?.per ?? per);
    const pages = Math.max(1, Math.ceil(total / (perFromApi || PER)));

    for (page = 2; page <= pages; page++) {
      const resp = await Data.orders.list({ page, per: perFromApi || PER, q: "", status: "", phone: "" });
      all.push(...normalize(resp));
    }
  } else if (HAS_GET) {
    // Fallback API that returns everything
    const res = await Data.orders.get();
    all = normalize(res);
  } else {
    console.warn("[orders-controller] No Data.orders.list/get available");
  }

  State.raw = all;
  console.debug("[orders-controller] fetched rows:", State.raw.length);
  return true;
}

  async function boot() {
    if (booted) return;
    booted = true;
    console.debug("[orders-controller] boot");

    ensureTableHooks();

    // Filters
    $("#ordersSearch") && $("#ordersSearch").addEventListener("input",  (e) => { State.filter.q      = e.target.value; applyFilters(); renderRows(); renderPager(); });
    $("#ordersStatus") && $("#ordersStatus").addEventListener("change", (e) => { State.filter.status = e.target.value; applyFilters(); renderRows(); renderPager(); });
    $("#ordersPhone")  && $("#ordersPhone").addEventListener("input",   (e) => { State.filter.phone  = e.target.value; applyFilters(); renderRows(); renderPager(); });

    // Pager clicks
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".pager .btn");
      if (!btn) return;
      const dir = btn.getAttribute("data-page");
      if (dir === "prev" && State.page > 1) State.page--;
      if (dir === "next") {
        const pages = Math.max(1, Math.ceil(State.rows.length / State.pageSize));
        if (State.page < pages) State.page++;
      }
      renderRows(); renderPager();
    }, { passive: true });

    // Actions → events
    document.addEventListener("click", (e) => {
      const viewBtn = e.target.closest(".btn-view[data-oid]");
      if (viewBtn) {
        const id = viewBtn.getAttribute("data-oid");
        window.dispatchEvent(new CustomEvent("orders:view", { detail: { id } }));
        return;
      }
      const editBtn = e.target.closest(".btn-edit[data-oid]");
      if (editBtn) {
        const id    = editBtn.getAttribute("data-oid");
        const phone = editBtn.getAttribute("data-phone") || "";
        const email = editBtn.getAttribute("data-email") || "";
        window.dispatchEvent(new CustomEvent("orders:edit", { detail: { id, phone, email } }));
        return;
      }
    });

    const ok = await fetchOrders();
    if (!ok) {
      // retry once the adapter appears (lightweight, one-shot)
      const waitData = setInterval(async () => {
        if (getData() && getData().orders) {
          clearInterval(waitData);
          await fetchOrders();
          applyFilters(); renderRows(); renderPager();
        }
      }, 200);
      return;
    }
    applyFilters(); renderRows(); renderPager();
  }

  // ---------- Robust triggers (three small ones) ----------
  // A) Admin partial load (primary path)
  window.addEventListener("admin:partial-loaded", (e) => {
    const name = e?.detail?.partial || e?.detail?.name;
    if (name === "orders") boot();
  });

  // B) If Orders DOM is already on the page when scripts load
  function isOrdersDomPresent() {
    return document.getElementById("ordersTable") || document.querySelector('table[data-role="orders-table"]');
  }
  document.addEventListener("DOMContentLoaded", () => {
    if (isOrdersDomPresent()) boot();
  });

  // C) One-shot observer: boot the first time the Orders table is inserted
  const oneShotMO = new MutationObserver(() => {
    if (!booted && isOrdersDomPresent()) {
      oneShotMO.disconnect();
      boot();
    }
  });
  oneShotMO.observe(document.body, { childList: true, subtree: true });

  // Manual helper
  window.__WS_ORDERS_FORCE_BOOT = () => { booted = false; boot(); };

  // ===== VIEW (lazy-injected partial) =====
  async function ensureModals() {
    if (document.getElementById("orderViewModal") && document.getElementById("orderEditModal")) return;
    try {
      const res = await fetch("/partials/orders-modal.html?v=20250915-03", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load orders-modal.html: ${res.status}`);
      const html = await res.text();
      const tpl  = document.createElement("template");
      tpl.innerHTML = html;
      document.body.appendChild(tpl.content);
      console.debug("[orders-controller] orders-modal injected");
    } catch (err) {
      console.error("[orders-controller] modal injection failed:", err);
    }
  }

  async function openViewModalWithData(o) {
    await ensureModals();
    const dlg = document.getElementById("orderViewModal");
    if (!dlg) { console.warn("[Orders] #orderViewModal not found after ensure"); return; }
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

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("#orderViewModal button, #orderViewModal [data-close]");
    if (!btn) return;
    const wantsClose = btn.hasAttribute("data-close") || /close/i.test((btn.textContent || "").trim());
    if (!wantsClose) return;
    e.preventDefault();
    const dlg = document.getElementById("orderViewModal");
    if (!dlg) return;
    try { dlg.close(); } catch { dlg.removeAttribute("open"); }
  });
})();
