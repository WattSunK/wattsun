// public/admin/js/data-adapter.js
// Compatibility layer for Admin data fetching + normalization.
// Keeps HTML/CSS intact; controllers read from here.
(function (global) {
  "use strict";
  const DEFAULTS = { apiBase: "", per: 10, timeoutMs: 15000 };

  // ---------- utils ----------
  function toInt(n, f=0){ const x = parseInt(n,10); return Number.isFinite(x)?x:f; }
  function toNum(n, f=0){ const x = Number(n); return Number.isFinite(x)?x:f; }

  function parseKES(input){
    if (typeof input === "number") return input;
    if (input == null) return 0;
    const s = String(input)
      .replace(/kes|ksh|kshs|sh|/=gi, "")
      .replace(/[^\d.,-]/g,"")
      .replace(/,/g,"");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }

  function fmtKES(v){
    try { return new Intl.NumberFormat(undefined,{style:"currency",currency:"KES",maximumFractionDigits:0}).format(v||0); }
    catch { return "KSH " + (v||0).toLocaleString(); }
  }

  function toISO(d){
    if(!d) return null;
    const t = new Date(d);
    return Number.isNaN(+t) ? null : t.toISOString();
  }

  async function fetchJSON(url, opts={}, timeoutMs=DEFAULTS.timeoutMs){
    const ctrl = new AbortController(); const id = setTimeout(()=>ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      try { return await res.json(); } catch { return JSON.parse(await res.text()); }
    } finally { clearTimeout(id); }
  }

  // ---------- normalizers ----------
  function normItem(i={}) {
    // common price keys
    const priceRaw = i.price ?? i.unitPrice ?? i.unit_price ?? i.amount ?? i.priceKES ?? i.totalPrice ?? i.total_price;
    const price = typeof priceRaw === "number" ? priceRaw : parseKES(priceRaw);
    const qty = toInt(i.qty ?? i.quantity ?? i.qtyOrdered ?? i.qty_ordered ?? 1, 1);
    return {
      id: i.id ?? i.sku ?? i.code ?? null,
      sku: i.sku ?? i.code ?? i.id ?? null,
      name: i.name ?? i.title ?? i.productName ?? i.product_name ?? "",
      qty,
      price,
      createdAt: toISO(i.createdAt ?? i.date) ?? null,
      raw: i,
    };
  }

  function computeItemsTotal(items=[]) {
    try {
      return items.reduce((sum, it) => {
        const n = (typeof it.price === "number" ? it.price : parseKES(it.price)) || 0;
        const q = toInt(it.qty ?? it.quantity ?? 1, 1);
        return sum + (n * q);
      }, 0);
    } catch { return 0; }
  }

  function normOrder(o={}) {
    const id =
      o.id ?? o.orderId ?? o.order_id ?? o.orderNumber ?? o.order_number ?? o.number ?? o.reference ?? null;

    const name =
      o.fullName ?? o.full_name ?? o.customerName ?? o.customer_name ?? o.name ?? "";

    const phone = o.phone ?? o.customerPhone ?? o.customer_phone ?? "";
    const email = o.email ?? o.customerEmail ?? o.customer_email ?? "";

    const status = o.status ?? o.orderStatus ?? o.order_status ?? "Pending";

    const createdAt =
      toISO(o.createdAt ?? o.created_at ?? o.timestamp ?? o.placedAt ?? o.placed_at ?? o.date) ?? null;

    // normalize items first so we can compute a fallback total
    const itemsRaw = Array.isArray(o.items) ? o.items : (Array.isArray(o.lines) ? o.lines : []);
    const items = itemsRaw.map(normItem);

    // common total keys
    const totalRaw =
      o.total ?? o.totalAmount ?? o.total_amount ?? o.grandTotal ?? o.grand_total ??
      o.orderTotal ?? o.order_total ?? o.amount ?? o.amountPaid ?? o.amount_paid ?? null;

    let total =
      typeof totalRaw === "number" ? totalRaw : parseKES(totalRaw);

    // fallback: compute from items if still 0 or NaN
    if (!Number.isFinite(total) || total === 0) {
      const sum = computeItemsTotal(items);
      if (sum > 0) total = sum;
      else total = 0;
    }

    return {
      id,
      fullName: name,
      phone,
      email,
      status,
      total,
      createdAt,
      items,
      raw: o,
    };
  }

  function normUser(u={}) {
    return {
      id: u.id ?? u.userId ?? u.user_id ?? null,
      name: u.name ?? u.fullName ?? u.full_name ?? "",
      email: u.email ?? "",
      phone: u.phone ?? "",
      type: u.type ?? u.role ?? "Customer",
      status: u.status ?? "Active",
      createdAt: toISO(u.createdAt ?? u.created ?? u.created_at ?? u.date) ?? null,
      raw: u,
    };
  }

  // ---------- API wrappers ----------
  async function getOrders({ q="", status="", page=1, per=DEFAULTS.per }={}) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (page) params.set("page", String(page));
    if (per) params.set("per", String(per));

    const url = `${DEFAULTS.apiBase}/api/orders?${params.toString()}`;
    const data = await fetchJSON(url);

    const arr = Array.isArray(data) ? data : (Array.isArray(data?.orders) ? data.orders : []);
    const totalCount = Array.isArray(data) ? arr.length : (+data?.total || arr.length);
    const orders = arr.map(normOrder);
    return { success:true, total: totalCount, orders };
  }

  async function getUsers({ type="", page=1, per=DEFAULTS.per }={}) {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (page) params.set("page", String(page));
    if (per) params.set("per", String(per));

    const url = `${DEFAULTS.apiBase}/api/users?${params.toString()}`;
    const data = await fetchJSON(url).catch(()=>({ users: [] }));
    const arr = Array.isArray(data) ? data : (Array.isArray(data?.users) ? data.users : []);
    const users = arr.map(normUser);
    return { success:true, total: users.length, users };
  }

  async function getItems({ q="", page=1, per=DEFAULTS.per }={}) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (page) params.set("page", String(page));
    if (per) params.set("per", String(per));
    const url = `${DEFAULTS.apiBase}/api/items?${params.toString()}`;
    const data = await fetchJSON(url).catch(()=>({ items: [] }));
    const arr = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
    const items = arr.map(normItem);
    return { success:true, total: items.length, items };
  }

  async function patchOrder(id, { status, driverId=null, notes="" }) {
    const url = `${DEFAULTS.apiBase}/api/admin/orders/${encodeURIComponent(id)}`;
    const data = await fetchJSON(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, driverId, notes }),
    });
    const order = data?.order ? normOrder(data.order) : null;
    return { success: !!order, order, raw: data };
  }

  // ---------- export ----------
  global.WattSunAdminData = {
    config: DEFAULTS,
    utils: { fmtKES, toISO },
    normalizers: { normOrder, normUser, normItem },
    orders: { get: getOrders, patch: patchOrder },
    users: { get: getUsers },
    items: { get: getItems },
  };
})(window);
