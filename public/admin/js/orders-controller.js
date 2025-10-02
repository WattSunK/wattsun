// public/admin/js/orders-controller.js
(function () {
  "use strict";
  const DEBUG = false;                        // flip to true when debugging
  const dbg = (...a) => { if (DEBUG) console.log("[orders-controller]", ...a); };

  const getData = () => window.WattSunAdminData;

  let booted = false;
  const State = {
    page: 1,
    pageSize: 10,
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
  
  // normalize cents-or-units-or-string into *cents* (integer) or null
  function toCentsMaybe(v) {
    if (v == null || v === "") return null;
    if (typeof v === "string") {
      const s = v.replace(/[^\d.,-]/g, "").replace(/,/g, "");
      if (!s) return null;
      const n = Number(s);
      if (!Number.isFinite(n)) return null;
      return n < 100000 ? Math.round(n * 100) : Math.round(n);
    }
    if (typeof v === "number") {
      return v < 100000 ? Math.round(v * 100) : Math.round(v);
    }
    return null;
  }

  function renderRows() {
    const tbody = document.getElementById("ordersTbody");
    if (!tbody) return;

    const rowsHtml = State.rows.map((o) => {
      const id     = o.orderNumber || o.id || "";
      const name   = o.fullName || o.name || o.customerName || o.customer || "—";
      const phone  = o.phone || o.customerPhone || o.contactPhone || "—";
      const when   = o.createdAt ? new Date(o.createdAt).toLocaleString() : "—";

      // --- totals (fallback aware) ---
      const totalCents = toCentsMaybe(o.totalCents) ?? toCentsMaybe(o.totalAmountCents);
      const total      = totalCents != null ? fmtMoney(totalCents, o.currency) : "—";

      const status = o.status || "Pending";

      // --- deposit (fallback aware) ---
      const depCents =
        toCentsMaybe(o.displayDepositCents) ??
        toCentsMaybe(o.depositCents) ??
        toCentsMaybe(o.depositAmountCents) ??
        toCentsMaybe(o.deposit);

      const deposit = depCents != null ? fmtMoney(depCents, o.currency) : "—";

      return `
        <tr data-id="${id}">
          <td data-col="order">${id}</td>
          <td data-col="customer">${name}</td>
          <td data-col="phone">${phone}</td>
          <td data-col="status">${status}</td>
          <td data-col="created">${when}</td>
          <td data-col="total">${total}</td>
          <td data-col="deposit">${deposit}</td>
          <td data-col="action" style="text-align:center;">
            <button type="button" class="btn btn-sm btn-view" data-oid="${id}">View</button>
            <button type="button" class="btn btn-sm btn-edit"
                    data-oid="${id}"
                    data-phone="${o.phone || ""}"
                    data-email="${o.email || ""}">Edit</button>
          </td>
        </tr>`;
    }).join("");

    tbody.innerHTML = rowsHtml || `<tr><td colspan="8" style="text-align:center;padding:12px;">No data yet</td></tr>`;
  }
 
  function renderPager() {
    const pager = document.getElementById("ordersPager");
    if (!pager) return;
    const pages = Math.max(1, Math.ceil(State.total / State.pageSize));
    pager.innerHTML = `
      <div class="pager">
        <button class="btn prev" ${State.page <= 1 ? "disabled" : ""} data-page="prev">Prev</button>
        <span class="pages">Page ${State.page} / ${pages}</span>
        <button class="btn next" ${State.page >= pages ? "disabled" : ""} data-page="next">Next</button>
      </div>`;
  }

  function applyFilters() {
    // For server-side filtering later; currently just re-renders local State.rows
    State.rows = [...State.raw];
    State.total = State.rows.length;
    State.page  = Math.min(State.page, Math.max(1, Math.ceil(State.total / State.pageSize)));
  }

  // --- Data fetch (server-side aware) ---
  async function fetchOrders() {
    const Data = getData();
    if (!Data || !Data.orders) {
      dbg("Data adapter not ready; will retry.");
      State.raw = [];
      return false;
    }

    const normalize = (res) => {
      if (!res) return [];
      if (Array.isArray(res)) return res;
      if (Array.isArray(res.orders)) return res.orders;
      if (Array.isArray(res.rows)) return res.rows;
      if (Array.isArray(res.data)) return res.data;
      return [];
    };

    const perEl = document.getElementById("ordersPer");
    const per = Number(perEl?.value || State.pageSize || 10);

    const resp = await Data.orders.list({ page: State.page, per, q:"", status:"", phone:"" });

    const rows = normalize(resp);
    State.raw = rows;
    State.rows = rows;
    State.total = Number(resp?.total ?? rows.length);
    State.pageSize = Number(resp?.per ?? per);

    dbg("fetched rows:", State.rows.length, "total:", State.total);
    return true;
  }

  async function boot() {
    if (booted) return;
    booted = true;
    dbg("boot");

    ensureTableHooks();

    $("#ordersSearch") && $("#ordersSearch").addEventListener("input",  (e) => { State.filter.q      = e.target.value; applyFilters(); renderRows(); renderPager(); });
    $("#ordersStatus") && $("#ordersStatus").addEventListener("change", (e) => { State.filter.status = e.target.value; applyFilters(); renderRows(); renderPager(); });
    $("#ordersPhone")  && $("#ordersPhone").addEventListener("input",   (e) => { State.filter.phone  = e.target.value; applyFilters(); renderRows(); renderPager(); });

    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".pager .btn");
      if (!btn) return;
      const dir = btn.getAttribute("data-page");
      if (dir === "prev" && State.page > 1) State.page--;
      if (dir === "next") {
        const pages = Math.max(1, Math.ceil(State.total / State.pageSize));
        if (State.page < pages) State.page++;
      }
      fetchOrders().then(() => { renderRows(); renderPager(); });
    }, { passive: true });

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

  window.addEventListener("admin:partial-loaded", (e) => {
    const name = e?.detail?.partial || e?.detail?.name;
    if (name === "orders") boot();
  });

  function isOrdersDomPresent() {
    return document.getElementById("ordersTable") || document.querySelector('table[data-role="orders-table"]');
  }
  document.addEventListener("DOMContentLoaded", () => {
    if (isOrdersDomPresent()) boot();
  });

  const oneShotMO = new MutationObserver(() => {
    if (!booted && isOrdersDomPresent()) {
      oneShotMO.disconnect();
      boot();
    }
  });
  oneShotMO.observe(document.body, { childList: true, subtree: true });

  window.__WS_ORDERS_FORCE_BOOT = () => { booted = false; boot(); };

  async function ensureModals() {
    if (document.getElementById("orderViewModal") && document.getElementById("orderEditModal")) return;
    try {
      const res = await fetch("/partials/orders-modal.html?v=20250915-03", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load orders-modal.html: ${res.status}`);
      const html = await res.text();
      const tpl  = document.createElement("template");
      tpl.innerHTML = html;
      document.body.appendChild(tpl.content);
      dbg("orders-modal injected");
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
    set("ov_fullName",    o.fullName || o.name || o.customerName || o.customer || "—");
    set("ov_phone",       o.phone || "—");
    set("ov_email",       o.email || "—");

    const totalCents = toCentsMaybe(o.totalCents) ?? toCentsMaybe(o.totalAmountCents);
    set("ov_total", totalCents != null ? fmtMoney(totalCents, o.currency) : "—");

    const depC =
      toCentsMaybe(o.displayDepositCents) ??
      toCentsMaybe(o.depositCents) ??
      toCentsMaybe(o.depositAmountCents) ??
      toCentsMaybe(o.deposit);

    set("ov_deposit", depC != null ? fmtMoney(depC, o.currency) : "—");

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
