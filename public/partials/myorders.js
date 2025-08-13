// public/partials/myorders.js
// Step 6.4 – Customer Reflection (surgical):
// - Parse the real /api/track shape { success, total, orders }
// - Render stable columns
// - Re-fetch on focus, storage('ordersUpdatedAt'), and postMessage('orders-updated')

(function () {
  // -------- Utils --------
  function getCurrentUser() {
    try {
      const raw = localStorage.getItem("wattsunUser") || localStorage.getItem("ws_user");
      if (!raw) return null;
      const obj = JSON.parse(raw);
      return obj.user ? obj.user : obj;
    } catch { return null; }
  }

  function fmtMoney(amount, currency) {
    const n = Number(amount || 0);
    const cur = (currency || "KES") + "";
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(n);
    } catch {
      return `${cur} ${n.toLocaleString()}`;
    }
  }

  function bySel(sel, root) { return (root || document).querySelector(sel); }

  // Map the track API order object to our table row fields
  function mapOrder(o, idx) {
    return {
      idx,
      id: o.orderNumber || o.id || "—",
      type: o.paymentType || "",                     // reused as "type"
      orderDate: o.updatedAt || "",                  // best available timestamp
      deliveryDate: "",                              // unknown at source
      address: o.deliveryAddress || "",
      paymentMethod: o.paymentType || "",
      totalAmount: o.total ?? 0,
      status: o.status || "Pending",
      currency: o.currency || "KES",
    };
  }

  // -------- Fetch + Render --------
  async function fetchOrders(phone, extra = {}) {
    const body = { phone };
    if (extra.status) body.status = extra.status;
    if (extra.order) body.order = extra.order;

    const res = await fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!data || data.success === false) return { total: 0, orders: [] };
    const list = Array.isArray(data.orders) ? data.orders : [];
    return { total: Number(data.total || list.length || 0), orders: list };
  }

  function renderTable(rows) {
    const tbody = bySel(".orders-table tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!rows.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="9" style="text-align:center;">No orders found.</td>`;
      tbody.appendChild(tr);
      return;
    }

    rows.forEach((r, i) => {
      const tr = document.createElement("tr");
      tr.setAttribute("data-oid", r.id);
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>
          <a href="#" class="order-link" data-oid="${r.id}">${r.id}</a>
        </td>
        <td>${r.type}</td>
        <td>${r.orderDate}</td>
        <td>${r.deliveryDate}</td>
        <td>${r.address}</td>
        <td>${r.paymentMethod}</td>
        <td>${fmtMoney(r.totalAmount, r.currency)}</td>
        <td><strong data-col="status">${r.status}</strong></td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Preserve a light bit of state (optional hooks if your page has filters)
  const MyOrdersState = {
    status: "",    // if you add a status filter later, wire it here
    order: "",     // if you add an order search later, wire it here
  };

  async function loadAndRender() {
    const user = getCurrentUser();
    if (!user?.phone) {
      alert("Please login first.");
      window.location.href = "/index.html";
      return;
    }

    const { orders } = await fetchOrders(user.phone, {
      status: MyOrdersState.status,
      order: MyOrdersState.order,
    });

    const rows = orders.map(mapOrder);
    renderTable(rows);
  }

  // -------- Step 6.4 listeners (refresh triggers) --------
  function wireRefreshTriggers() {
    // 1) Tab regains focus
    window.addEventListener("focus", () => loadAndRender());

    // 2) Another tab wrote ordersUpdatedAt
    window.addEventListener("storage", (e) => {
      if (e && e.key === "ordersUpdatedAt") loadAndRender();
    });

    // 3) Same-tab message (defensive)
    window.addEventListener("message", (e) => {
      if (e && e.data && e.data.type === "orders-updated") loadAndRender();
    });
  }

  // Public init for your page
  function initMyOrders() {
    wireRefreshTriggers();
    loadAndRender();
  }

  // Expose
  window.initMyOrders = initMyOrders;
})();
