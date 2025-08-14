// /public/js/dashboard.js
document.addEventListener("DOMContentLoaded", () => {
  const content  = document.getElementById("admin-content");
  const sidebar  = document.querySelector(".sidebar nav");
  const hdrSearch= document.querySelector(".header-search");

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
                <th>Total</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="ordersTbody"></tbody>
          </table>
        </div>
      </div>
    `;
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
      save.addEventListener("click", async () => {
        const newStatus = (document.getElementById("modal-status")?.value || "").trim();
        const newNotes  = (document.getElementById("modal-notes")?.value || "").trim();
        try {
          const r = await fetch(`/api/admin/orders/${encodeURIComponent(order.id || order.orderNumber)}`, {
            method: "PATCH",
            headers: { "Content-Type":"application/json" },
            body: JSON.stringify({ status:newStatus, notes:newNotes })
          });
          if (r.ok) {
            close();
            localStorage.setItem("ordersUpdatedAt", String(Date.now()));
            window.postMessage({ type:"orders-updated" }, "*");
          }
        } catch {}
      });
    }
  }

  // ---- Orders population ----
  async function populateOrders() {
    await ensureOrdersModal();
    const { tbody } = ensureOrdersTableShell();
    if (!tbody) return;

    let data = null;
    try {
      const r = await fetch(`/api/orders?page=1&per=10000`);
      if (r.ok) data = await r.json();
    } catch { data = null; }

    const arr = Array.isArray(data?.orders) ? data.orders : (Array.isArray(data) ? data : []);
    tbody.innerHTML = "";
    if (!arr.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 8;
      td.textContent = "No orders found.";
      td.style.textAlign = "center";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    arr.forEach(o => {
      const tr = document.createElement("tr");
      const id = String(o.orderNumber || o.id || "");
      const total = (typeof o.total === "number") ? ("KES " + o.total.toLocaleString()) : (o.totalCents != null ? ("KES " + (o.totalCents/100).toLocaleString()) : "—");
      tr.innerHTML = `
        <td>${id}</td>
        <td>${o.fullName || o.name || "—"}</td>
        <td>${o.phone || "—"}</td>
        <td>${o.email || "—"}</td>
        <td>${o.status || o.orderType || "Pending"}</td>
        <td>${total}</td>
        <td>${o.createdAt ? new Date(o.createdAt).toLocaleString() : "—"}</td>
        <td><button class="btn btn-sm btn-outline-primary" data-order-id="${id}">View</button></td>
      `;
      tbody.appendChild(tr);
    });

    tbody.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button[data-order-id]");
      if (!btn) return;
      const id = btn.getAttribute("data-order-id");
      const order = arr.find(o => String(o.orderNumber || o.id || "") === id);
      if (order) openOrderModal(order);
    });
  }

  // ---- Section loader ----
  async function loadSection(section) {
    const hasOwnSearch = new Set(["orders", "users", "items", "myorders"]);
    setHeaderSearchVisible(!hasOwnSearch.has(section));

    if (section === "orders") {
      try {
        const res = await fetch(`/partials/orders.html?v=${Date.now()}`);
        content.innerHTML = res.ok ? await res.text() : `<div class="p-3"></div>`;
      } catch {
        content.innerHTML = `<div class="p-3"></div>`;
      }
      await populateOrders();
      return;
    }

    if (section === "profile") {
      try {
        const res = await fetch(`/partials/profile.html?v=${Date.now()}`);
        content.innerHTML = res.ok ? await res.text() : `<div class="p-3"></div>`;
      } catch {
        content.innerHTML = `<div class="p-3"></div>`;
      }

      // --- NEW: Try to hydrate from server session/DB, then fall back to local session ---
      (async () => {
        try {
          // Prefer a canonical "me" endpoint if available; otherwise ignore failure
          const resp = await fetch("/api/users/me", { credentials: "include" });
          if (resp.ok) {
            const body = await resp.json();
            const normalized = body && body.user ? body : { success: true, user: body };
            // Save to local session for the rest of the UI and future loads
            setUserCtx(normalized);
            // Update header immediately
            updateHeaderUser(normalized);
            // Note: the existing code below will call hydrateProfile(getUser())
            // which now contains the normalized user.
          }
        } catch (e) {
          // Silently fall back to existing localStorage-based flow
        }
      })();

      const u = getUser();
      hydrateProfile(u);
      window.addEventListener("ws:user", ev => hydrateProfile(ev.detail));
      return;
    }

    if (section === "users") {
      try {
        const res = await fetch(`/partials/users.html?v=${Date.now()}`);
        content.innerHTML = res.ok ? await res.text() : `<div class="p-3"></div>`;
      } catch {
        content.innerHTML = `<div class="p-3"></div>`;
        return;
      }
      if (typeof fetchUsers !== "function") {
        if (!document.querySelector('script[src="/admin/js/users.js"]')) {
          const script = document.createElement("script");
          script.src = "/admin/js/users.js";
          script.onload = () => { if (typeof fetchUsers === "function") fetchUsers(); };
          script.onerror = () => console.error("Failed to load users.js");
          document.body.appendChild(script);
        }
      } else {
        fetchUsers();
      }
      return;
    }

    try {
      const res = await fetch(`/partials/${section}.html?v=${Date.now()}`);
      content.innerHTML = res.ok ? await res.text() : `<div class="p-3"></div>`;
    } catch {
      content.innerHTML = `<div class="p-3"></div>`;
    }
  }

  // ---- Profile hydration (existing) ----
  function hydrateProfile(u) {
    const info = u?.user || u || {};
    const name  = info.name || "User Name";
    const email = info.email || "";
    const phone = info.phone || "";
    const role  = info.role || info.type || "Customer";
    const last  = info.lastLogin || "—";

    const elName  = content.querySelector("#userName");
    const elEmail = content.querySelector("#userEmail");
    const elRole  = content.querySelector("#userRole");
    const elLast  = content.querySelector("#userLastLogin");
    const elAvatar= content.querySelector("#userAvatar");
    if (elName)  elName.textContent  = name;
    if (elEmail) elEmail.textContent = email || (phone ? `${phone}@` : "—");
    if (elRole)  elRole.textContent  = role;
    if (elLast)  elLast.textContent  = `Last login: ${last}`;
    if (elAvatar)elAvatar.textContent = (name || "U").trim().charAt(0).toUpperCase() || "U";
    const fName  = content.querySelector("#pf-name");
    const fEmail = content.querySelector("#pf-email");
    const fPhone = content.querySelector("#pf-phone");
    if (fName)  fName.value  = name || "";
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
            name:  (content.querySelector("#pf-name")?.value || "").trim(),
            email: (content.querySelector("#pf-email")?.value || "").trim(),
            phone: (content.querySelector("#pf-phone")?.value || "").trim(),
            type: role,
            status: u?.user?.status || "Active"
          }
        };
        setUserCtx(nu);
        hydrateProfile(nu);
        alert("Saved locally. (Server save coming soon)");
      });
    }
    if (btnCancel && !btnCancel.dataset.bound) {
      btnCancel.dataset.bound = "1";
      btnCancel.addEventListener("click", () => hydrateProfile(getUser()));
    }
  }

  // ---- Sidebar routing (existing) ----
  if (sidebar && !sidebar.dataset.bound) {
    sidebar.dataset.bound = "1";
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
