// public/admin/js/data-adapter.js
// Admin data adapter — aligned to the current contract.
// - Orders: GET /api/admin/orders?q&status&page&per  → { success, page, per, total, orders:[...] }
// - Users (drivers): GET /api/admin/users?type=Driver → { success, users:[...] }
// - Patch order: PATCH /api/admin/orders/:id          → { success, order:{...} }
//
// No legacy endpoint fallbacks; no ambiguous payload shapes.

(function (global) {
  "use strict";

  const CONFIG = {
    apiBase: "",        // keep relative by default (same-origin)
    timeoutMs: 15000,
    adminPerDefault: 10 // UI defaults; controller can override
  };

  // ---------- utils ----------
  function abortable(ms) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    return { signal: ctrl.signal, done: () => clearTimeout(id) };
  }

  async function fetchJSON(url, opts = {}, to = CONFIG.timeoutMs) {
    const a = abortable(to);
    try {
      const res = await fetch(url, { ...opts, signal: a.signal });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${text || ""}`.trim());
      }
      return await res.json();
    } finally {
      a.done();
    }
  }

  const toInt = (n, f = 0) => (Number.isFinite(+n) ? +n : f);
  const toISO = (d) => {
    if (!d) return null;
    const t = new Date(d);
    return Number.isNaN(+t) ? null : t.toISOString();
  };

  // ---------- normalizers ----------
  function normOrder(o = {}) {
    // Contract fields coming from /api/admin/orders
    // id/orderNumber/fullName/phone/email/status/createdAt/totalCents/depositCents/currency/driverId/notes
    return {
      id: o.id ?? o.orderNumber ?? null,
      orderNumber: o.orderNumber ?? o.id ?? null,
      fullName: o.fullName ?? "",
      phone: o.phone ?? "",
      email: o.email ?? "",
      status: o.status ?? "Pending",
      createdAt: toISO(o.createdAt ?? o.created_at),
      totalCents: Number.isFinite(o.totalCents) ? o.totalCents : null,
      depositCents: Number.isFinite(o.depositCents) ? o.depositCents : null,
      currency: o.currency || "KES",
      driverId: o.driverId ?? null,
      notes: o.notes ?? "",
      items: Array.isArray(o.items) ? o.items : [],
      raw: o
    };
  }

  function normUser(u = {}) {
    return {
      id: u.id ?? null,
      name: u.name ?? u.fullName ?? "",
      email: u.email ?? "",
      phone: u.phone ?? "",
      type: u.type ?? u.role ?? "Customer",
      status: u.status ?? "Active",
      createdAt: toISO(u.createdAt ?? u.created ?? u.date) ?? null,
      raw: u
    };
  }

  // ---------- API wrappers ----------
  async function getOrders({ q = "", status = "", page = 1, per = CONFIG.adminPerDefault } = {}) {
    const url = new URL(`${CONFIG.apiBase}/api/admin/orders`, location.origin);
    if (q) url.searchParams.set("q", q);
    if (status && !/^all$/i.test(status)) url.searchParams.set("status", status);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per", String(per));

    const data = await fetchJSON(url.toString());
    const orders = Array.isArray(data?.orders) ? data.orders.map(normOrder) : [];
    return {
      success: !!data?.success,
      page: toInt(data?.page ?? page, page),
      per: toInt(data?.per ?? per, per),
      total: toInt(data?.total ?? orders.length, orders.length),
      orders
    };
  }

  async function patchOrder(id, payload) {
    const url = new URL(`${CONFIG.apiBase}/api/admin/orders/${encodeURIComponent(id)}`, location.origin);
    const data = await fetchJSON(url.toString(), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    });
    const order = data?.order ? normOrder(data.order) : null;
    return { success: !!order, order, raw: data };
  }

  async function getUsers({ type = "Driver", page = 1, per = 50 } = {}) {
    const url = new URL(`${CONFIG.apiBase}/api/admin/users`, location.origin);
    if (type) url.searchParams.set("type", type);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per", String(per));
    const data = await fetchJSON(url.toString());
    const users = Array.isArray(data?.users) ? data.users.map(normUser) : [];
    return { success: true, total: users.length, users };
  }

  // ---------- export ----------
  global.WattSunAdminData = {
    config: CONFIG,
    orders: { get: getOrders, patch: patchOrder },
    users: { get: getUsers }
  };
})(window);
