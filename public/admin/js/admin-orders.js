// /public/admin/js/admin-orders.js
// Canonical Orders controller (table + modal + atomic save)
// Works with GET /api/orders -> { total, orders:[...] } or an array.

(function () {
  // ====== DIAG (temporary) ======
  console.log("[ORD] file loaded");
  let __ORD_boots = 0;
  function __ORD_logBoot(where){ console.log(`[ORD] boot ${++__ORD_boots} via`, where, "active=", window.__activeSection); console.trace(); }

  let ordersData = [];

  function pickOrdersPayload(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.orders)) return data.orders;
    return [];
  }

  function formatKESMaybe(n) {
    try {
      if (typeof window !== "undefined" && typeof window.formatKES === "function") {
        return window.formatKES(Math.round((n ?? 0) * 100));
      }
    } catch {}
    return (typeof n === "number") ? `KES ${n.toLocaleString()}` : "—";
  }

  // Find the Orders pane only; never paint outside it.
  function findOrdersPane() {
    const sel = [
      "#admin-content #orders",
      "#admin-content [data-partial='orders']",
      "#admin-content section.orders",
      "#admin-content .orders-panel"
    ].join(", ");
    const pane = document.querySelector(sel);
    console.log("[ORD] pane check:", pane ? (pane.id || pane.className || "(node)") : "NOT FOUND");
    return pane;
  }

  function fetchOrdersAndRender() {
    const pane = findOrdersPane();
    if (!pane) return; // If user switched away, do nothing.

    return fetch("/api/orders")
      .then((r) => r.json())
      .then((data) => {
        ordersData = pickOrdersPayload(data);
        renderOrdersTable(pane);
      })
      .catch((e) => {
        console.error("Failed to load orders:", e);
        ordersData = [];
        renderOrdersTable(pane);
      });
  }

  function renderOrdersTable(pane) {
    if (!pane) return;

    let container = pane.querySelector("#orders-table");
    if (!container) {
      container = document.createElement("div");
      container.id = "orders-table";
      pane.appendChild(container);
    }

    // Build rows into a fragment to avoid flicker
    const frag = document.createDocumentFragment();

    const wrap = document.createElement("div");
    wrap.className = "table-responsive";

    const table = document.createElement("table");
    table.className = "table table-striped table-sm w-100";

    table.innerHTML = `
      <thead>
        <tr>
          <th>Order ID</th>
          <th>Customer</th>
          <th>Phone</th>
          <th>Email</th>
          <th>Status</th>
          <th>Payment</th>
          <th>Net Value</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector("tbody");

    if (!ordersData.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 8;
      td.className = "empty-state";
      td.textContent = "No orders found.";
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      ordersData.forEach((o) => {
        const id = String(o.orderNumber || o.id || "");
        const name = o.fullName || o.name || "";
        const status = o.status || o.orderType || "Pending";
        const phone = o.phone || "—";
        const email = o.email || "—";
        const pm = o.paymentType || o.paymentMethod || "—";
        const amount = formatKESMaybe(o.total);

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="whitespace-nowrap">${id}</td>
          <td class="whitespace-nowrap">${name}</td>
          <td class="whitespace-nowrap">${phone}</td>
          <td class="whitespace-nowrap">${email}</td>
          <td class="whitespace-nowrap"><span class="badge badge-light">${status}</span></td>
          <td class="whitespace-nowrap">${pm}</td>
          <td class="whitespace-nowrap">${amount}</td>
          <td><button class="btn btn-sm btn-outline-secondary view-order-btn" data-id="${id}">View</button></td>
        `;
        tbody.appendChild(tr);
      });
    }

    wrap.appendChild(table);
    frag.appendChild(wrap);
    container.replaceChildren(frag);

    container.querySelectorAll(".view-order-btn").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        const orderId = ev.currentTarget.getAttribute("data-id");
        const order = ordersData.find(
          (o) => String(o.orderNumber || o.id || "") === orderId
        );
        if (order) openModal(order);
      });
    });

    ensureModalScaffold(); // ensure modal exists/bound
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function openModal(order) {
    const id = String(order.orderNumber || order.id || "");

    setText("modal-order-id", id);
    setText("modal-customer-name", order.fullName || order.name || "—");
    setText("modal-phone", order.phone || "—");
    setText("modal-email", order.email || "—");
    setText("modal-payment-method", order.paymentType || order.paymentMethod || "—");
    setText("modal-amount", formatKESMaybe(order.total));
    setText("modal-deposit", order.deposit == null ? "—" : String(order.deposit));

    const select = document.getElementById("modal-status");
    if (select) select.value = order.status || order.orderType || "Pending";

    const list = document.getElementById("modal-items-list");
    if (list) {
      list.innerHTML = "";
      const items = Array.isArray(order.cart) ? order.cart : order.items || [];
      items.forEach((it) => {
        const li = document.createElement("li");
        const qty = it.quantity != null && it.quantity !== "" ? ` x ${it.quantity}` : "";
        li.textContent = `${it.name || ""}${qty}`;
        list.appendChild(li);
      });
    }

    const modal = document.getElementById("orderDetailsModal");
    if (modal) modal.style.display = "block";
  }

  function bindModalButtons() {
    const close = () => {
      const m = document.getElementById("orderDetailsModal");
      if (m) m.style.display = "none";
    };

    const c1 = document.getElementById("closeOrderModal");
    const c2 = document.getElementById("closeOrderModalBtn");
    if (c1 && !c1._bound) (c1._bound = 1), c1.addEventListener("click", close);
    if (c2 && !c2._bound) (c2._bound = 1), c2.addEventListener("click", close);

    const save = document.getElementById("updateOrderStatusBtn");
    if (save && !save._bound) {
      save._bound = 1;
      save.addEventListener("click", async () => {
        const orderId = document.getElementById("modal-order-id").textContent.trim();
        const newStatus = document.getElementById("modal-status").value;
        const newNotes  = (document.getElementById("modal-notes")?.value || "").trim();

        try {
          // Align with backend used elsewhere: PATCH /api/admin/orders/:id
          const r = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus, notes: newNotes }),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || !(j.ok || j.success)) {
            throw new Error(j?.error || `Update failed (${r.status})`);
          }
          await fetchOrdersAndRender();
          close();
          alert("Order updated");
        } catch (e) {
          console.error(e);
          alert("Failed to update: " + e.message);
        }
      });
    }
  }

  function ensureModalScaffold() {
    if (document.getElementById("orderDetailsModal")) {
      bindModalButtons();
      return;
    }
    fetch("/partials/orders-modal.html")
      .then((r) => (r.ok ? r.text() : ""))
      .then((html) => {
        if (html) {
          const div = document.createElement("div");
          div.innerHTML = html;
          document.body.appendChild(div);
        } else {
          // Minimal fallback if partial missing
          const wrap = document.createElement("div");
          wrap.innerHTML = `
            <div id="orderDetailsModal" style="display:none">
              <div>
                <button id="closeOrderModal">×</button>
                <div>Order: <span id="modal-order-id"></span></div>
                <div>Customer: <span id="modal-customer-name"></span></div>
                <div>Phone: <span id="modal-phone"></span></div>
                <div>Email: <span id="modal-email"></span></div>
                <div>Payment: <span id="modal-payment-method"></span></div>
                <div>Amount: <span id="modal-amount"></span></div>
                <div>Deposit: <span id="modal-deposit"></span></div>
                <label>Status
                  <select id="modal-status">
                    <option>Pending</option><option>Processing</option>
                    <option>Delivered</option><option>Cancelled</option>
                  </select>
                </label>
                <textarea id="modal-notes" placeholder="Internal notes"></textarea>
                <div style="margin-top:8px">
                  <button id="updateOrderStatusBtn">Save</button>
                  <button id="closeOrderModalBtn">Close</button>
                </div>
                <ul id="modal-items-list"></ul>
              </div>
            </div>`;
          document.body.appendChild(wrap);
        }
        bindModalButtons();
      })
      .catch(() => {
        bindModalButtons(); // still bind if fetch failed
      });
  }

  function init() {
    __ORD_logBoot("initAdminOrders");
    fetchOrdersAndRender();
    ensureModalScaffold();
  }

  // Expose init for dashboard.js
  window.initAdminOrders = init;
})();
