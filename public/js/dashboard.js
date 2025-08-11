// /public/js/dashboard.js — stable legacy Orders loader (creates table if missing)
document.addEventListener("DOMContentLoaded", () => {
  const content = document.getElementById("admin-content");
  const sidebar = document.querySelector(".sidebar nav");
  const hdrSearch = document.querySelector(".header-search");

  // ---- Session helpers ----
  function getUser() {
    const a = localStorage.getItem("wattsunUser");
    const b = localStorage.getItem("ws_user");
    try { if (a) return JSON.parse(a); } catch {}
    try {
      if (b) {
        const j = JSON.parse(b);
        return {
          success: true,
          user: { name: j.name || "", phone: j.phone || "", type: j.type || "", status: j.status || "" }
        };
      }
    } catch {}
    return null;
  }
  function setUserCtx(u) {
    if (!u) return;
    try { localStorage.setItem("wattsunUser", JSON.stringify(u)); } catch {}
    const phone = u?.user?.phone || u?.phone || u?.user?.msisdn || "";
    if (phone) { try { localStorage.setItem("ws_user", JSON.stringify({ phone })); } catch {} }
    window.dispatchEvent(new CustomEvent("ws:user", { detail: u }));
  }
  function updateHeaderUser(u) {
    const el = document.querySelector(".header-user");
    if (!el) return;
    const info = u?.user || u || {};
    const name = info.name || "Admin";
    const phone = info.phone || "";
    el.textContent = `👤 ${name}${phone ? " · " + phone : ""}`;
  }

  // ---- UI helpers ----
  function setHeaderSearchVisible(show) { if (hdrSearch) hdrSearch.style.display = show ? "" : "none"; }

  async function ensureOrdersModal() {
    if (document.getElementById("orderDetailsModal")) return;
    try {
      const r = await fetch(`/partials/orders-modal.html?v=${Date.now()}`);
      if (r.ok) {
        const html = await r.text();
        const div = document.createElement("div");
        div.innerHTML = html;
        document.body.appendChild(div);
      }
    } catch {}
    const modal = document.getElementById("orderDetailsModal");
    if (modal) modal.style.display = "none";
  }

  function ensureOrdersTableShell() {
    let table = content.querySelector("#ordersTable") || content.querySelector("table");
    if (table) {
      let tbody = table.querySelector("#ordersTbody") || table.querySelector("tbody");
      if (!tbody) {
        tbody = document.createElement("tbody");
        tbody.id = "ordersTbody";
        table.appendChild(tbody);
      }
      return { table, tbody };
    }

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-header" style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:#fff;border-bottom:1px solid #f0f0f0">
        <h2 style="margin:0;font-size:18px;font-weight:600">Orders</h2>
      </div>
      <div class="card-body" style="padding:0 12px 12px">
        <div class="table-responsive">
          <table class="table" id="ordersTable" style="width:100%">
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
            <tbody id="ordersTbody"></tbody>
          </table>
        </div>
      </div>`;
    content.appendChild(card);

    const tableEl = card.querySelector("#ordersTable");
    const tbodyEl = card.querySelector("#ordersTbody");
    return { table: tableEl, tbody: tbodyEl };
  }

  function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

  function openOrderModal(order) {
    const id = String(order.orderNumber || order.id || "");
    setText("modal-order-id", id);
    setText("modal-customer-name", order.fullName || order.name || "—");
    setText("modal-phone", order.phone || "—");
    setText("modal-email", order.email || "—");
    setText("modal-payment-method", order.paymentType || order.paymentMethod || "—");
    setText("modal-amount", (typeof order.total === "number") ? ("KES " + order.total.toLocaleString()) : "—");
    setText("modal-deposit", order.deposit == null ? "—" : String(order.deposit));

    const sel = document.getElementById("modal-status");
    if (sel) sel.value = order.status || order.orderType || "Pending";

    const list = document.getElementById("modal-items-list");
    if (list) {
      list.innerHTML = "";
      const items = Array.isArray(order.cart) ? order.cart : (order.items || []);
      items.forEach(it => {
        const li = document.createElement("li");
        const qty = (it.quantity != null && it.quantity !== "") ? ` x ${it.quantity}` : "";
        li.textContent = `${it.name || ""}${qty}`;
        list.appendChild(li);
      });
    }

    const modal = document.getElementById("orderDetailsModal");
    if (modal) modal.style.display = "block";

    const close = () => { if (modal) modal.style.display = "none"; };
    const c1 = document.getElementById("closeOrderModal");
    const c2 = document.getElementById("closeOrderModalBtn");
    if (c1 && !c1._bound) { c1._bound = 1; c1.addEventListener("click", close); }
    if (c2 && !c2._bound) { c2._bound = 1; c2.addEventListener("click", close); }

    const save = document.getElementById("updateOrderStatusBtn");
    if (save && !save._bound) {
      save._bound = 1;
      save.addEventListener("click", () => {
        const newStatus = document.getElementById("modal-status")?.value || "Pending";
        fetch("/api/update-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: id, status: newStatus })
        })
          .then(r => r.json())
          .then(j => {
            if (!j || !(j.ok || j.success)) throw new Error(j?.error || "Update failed");
            close();
            populateOrders();
          })
          .catch(e => {
            console.error(e);
            alert("Failed to update: " + e.message);
          });
      });
    }
  }

  async function populateOrders() {
    const { tbody } = ensureOrdersTableShell();
    if (!tbody) return;
    await ensureOrdersModal();

    let arr = [];
    try {
      const j = await fetch("/api/orders").then(r => r.json());
      arr = Array.isArray(j) ? j : (Array.isArray(j.orders) ? j.orders : []);
    } catch (e) {
      console.error("Failed to fetch /api/orders", e);
      return;
    }

    const rows = arr.map(o => {
      const id = String(o.orderNumber || o.id || "");
      const name = o.fullName || o.name || "";
      const phone = o.phone || "—";
      const email = o.email || "—";
      const status = o.status || o.orderType || "Pending";
      const pm = o.paymentType || o.paymentMethod || "—";
      const total = (typeof o.total === "number") ? ("KES " + o.total.toLocaleString()) : "—";
      return `
        <tr>
          <td>${id}</td>
          <td>${name}</td>
          <td>${phone}</td>
          <td>${email}</td>
          <td>${status}</td>
          <td>${pm}</td>
          <td>${total}</td>
          <td><button type="button" class="btn btn-sm btn-outline-secondary view-btn" data-id="${id}">View</button></td>
        </tr>`;
    }).join("");

    tbody.innerHTML = rows;

    tbody.querySelectorAll(".view-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const order = arr.find(o => String(o.orderNumber || o.id || "") === id);
        if (order) openOrderModal(order);
      });
    });
  }

  // ---- Section loader ----
  async function loadSection(section) {
    const hasOwnSearch = new Set(["orders", "users", "items", "myorders"]);
    setHeaderSearchVisible(!hasOwnSearch.has(section));

    try {
      // special case: users section needs to load partial first
      if (section === "users") {
        try {
          const res = await fetch(`/partials/users.html?v=${Date.now()}`);
          content.innerHTML = res.ok ? await res.text() : `<div class="p-3">Users view failed to load.</div>`;
        } catch (err) {
          console.error("Failed to load users partial:", err);
          content.innerHTML = `<div class="p-3">Error loading users view.</div>`;
          return;
        }
        if (typeof fetchAndRenderUsers !== "function") {
          if (!document.querySelector('script[src="/admin/js/admin-users.js"]')) {
            const script = document.createElement("script");
            script.src = "/admin/js/admin-users.js";
            script.onload = () => {
              if (typeof fetchAndRenderUsers === "function") {
                fetchAndRenderUsers();
              } else {
                console.error("fetchAndRenderUsers not found after loading admin-users.js");
              }
            };
            script.onerror = () => console.error("Failed to load admin-users.js");
            document.body.appendChild(script);
          }
        } else {
          fetchAndRenderUsers();
        }
        return;
      }

      // default partial load
      const res = await fetch(`/partials/${section}.html?v=${Date.now()}`);
      content.innerHTML = res.ok ? await res.text() : `<div class="p-3"></div>`;

      if (section === "orders") {
        await populateOrders();
        return;
      }

      if (section === "profile") {
        const u = getUser();
        hydrateProfile(u);
        window.addEventListener("ws:user", ev => hydrateProfile(ev.detail));
        return;
      }

    } catch (e) {
      console.error("Section init error:", e);
    }
  }

  // ---- Profile mapping ----
  function hydrateProfile(u) {
    const info = u?.user || u || {};
    const name = info.name || "User";
    const email = info.email || "";
    const role = info.type || "Customer";
    const phone = info.phone || info.msisdn || "";
    const last = info.lastLogin || info.updatedAt || info.createdAt || "—";

    const elName = content.querySelector("#userName");
    const elEmail = content.querySelector("#userEmail");
    const elRole = content.querySelector("#userRole");
    const elLast = content.querySelector("#lastLogin");
    const elAvatar = content.querySelector("#userAvatar");
    if (elName) elName.textContent = name;
    if (elEmail) elEmail.textContent = email || (phone ? `${phone}@` : "—");
    if (elRole) elRole.textContent = role;
    if (elLast) elLast.textContent = `Last login: ${last}`;
    if (elAvatar) elAvatar.textContent = (name || "U").trim().charAt(0).toUpperCase() || "U";

    const fName = content.querySelector("#pf-name");
    const fEmail = content.querySelector("#pf-email");
    const fPhone = content.querySelector("#pf-phone");
    if (fName) fName.value = name || "";
    if (fEmail) fEmail.value = email || "";
    if (fPhone) fPhone.value = phone || "";

    const btnSave = content.querySelector("#btnSave");
    const btnCancel = content.querySelector("#btnCancel");
    if (btnSave && !btnSave.dataset.bound) {
      btnSave.dataset.bound = "1";
      btnSave.addEventListener("click", () => {
        const nu = {
          ...(u || { success: true }),
          user: {
            ...(u?.user || {}),
            name: (content.querySelector("#pf-name")?.value || "").trim(),
            email: (content.querySelector("#pf-email")?.value || "").trim(),
            phone: (content.querySelector("#pf-phone")?.value || "").trim(),
            type: role,
            status: u?.user?.status || "Active"
          }
        };
        setUserCtx(nu);
        hydrateProfile(nu);
        updateHeaderUser(nu);
        alert("Profile saved locally.");
      });
    }
    if (btnCancel && !btnCancel.dataset.bound) {
      btnCancel.dataset.bound = "1";
      btnCancel.addEventListener("click", () => hydrateProfile(getUser()));
    }
  }

  // ---- Router ----
  if (sidebar) {
    sidebar.addEventListener("click", (e) => {
      const a = e.target.closest("a[data-section]");
      if (!a) return;
      e.preventDefault();
      sidebar.querySelectorAll("a").forEach(x => x.classList.remove("active"));
      a.classList.add("active");
      loadSection(a.getAttribute("data-section"));
    });
  }

  // ---- Boot ----
  const u = getUser();
  if (u) { updateHeaderUser(u); setUserCtx(u); }
  setHeaderSearchVisible(true);
  loadSection("system-status");
});
