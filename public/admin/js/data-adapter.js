// public/admin/js/data-adapter.js
// Compatibility layer for Admin data fetching + normalization.
// Keeps HTML/CSS intact; controllers read from here.
(function (global) {
  "use strict";

  const DEFAULTS = {
    apiBase: "",
    per: 25,
    timeoutMs: 15000,
  };

  // ---------------- utils ----------------
  function toInt(n, f = 0) {
    const x = parseInt(n, 10);
    return Number.isFinite(x) ? x : f;
  }
  function parseKES(input) {
    if (typeof input === "number") return input;
    if (!input) return 0;
    const s = String(input).replace(/[^\d.,-]/g, "").replace(/,/g, "");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }
  function fmtKES(v) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "KES",
        maximumFractionDigits: 0,
      }).format(v);
    } catch {
      return "KSH " + (v || 0).toLocaleString();
    }
  }
  function toISO(d) {
    if (!d) return null;
    const t = new Date(d);
    return Number.isNaN(+t) ? null : t.toISOString();
  }

  async function fetchJSON(url, opts = {}, timeoutMs = DEFAULTS.timeoutMs) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      try {
        return await res.json();
      } catch {
        return JSON.parse(await res.text());
      }
    } finally {
      clearTimeout(id);
    }
  }

  // --------------- normalizers ---------------
  function normOrder(o = {}) {
    const id =
      o.id ?? o.orderId ?? o.orderNumber ?? o.number ?? o.reference ?? null;
    const name = o.fullName ?? o.name ?? o.customerName ?? "";
    const phone = o.phone ?? o.customerPhone ?? "";
    const email = o.email ?? o.customerEmail ?? "";
    const status = o.status ?? o.orderStatus ?? "Pending";
    const createdAt =
      toISO(o.createdAt ?? o.timestamp ?? o.placedAt ?? o.date) ?? null;
    const total =
      typeof o.total === "number"
        ? o.total
        : parseKES(o.total ?? o.amount ?? o.grandTotal);
    const items = Array.isArray(o.items)
      ? o.items.map((it) => ({
          sku: it.sku ?? it.code ?? it.id ?? null,
          name: it.name ?? it.title ?? "",
          qty: toInt(it.qty ?? it.quantity ?? 1, 1),
          price:
            typeof it.price === "number"
              ? it.price
              : parseKES(it.price ?? it.unitPrice ?? 0),
        }))
      : [];
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

  function normUser(u = {}) {
    return {
      id: u.id ?? u.userId ?? null,
      name: u.name ?? u.fullName ?? "",
      email: u.email ?? "",
      phone: u.phone ?? "",
      type: u.type ?? u.role ?? "Customer",
      status: u.status ?? "Active",
      createdAt: toISO(u.createdAt ?? u.created ?? u.date) ?? null,
      raw: u,
    };
  }

  function normItem(i = {}) {
    const price =
      typeof i.price === "number" ? i.price : parseKES(i.price ?? i.unitPrice);
    return {
      id: i.id ?? i.sku ?? i.code ?? null,
      name: i.name ?? i.title ?? "",
      price,
      stock: toInt(i.stock ?? i.qty ?? i.quantity ?? 0, 0),
      category: i.category ?? i.cat ?? "",
      createdAt: toISO(i.createdAt ?? i.date) ?? null,
      raw: i,
    };
  }

  // --------------- API wrappers ---------------
  async function getOrders({ q = "", status = "", page = 1, per = DEFAULTS.per } = {}) {
    const url = new URL(`${DEFAULTS.apiBase}/api/admin/orders`, location.origin);
    if (q) url.searchParams.set("q", q);
    if (status) url.searchParams.set("status", status);
    // We still fetch "a lot" and paginate client-side for speed in the UI.
    // If your backend supports true pagination, you can pass page/per through here.
    url.searchParams.set("page", String(page || 1));
    url.searchParams.set("per", String(per || DEFAULTS.per));

    const data = await fetchJSON(url.toString()).catch(() => ({ orders: [] }));

    const arr = Array.isArray(data) ? data : (Array.isArray(data?.orders) ? data.orders : []);
    const total =
      typeof data?.total === "number"
        ? data.total
        : (Array.isArray(arr) ? arr.length : 0);

    return { success: true, total, orders: arr.map(normOrder) };
  }

  async function getUsers({ type = "", page = 1, per = DEFAULTS.per } = {}) {
    const url = new URL(`${DEFAULTS.apiBase}/api/admin/users`, location.origin);
    if (type) url.searchParams.set("type", type);
    url.searchParams.set("page", String(page || 1));
    url.searchParams.set("per", String(per || DEFAULTS.per));
    const data = await fetchJSON(url.toString()).catch(() => ({ users: [] }));
    const arr = Array.isArray(data) ? data : (Array.isArray(data?.users) ? data.users : []);
    return { success: true, total: arr.length, users: arr.map(normUser) };
  }

  async function getItems({ q = "", page = 1, per = DEFAULTS.per } = {}) {
    const url = new URL(`${DEFAULTS.apiBase}/api/admin/items`, location.origin);
    if (q) url.searchParams.set("q", q);
    url.searchParams.set("page", String(page || 1));
    url.searchParams.set("per", String(per || DEFAULTS.per));
    const data = await fetchJSON(url.toString()).catch(() => ({ items: [] }));
    const arr = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
    return { success: true, total: arr.length, items: arr.map(normItem) };
  }

  async function patchOrder(id, payload) {
    const url = `${DEFAULTS.apiBase}/api/admin/orders/${encodeURIComponent(id)}`;
    const data = await fetchJSON(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
    const order = data?.order ? normOrder(data.order) : null;
    return { success: !!order, order, raw: data };
  }

  // ---------------- public API ----------------
  global.WattSunAdminData = {
    config: DEFAULTS,
    utils: { fmtKES, toISO },
    normalizers: { normOrder, normUser, normItem },
    orders: { get: getOrders, patch: patchOrder },
    users: { get: getUsers },
    items: { get: getItems },
  };
})(window);
