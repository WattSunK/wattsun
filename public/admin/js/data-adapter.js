// public/admin/js/data-adapter.js
// Minimal, robust data layer for Admin UI (Orders + Users)

(() => {
  const API_BASE = "/api/admin";
  const ORDERS_URL = `${API_BASE}/orders`;
  const USERS_URL  = `${API_BASE}/users`;

  // Build query strings safely
  function qs(obj = {}) {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v === null || v === "") continue;
      u.set(k, v);
    }
    const s = u.toString();
    return s ? `?${s}` : "";
  }

  // GET JSON with credentials + clear error messages
  async function getJSON(url) {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) {
      let body = "";
      try { body = await res.text(); } catch {}
      const err = new Error(`GET ${url} - ${res.status} ${res.statusText}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return res.json();
  }

  function toCentsMaybe(v){
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : null;
  }

  // Normalizers
  function normalizeOrder(o) {
    return {
      id:            o.id || o.orderNumber || "",
      orderNumber:   o.orderNumber || o.id || "",
      fullName:      o.fullName || o.customerName || o.name || "",
      phone:         o.phone || "",
      email:         o.email || "",
      status:        o.status || "",
      createdAt:     o.createdAt || o.date || null,
      totalCents:    toCentsMaybe(o.totalCents) ?? 0,
      depositCents:  toCentsMaybe(o.depositCents) ?? toCentsMaybe(o.deposit_amount_cents) ?? toCentsMaybe(o.displayDepositCents) ?? toCentsMaybe(o.deposit),
      currency:      o.currency || "KES",
    };
  }

  function normalizeUser(u) {
    return {
      id: u.id,
      name: u.name || u.fullName || "",
      email: u.email || "",
      phone: u.phone || "",
      type: u.type || u.role || "",
      status: u.status || "",
    };
  }

  const Data = {
    orders: {
      /**
       * list({ page=1, per=10, q, status, from, to }) -> { success, page, per, total, orders, raw }
       */
      async list({ page = 1, per = 10, q, status, from, to } = {}) {
        const url = `${ORDERS_URL}${qs({ page, per, q, status, from, to })}`;
        const json = await getJSON(url);
        const src = Array.isArray(json.orders) ? json.orders : (Array.isArray(json) ? json : []);
        const orders = src.map(normalizeOrder);
        return {
          success: json.success !== false,
          page: Number(json.page) || page,
          per: Number(json.per) || per,
          total: Number(json.total) || orders.length,
          orders,
          raw: json
        };
      }
    },

    users: {
      /**
       * list({ type, q, page=1, per=50 }) -> { success, total, users, raw }
       */
      async list({ type, q, page = 1, per = 50 } = {}) {
        const url = `${USERS_URL}${qs({ type, q, page, per })}`;
        const json = await getJSON(url);
        const arr = Array.isArray(json.users) ? json.users : (Array.isArray(json) ? json : []);
        const users = arr.map(normalizeUser);
        return {
          success: json.success !== false,
          total: Number(json.total) || users.length,
          users,
          raw: json
        };
      }
    }
  };

  // Expose globally for controllers
  window.WattSunAdminData = Data;
})();
