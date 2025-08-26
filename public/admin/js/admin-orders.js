// /public/admin/js/admin-orders.js
// Vanilla JS Orders table + modal + atomic save.
// Works with GET /api/orders -> { total, orders:[...] } or an array.

(function () {
  let ordersData = [];

  // 6.5.4 — Empty state row helper
  function renderEmptyRow(tbody, colspan, msg){
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = colspan; td.className = 'empty-state'; td.textContent = msg;
    tr.appendChild(td); tbody.appendChild(tr);
  }

  function pickOrdersPayload(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.orders)) return data.orders;
    return [];
  }

  function fetchOrdersAndRender() {
    return fetch("/api/orders")
      .then((r) => r.json())
      .then((data) => {
        ordersData = pickOrdersPayload(data);
        renderOrdersTable();
      })
      .catch((e) => {
        console.error("Failed to load orders:", e);
        ordersData = [];
        renderOrdersTable();
      });
  }

  function renderOrdersTable() {
    // Find or create the container the script expects.
    let container = document.getElementById("orders-table");
    if (!container) {
      container = document.createElement("div");
      container.id = "orders-table";
      const host =
        document.querySelector("#admin-content") ||
        document.querySelector(".main-section") ||
        document.body;
      host.prepend(container);
    }

    if (!ordersData.length) {
      container.innerHTML =
        '<div class="text-sm text-gray-500 px-3 py-2">No orders found.</div>';
      return;
    }

    const rows = ordersData
      .map((o) => {
        const id = String(o.orderNumber || o.id || "");
        const name = o.fullName || o.name || "";
        const status = o.status || o.orderType || "Pending";
        const phone = o.phone || "—";
        const email = o.email || "—";
        const pm = o.paymentType || o.paymentMethod || "—";
        const amount = (typeof window!=='undefined' && typeof window.formatKES==='function')
          ? window.formatKES((o.total ?? 0) * 100)
          : (typeof o.total === 'number' ? `KES ${o.total.toLocaleString()}` : '—');

        return `
          <tr>
            <td class="whitespace-nowrap">${id}</td>
            <td class="whitespace-nowrap">${name}</td>
            <td class="whitespace-nowrap">${phone}</td>
            <td class="whitespace-nowrap">${email}</td>
            <td class="whitespace-nowrap"><span class="badge badge-light">${status}</span></td>
            <td class="whitespace-nowrap">${pm}</td>
            <td class="whitespace-nowrap">${amount}</td>
            <td><button class="btn btn-sm btn-outline-secondary view-order-btn" data-id="${id}">View</button></td>
          </tr>`;
      })
      .join("");

    container.innerHTML = `
      <div class="table-responsive">
        <table class="table table-striped table-sm w-100">
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
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;

    container.querySelectorAll(".view-order-btn").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        const orderId = ev.currentTarget.getAttribute("data-id");
        const order = ordersData.find(
          (o) => String(o.orderNumber || o.id || "") === orderId
        );
        if (order) openModal(order);
      });
    });

    ensureModalScaffold(); // make sure the modal exists
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
    setText(
      "modal-amount",
      typeof order.total === "number" ? `KES ${order.total.toLocaleString()}` : "—"
    );
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

    document.getElementById("orderDetailsModal").style.display = "block";
  }

  function bindModalButtons() {
    const close = () =>
      (document.getElementById("orderDetailsModal").style.display = "none");

    const c1 = document.getElementById("closeOrderModal");
    const c2 = document.getElementById("closeOrderModalBtn");
    if (c1 && !c1._bound) (c1._bound = 1), c1.addEventListener("click", close);
    if (c2 && !c2._bound) (c2._bound = 1), c2.addEventListener("click", close);

    const save = document.getElementById("updateOrderStatusBtn");
    if (save && !save._bound) {
      save._bound = 1;
      save.addEventListener("click", () => {
        const orderId = document.getElementById("modal-order-id").textContent.trim();
        const newStatus = document.getElementById("modal-status").value;

        fetch("/api/update-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, status: newStatus }),
        })
          .then((r) => r.json())
          .then((j) => {
            if (!j || !(j.ok || j.success)) throw new Error(j?.error || "Update failed");
            return fetchOrdersAndRender();
          })
          .then(() => {
            close();
            alert("Order updated");
          })
          .catch((e) => {
            console.error(e);
            alert("Failed to update: " + e.message);
          });
      });
    }
  }

  function ensureModalScaffold() {
    if (document.getElementById("orderDetailsModal")) return;
    fetch("/partials/orders-modal.html")
      .then((r) => (r.ok ? r.text() : ""))
      .then((html) => {
        if (html) {
          const div = document.createElement("div");
          div.innerHTML = html;
          document.body.appendChild(div);
        } else {
          // Fallback minimal modal if partial not found
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
                <button id="updateOrderStatusBtn">Save</button>
                <button id="closeOrderModalBtn">Close</button>
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
    fetchOrdersAndRender();
    ensureModalScaffold();
  }

  window.initAdminOrders = init;
})();
