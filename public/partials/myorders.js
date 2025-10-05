// My Orders (per-user) — uses Admin UX Kit (toast, skeletons, banners)
const USER_KEYS = ["wattsunUser", "ws_user"];

function getUser() {
  for (const k of USER_KEYS) {
    try { const v = localStorage.getItem(k); if (v) return JSON.parse(v); } catch {}
  }
  return null;
}

function bySel(sel, root) { return (root || document).querySelector(sel); }

function fmtMoney(val, currency) {
  if (val == null) return "—";
  const n = Number(val);
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "KES" }).format(n); }
  catch { return `${currency || "KES"} ${n.toFixed(2)}`; }
}

function mapOrder(o, idx) {
  return {
    sl: idx + 1,
    id: o.orderId || o.id || o.number || "—",
    type: o.type || o.orderType || "—",
    orderDate: o.createdAt ? new Date(o.createdAt).toLocaleString() : (o.orderDate || "—"),
    status: o.status || "Pending",
    totalAmount: o.amount || o.total || 0,
    currency: o.currency || "KES",
  };
}

function renderRows(rows) {
  const tbody = bySel(".orders-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!rows || rows.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="7" style="text-align:center;">
      <div class="empty"><div class="title">No orders yet</div><div>Place your first order to see it here.</div></div>
    </td>`;
    tbody.appendChild(tr);
    const meta = bySel("#myOrdersMeta");
    if (meta) meta.textContent = "Showing 0 of 0 entries";
    return;
  }

  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.sl}</td>
      <td><a href="#" class="order-link" data-oid="${r.id}">${r.id}</a></td>
      <td>${r.type}</td>
      <td>${r.orderDate}</td>
      <td><strong>${r.status}</strong></td>
      <td>${fmtMoney(r.totalAmount, r.currency)}</td>
      <td><button class="btn btn-ghost" data-oid="${r.id}">View</button></td>
    `;
    tbody.appendChild(tr);
  });
}

async function fetchMyOrders() {
  const u = getUser();
  if (!u || !u.phone) throw new Error("Missing logged-in user phone");

  const url = "/api/track";
  const body = { phone: u.phone };

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body)
  });

  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  const list = Array.isArray(data) ? data : (data.rows || []);
  return list.map(mapOrder);
}

async function loadMyOrders() {
  const tbody = bySel(".orders-table tbody");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">
      <div class="skel skel-row" style="width:60%;margin:6px auto;"></div>
      <div class="skel skel-row" style="width:40%;margin:6px auto;"></div>
    </td></tr>`;
  }

  try {
    const rows = await fetchMyOrders();
    renderRows(rows);
  } catch (e) {
    const tbody = bySel(".orders-table tbody");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">
        <div class="banner error">
          Couldn’t load your orders.
          <div class="spacer"></div>
          <button class="btn small" onclick="initMyOrders()">Retry</button>
        </div>
      </td></tr>`;
    }
    if (typeof toast === "function") toast("Failed to load orders", "error");
    console.error(e);
  }
}

function initMyOrders() {
  loadMyOrders();
  window.addEventListener("focus", loadMyOrders);
  window.addEventListener("storage", (ev) => {
    if (USER_KEYS.includes(ev.key)) loadMyOrders();
  });
  window.addEventListener("message", (ev) => {
    if (ev?.data === "orders:refresh") loadMyOrders();
  });
}

window.initMyOrders = initMyOrders;
