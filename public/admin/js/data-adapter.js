// public/admin/js/data-adapter.js
// Admin data adapter with automatic endpoint fallback for legacy paths.
// Tries /api/admin/orders, /admin/orders, /api/orders, /orders (first one that returns array).
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
      try { return await res.json(); } catch { return JSON.parse(await res.text()); }
    } finally { clearTimeout(id); }
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
    // Try multiple endpoints (first that returns an array wins)
    const candidates = [
      `${DEFAULTS.apiBase}/api/admin/orders`,
      `${DEFAULTS.apiBase}/admin/orders`,
      `${DEFAULTS.apiBase}/api/orders`,
      `${DEFAULTS.apiBase}/orders`,
    ];

    // We still fetch "many" and paginate client-side for speed in the UI.
    const perToAsk = per || 10000;

    let arr = null, chosen = null, payload = null;

    for (const base of candidates) {
      try {
        const url = new URL(base, location.origin);
        if (q) url.searchParams.set("q", q);
        if (status && !/^all$/i.test(status)) url.searchParams.set("status", status);
        url.searchParams.set("page", String(page || 1));
        url.searchParams.set("per", String(perToAsk));

        const data = await fetchJSON(url.toString());
        const list = Array.isArray(data)
          ? data
          : (Array.isArray(data?.orders) ? data.orders : null);

        if (Array.isArray(list)) {
          arr = list;
          payload = data;
          chosen = url.pathname;
          break;
        }
      } catch (e) {
        // try next candidate
      }
    }

    if (!Array.isArray(arr)) {
      console.warn("[AdminData] No orders endpoint returned data.");
      return { success: true, total: 0, orders: [] };
    }

    // Optional: log which endpoint was used (once)
    if (!window.__wsOrdersEndpointLogged) {
      window.__wsOrdersEndpointLogged = true;
      try { console.info("[AdminData] Orders endpoint:", chosen); } catch {}
    }

    const total =
      typeof payload?.total === "number" ? payload.total : arr.length;

    return { success: true, total, orders: arr.map(normOrder) };
  }

  async function getUsers({ type = "", page = 1, per = DEFAULTS.per } = {}) {
    const candidates = [
      `${DEFAULTS.apiBase}/api/admin/users`,
      `${DEFAULTS.apiBase}/admin/users`,
      `${DEFAULTS.apiBase}/api/users`,
      `${DEFAULTS.apiBase}/users`,
    ];
    let arr = null;
    for (const base of candidates) {
      try {
        const url = new URL(base, location.origin);
        if (type) url.searchParams.set("type", type);
        url.searchParams.set("page", String(page || 1));
        url.searchParams.set("per", String(per || DEFAULTS.per));
        const data = await fetchJSON(url.toString());
        const list = Array.isArray(data)
          ? data
          : (Array.isArray(data?.users) ? data.users : null);
        if (Array.isArray(list)) { arr = list; break; }
      } catch {}
    }
    return { success: true, total: (arr?.length || 0), users: (arr || []).map(normUser) };
  }

  async function getItems({ q = "", page = 1, per = DEFAULTS.per } = {}) {
    const candidates = [
      `${DEFAULTS.apiBase}/api/admin/items`,
      `${DEFAULTS.apiBase}/admin/items`,
      `${DEFAULTS.apiBase}/api/items`,
      `${DEFAULTS.apiBase}/items`,
    ];
    let arr = null;
    for (const base of candidates) {
      try {
        const url = new URL(base, location.origin);
        if (q) url.searchParams.set("q", q);
        url.searchParams.set("page", String(page || 1));
        url.searchParams.set("per", String(per || DEFAULTS.per));
        const data = await fetchJSON(url.toString());
        const list = Array.isArray(data)
          ? data
          : (Array.isArray(data?.items) ? data.items : null);
        if (Array.isArray(list)) { arr = list; break; }
      } catch {}
    }
    return { success: true, total: (arr?.length || 0), items: (arr || []).map(normItem) };
  }

  async function patchOrder(id, payload) {
    // Try patching on admin endpoints first, then legacy
    const paths = [
      `${DEFAULTS.apiBase}/api/admin/orders/${encodeURIComponent(id)}`,
      `${DEFAULTS.apiBase}/admin/orders/${encodeURIComponent(id)}`,
      `${DEFAULTS.apiBase}/api/orders/${encodeURIComponent(id)}`,
      `${DEFAULTS.apiBase}/orders/${encodeURIComponent(id)}`
    ];
    let data = null;
    for (const u of paths) {
      try {
        data = await fetchJSON(u, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload || {}),
        });
        break;
      } catch {}
    }
    const order = data?.order ? normOrder(data.order) : null;
    return { success: !!order, order, raw: data };
  }

  // ---------------- public API ----------------
  global.WattSunAdminData = {
    config: DEFAULTS,
    normalizers: { normOrder, normUser, normItem },
    orders: { get: getOrders, patch: patchOrder },
    users: { get: getUsers },
    items: { get: getItems },
  };
})(window);
