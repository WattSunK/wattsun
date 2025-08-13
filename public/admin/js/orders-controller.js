// public/admin/js/orders-controller.js
// Phase 6.5 — polish: admin client guard, status badges unify, inline row updater

(() => {
  // ---- Admin Guard (client) ----
  // Redirect non-admins away from /dashboard.html
  try {
    const sess = JSON.parse(localStorage.getItem("wattsunUser") || "null");
    const role = (sess && (sess.role || sess.user?.role || sess.type)) || "";
    if (String(role).toLowerCase() !== "admin") {
      // Send customers to My Orders (project convention)
      location.replace("/public/myaccount/myorders.html");
      return;
    }
  } catch {
    location.replace("/public/myaccount/myorders.html");
    return;
  }

  // ---- Constants ----
  const ALLOWED_STATUSES = [
    "Pending",
    "Confirmed",
    "Dispatched",
    "Delivered",
    "Closed",
    "Cancelled",
  ]; // from ADR-001. 

  // ---- Namespace ----
  window.AdminOrders = window.AdminOrders || {};

  // ---- Elements ----
  const el = {
    table: document.getElementById("ordersTable"),
    tbody: document.getElementById("ordersTbody"),
    search: document.getElementById("ordersSearch"),
    status: document.getElementById("ordersStatus"), // filter select
    pager: document.getElementById("ordersPager"),
    viewButtonsContainer: document, // delegate
  };

  // ---- Helpers ----
  function statusBadge(s) {
    const v = (s || "").trim();
    const safe = ALLOWED_STATUSES.includes(v) ? v : "Pending";
    const cls =
      safe === "Pending"   ? "badge pending"   :
      safe === "Confirmed" ? "badge confirmed" :
      safe === "Dispatched"? "badge dispatched":
      safe === "Delivered" ? "badge delivered" :
      safe === "Closed"    ? "badge closed"    :
      safe === "Cancelled" ? "badge cancelled" : "badge";
    return `<span class="${cls}" data-status="${safe}">${safe}</span>`;
  }

  function fmtMoneyCents(cents) {
    if (typeof cents !== "number" || !isFinite(cents)) return "KES 0";
    return `KES ${(cents / 100).toLocaleString()}`;
  }

  function normalize(o = {}) {
    return {
      id: o.id || o.orderNumber || o.number || "",
      orderNumber: o.orderNumber || o.id || "",
      fullName: o.fullName || o.name || "—",
      phone: o.phone || "—",
      email: o.email || "—",
      status: o.status || "Pending",
      totalCents: typeof o.totalCents === "number" ? o.totalCents : (typeof o.total === "number" ? Math.round(o.total * 100) : 0),
      createdAt: o.createdAt || o.timestamp || "",
      driverId: o.driverId || o.driverUserId || null,
      driverName: o.driverName || o.driver || null,
      notes: o.notes || "",
      raw: o,
    };
  }

  // ---- Data (simple client-side paging) ----
  const State = { all: [], page: 1, per: 10, q: "", status: "" };

  async function fetchAdminOrders() {
    const url = new URL("/api/admin/orders", location.origin);
    if (State.q) url.searchParams.set("q", State.q);
    if (State.status) url.searchParams.set("status", State.status);
    url.searchParams.set("page", String(State.page));
    url.searchParams.set("per", String(State.per));
    const res = await fetch(url.toString(), { credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    const list = Array.isArray(data?.orders) ? data.orders : (Array.isArray(data) ? data : []);
    State.all = list.map(normalize);
    renderTable();
    renderPager(data?.total || State.all.length);
  }

  function renderTable() {
    if (!el.tbody) return;
    el.tbody.innerHTML = "";
    State.all.forEach(o => {
      const tr = document.createElement("tr");
      tr.setAttribute("data-id", o.id);
      tr.innerHTML = `
        <td class="nowrap">${o.orderNumber || o.id}</td>
        <td>${o.fullName}</td>
        <td class="nowrap">${o.phone}</td>
        <td class="nowrap">${o.email}</td>
        <td class="status-cell">${statusBadge(o.status)}</td>
        <td class="nowrap money">${fmtMoneyCents(o.totalCents)}</td>
        <td class="nowrap">${o.driverName ? o.driverName : "—"}</td>
        <td class="nowrap">${o.createdAt ? new Date(o.createdAt).toLocaleString() : "—"}</td>
        <td class="nowrap">
          <button class="btn btn-sm" data-view="${o.id}">View</button>
          <button class="btn btn-sm btn-primary" data-edit="${o.id}">Edit</button>
        </td>
      `;
      el.tbody.appendChild(tr);
    });
  }

  function renderPager(total) {
    if (!el.pager) return;
    const pages = Math.max(1, Math.ceil(total / State.per));
    const cur = Math.min(State.page, pages);
    State.page = cur;
    el.pager.innerHTML = `
      <button class="pg" data-pg="${Math.max(1, cur - 1)}" ${cur === 1 ? "disabled" : ""}>Prev</button>
      <span>Page ${cur} / ${pages}</span>
      <button class="pg" data-pg="${Math.min(pages, cur + 1)}" ${cur === pages ? "disabled" : ""}>Next</button>
    `;
  }

  // Inline row update hook (used by orders-edit.js after PATCH)
  window.AdminOrders.updateRowInline = function updateRowInline(orderId, patch = {}) {
    const row = el.tbody?.querySelector(`tr[data-id="${CSS.escape(orderId)}"]`);
    if (!row) return;
    if (patch.status) {
      const cell = row.querySelector(".status-cell");
      if (cell) cell.innerHTML = statusBadge(patch.status);
    }
    if (patch.driverName || patch.driverId === null) {
      const cells = row.querySelectorAll("td");
      // driver column is index 6 in our template (0-based)
      const driverCell = cells[6];
      if (driverCell) driverCell.textContent = patch.driverName ? patch.driverName : "—";
    }
  };

  // ---- Events ----
  el.search?.addEventListener("input", () => {
    State.q = el.search.value.trim();
    State.page = 1;
    fetchAdminOrders();
  });

  el.status?.addEventListener("change", () => {
    State.status = el.status.value;
    State.page = 1;
    fetchAdminOrders();
  });

  el.pager?.addEventListener("click", (e) => {
    const btn = e.target.closest(".pg");
    if (!btn) return;
    State.page = parseInt(btn.getAttribute("data-pg") || "1", 10);
    fetchAdminOrders();
  });

  // View / Edit delegations
  el.viewButtonsContainer.addEventListener("click", (e) => {
    const viewBtn = e.target.closest("[data-view]");
    const editBtn = e.target.closest("[data-edit]");
    if (viewBtn) {
      const id = viewBtn.getAttribute("data-view");
      const o = State.all.find(x => String(x.id) === String(id));
      if (o && window.openViewOrder) window.openViewOrder(o);
    } else if (editBtn) {
      const id = editBtn.getAttribute("data-edit");
      const o = State.all.find(x => String(x.id) === String(id));
      if (o && window.openEditOrder) window.openEditOrder(o);
    }
  });

  // ---- Init ----
  fetchAdminOrders();
})();
