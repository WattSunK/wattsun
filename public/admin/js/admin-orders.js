// /public/admin/js/admin-orders.js
// Canonical Orders controller (table + modal + atomic save)
// Admin list fetches GET /api/admin/orders?q&status&from&to&page&per -> { success, total, orders:[...] } or compatible.

(function () {
  // ====== DIAG (temporary) ======
  console.log("[ORD] file loaded");
  let __ORD_boots = 0;
  function __ORD_logBoot(where){ console.log(`[ORD] boot ${++__ORD_boots} via`, where, "active=", window.__activeSection); console.trace(); }

  let ordersData = [];

  
  function formatKESMaybe(n) {
    try {
      if (typeof window !== "undefined" && typeof window.formatKES === "function") {
        return window.formatKES(Math.round((n ?? 0) * 100));
      }
    } catch {}
    return (typeof n === "number") ? `KES ${n.toLocaleString()}` : "—";
  }
// === Build admin list URL from filters ===
function buildAdminOrdersUrl() {
  const q       = (document.getElementById("ordersSearch")?.value || "").trim();
  const status  = (document.getElementById("ordersStatus")?.value || "").trim();
  const from    = (document.getElementById("ordersFrom")?.value || "").trim();
  const to      = (document.getElementById("ordersTo")?.value || "").trim();
  const pageEl  = document.getElementById("ordersPageNum");
  const page    = Number(pageEl?.dataset.page || 1) || 1;
  const per     = 10; // admin default

  const usp = new URLSearchParams();
  if (q)      usp.set("q", q);
  if (status) usp.set("status", status);
  if (from)   usp.set("from", from);
  if (to)     usp.set("to", to);
  usp.set("page", String(page));
  usp.set("per",  String(per));

  return `/api/admin/orders?${usp.toString()}`;
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

  const url = buildAdminOrdersUrl();
return fetch(url)
  .then((r) => r.json())
  .then((data) => {
    // accept {success,orders} or raw array defensively
    ordersData = Array.isArray(data) ? data :
                 (Array.isArray(data.orders) ? data.orders : []);
    renderOrdersTable(pane);

    // Optional: update a "Total" meta if present
    const meta = document.getElementById("ordersMeta");
    if (meta && data && typeof data.total === "number") {
      meta.textContent = `Total: ${data.total}`;
    }
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
      const amount =
        (typeof o.totalCents === "number")
          ? (window.formatKES ? window.formatKES(o.totalCents) : `KES ${(o.totalCents/100).toLocaleString()}`)
          : formatKESMaybe(o.total);

      const tr = document.createElement("tr");
      tr.setAttribute("data-id", id); // helpful for inline refresh later
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

function attachFilterListenersOnce() {
  const byId = (id) => document.getElementById(id);
  const on = (el, ev, fn) => { if (el && !el[`_on_${ev}`]) { el[`_on_${ev}`] = 1; el.addEventListener(ev, fn); } };

  // ensure page state holder exists & has default
  const pageEl = byId("ordersPageNum");
  if (pageEl && !pageEl.dataset.page) pageEl.dataset.page = "1";

 
 // Search + Clear
  on(byId("ordersSearchBtn"), "click", () => { pageEl.dataset.page = "1"; fetchOrdersAndRender(); });
  on(byId("ordersClearBtn"),  "click", () => {
    if (byId("ordersSearch")) byId("ordersSearch").value = "";
    if (byId("ordersStatus")) byId("ordersStatus").value = "";
    if (byId("ordersFrom"))   byId("ordersFrom").value   = "";
    if (byId("ordersTo"))     byId("ordersTo").value     = "";
    pageEl.dataset.page = "1";
    fetchOrdersAndRender();
  });

  // Enter in search box
  on(byId("ordersSearch"), "keydown", (e) => {
    if (e.key === "Enter") { pageEl.dataset.page = "1"; fetchOrdersAndRender(); }
  });

  // Status / Dates
  ["ordersStatus","ordersFrom","ordersTo"].forEach(id => {
    const el = byId(id);
    on(el, "change", () => { pageEl.dataset.page = "1"; fetchOrdersAndRender(); });
  });

  // Pager buttons (ids expected in your partial)
  const setPage = (p) => { pageEl.dataset.page = String(Math.max(1, p)); fetchOrdersAndRender(); };
  on(byId("pagerFirst"), "click", () => setPage(1));
  on(byId("pagerPrev"),  "click", () => setPage((Number(pageEl.dataset.page)||1) - 1));
  on(byId("pagerNext"),  "click", () => setPage((Number(pageEl.dataset.page)||1) + 1));
  // If you have "Last", wire similarly once you know the last page:
  // on(byId("pagerLast"),  "click", () => setPage(Number(pageEl.dataset.lastpage)||1));
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
    // Prefer cents if provided by admin SQL list
    const amtC = typeof order.totalCents === "number" ? order.totalCents : null;
    const depC = typeof order.depositCents === "number" ? order.depositCents : null;
    setText("modal-amount", amtC != null
      ? (window.formatKES ? window.formatKES(amtC) : `KES ${(amtC/100).toLocaleString()}`)
      : formatKESMaybe(order.total));
    setText("modal-deposit", depC != null
      ? (window.formatKES ? window.formatKES(depC) : `KES ${(depC/100).toLocaleString()}`)
      : (order.deposit == null ? "—" : String(order.deposit)));


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
	// Broadcast so other tabs/views can refresh immediately
	localStorage.setItem("ordersUpdatedAt", String(Date.now()));
	window.postMessage({ type: "orders-updated" }, "*");
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
  attachFilterListenersOnce();
  fetchOrdersAndRender();
  ensureModalScaffold();
}


  // Expose init for dashboard.js
  window.initAdminOrders = init;
})();
