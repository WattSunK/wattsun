// /public/admin/js/dashboard.js
document.addEventListener("DOMContentLoaded", () => {
  const content  = document.getElementById("admin-content") || document.getElementById("adminContent");
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
          user: {
            id: j?.id || j?.user?.id,
            name: j?.name || j?.user?.name || j?.fullName || j?.user?.fullName,
            fullName: j?.fullName || j?.user?.fullName || j?.name || j?.user?.name,
            email: j?.email || j?.user?.email,
            phone: j?.phone || j?.user?.phone,
            role: j?.role || j?.user?.role || j?.type || j?.user?.type || "Customer"
          }
        };
      }
    } catch {}
    return null;
  }

  function setUserCtx(u) {
    document.documentElement.dataset.userRole =
      (u?.user?.role || u?.role || u?.user?.type || u?.type || "").toLowerCase();
  }

  function updateHeaderUser(u) {
    try {
      const info = u?.user || u || {};
      const name = info.fullName || info.name || "User";
      const email = info.email || "";
      const tel = info.phone || "";
      const el = document.getElementById("headerUser");
      if (!el) return;
      const n = el.querySelector(".user-name");
      const m = el.querySelector(".user-meta");
      if (n) n.textContent = name;
      if (m) {
        const meta = [];
        if (email) meta.push(email);
        if (tel) meta.push(tel);
        m.textContent = meta.join(" • ");
      }
    } catch {}
  }

  function setHeaderSearchVisible(show) { if (hdrSearch) hdrSearch.style.display = show ? "" : "none"; }

  // Execute inline <script> tags that arrive with a partial
  function runInlineScripts(root) {
    if (!root) return;
    const scripts = Array.from(root.querySelectorAll("script"));
    for (const old of scripts) {
      const s = document.createElement("script");
      if (old.src) s.src = old.src; else s.textContent = old.textContent || "";
      if (old.type) s.type = old.type;
      old.parentNode.replaceChild(s, old);
    }
  }

  // ---- Orders modal (lazy ensure) ----
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
      <div class="card-body">
        <div class="table-responsive">
          <table id="ordersTable" class="table table-striped">
            <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Total</th><th>Created</th><th>Action</th></tr></thead>
            <tbody id="ordersTbody"><tr><td colspan="6">Loading…</td></tr></tbody>
          </table>
        </div>
      </div>`;
    content.innerHTML = "";
    content.appendChild(card);
    return { table: card.querySelector("#ordersTable"), tbody: card.querySelector("#ordersTbody") };
  }

  function openOrderModal(order) {
    const modal = document.getElementById("orderDetailsModal");
    if (!modal) return;
    modal.style.display = "block";
    (modal.querySelector(".modal-order-number")||{}).textContent = order.orderNumber || order.id || "";
    (modal.querySelector(".modal-customer-name")||{}).textContent = order.fullName || order.name || "";
    (modal.querySelector(".modal-status")||{}).textContent = order.status || "Pending";
    const sel = modal.querySelector("#modal-status"); if (sel) sel.value = order.status || "Pending";
    const notes = modal.querySelector("#modal-notes"); if (notes) notes.value = order.notes || "";

    const close = () => { if (modal) modal.style.display = "none"; };
    const x = modal.querySelector(".close"); if (x && !x._bound) { x._bound = 1; x.addEventListener("click", close); }
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

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
      const res = await fetch(`/api/admin/orders?page=1&per=10&_=${Date.now()}`);
      data = res.ok ? await res.json() : null;
    } catch {}

    const arr = Array.isArray(data?.orders) ? data.orders : Array.isArray(data) ? data : [];
    if (!arr.length) {
      tbody.innerHTML = `<tr><td colspan="6">No orders.</td></tr>`;
      return;
    }

    const frag = document.createDocumentFragment();
    arr.forEach(o => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${o.orderNumber || o.id || ""}</td>
        <td>${o.fullName || o.name || ""}<br><small>${o.email || ""} ${o.phone || ""}</small></td>
        <td>${o.status || "Pending"}</td>
        <td>${(o.total || o.totalCents || 0)}</td>
        <td>${o.createdAt || ""}</td>
        <td><button class="btn btn-sm btn-outline-primary" data-order-id="${o.orderNumber || o.id || ""}">View</button></td>`;
      frag.appendChild(tr);
    });
    tbody.innerHTML = "";
    tbody.appendChild(frag);

    if (!content._ordersClickBound) {
      content._ordersClickBound = true;
      content.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-order-id]");
        if (!btn) return;
        const id = btn.getAttribute("data-order-id");
        const order = arr.find(o => String(o.orderNumber || o.id || "") === id);
        if (order) openOrderModal(order);
      });
    }
  }

  // ---- Hash helpers (NEW) ----
  function sectionFromHash() {
    const h = (location.hash || "").replace(/^#/, "").trim();
    return h || "system-status";
  }

  function setActiveInSidebar(section) {
    if (!sidebar) return;
    const links = sidebar.querySelectorAll("a[data-partial], a[data-section]");
    links.forEach(a => {
      const sect = a.getAttribute("data-partial") || a.getAttribute("data-section");
      if (sect === section) a.classList.add("active");
      else a.classList.remove("active");
    });
  }

  window.addEventListener("hashchange", () => {
    const sect = sectionFromHash();
    setActiveInSidebar(sect);
    loadSection(sect);
  });

  // ---- Section loader ----
  async function loadSection(section) {
    // include "dispatch" so the global header search hides on this tab (NEW)
    const hasOwnSearch = new Set(["orders", "users", "items", "myorders", "dispatch"]);
    setHeaderSearchVisible(!hasOwnSearch.has(section));

    // My Orders → embed the exact customer dashboard page to guarantee parity
    if (section === "myorders") {
      const url = "/myaccount/userdash.html";
      content.innerHTML = `
        <div style="height:calc(100vh - 130px);">
          <iframe id="myorders-embed"
                  src="${url}"
                  style="width:100%;height:100%;border:0;border-radius:8px;background:#fff;"></iframe>
        </div>
      `;
      const iframe = content.querySelector("#myorders-embed");
      // Optional: support postMessage resizes if the embedded page sends them
      window.addEventListener("message", (e) => {
        if (e?.data && e.data.type === "resize-embed" && typeof e.data.height === "number") {
          iframe.style.height = Math.max(300, e.data.height) + "px";
        }
      });
      // My Orders has its own search/filter UI
      setHeaderSearchVisible(false);
      return;
    }

    if (section === "orders") {
      try {
        const res = await fetch(`/partials/orders.html?v=${Date.now()}`);
        content.innerHTML = res.ok ? await res.text() : `<div class="p-3"></div>`;
        runInlineScripts(content);
        window.dispatchEvent(new CustomEvent("admin:partial-loaded", { detail: { name: section }}));
      } catch {
        content.innerHTML = `<div class="p-3"></div>`;
        return;
      }
      try { await populateOrders(); } catch(e) { console.warn("populateOrders failed:", e); }
      return;
    }

    if (section === "profile") {
      try {
        const res = await fetch(`/partials/profile.html?v=${Date.now()}`);
        content.innerHTML = res.ok ? await res.text() : `<div class="p-3"></div>`;
      } catch {
        content.innerHTML = `<div class="p-3"></div>`;
        return;
      }

      (function mountProfile() {
        try {
          const btnSave = content.querySelector("#btnSave");
          const btnCancel = content.querySelector("#btnCancel");
          const btnDeact = content.querySelector("#btnDeactivate");
          if (btnSave && !btnSave._bound) { btnSave._bound=1; btnSave.addEventListener("click", (e)=>{ e.preventDefault(); /* no-op v0.1 */ }); }
          if (btnCancel && !btnCancel._bound) { btnCancel._bound=1; btnCancel.addEventListener("click", (e)=>{ e.preventDefault(); loadSection("profile"); }); }
          if (btnDeact && !btnDeact._bound) { btnDeact._bound=1; btnDeact.addEventListener("click", (e)=>{ e.preventDefault(); alert("Not implemented yet."); }); }
        } catch {}
      })();

      (function populateFromUser() {
        try {
          const u = getUser();
          const info = u?.user || u || {};
          const name  = info.fullName || info.name || "";
          const email = info.email || "";
          const phone = info.phone || "";
          const role  = info.role || info.type || "Customer";
          const last  = info.lastLogin || "—";

          const avatar = content.querySelector("#userAvatar");
          if (avatar) {
            const initial = (name || "U").trim().charAt(0).toUpperCase();
            avatar.textContent = initial || "U";
          }
          const elName  = content.querySelector("#userName");  if (elName)  elName.textContent = name || "User Name";
          const elEmail = content.querySelector("#userEmail"); if (elEmail) elEmail.textContent = email || "";
          const elRole  = content.querySelector("#userRole");  if (elRole)  elRole.textContent  = role;
          const elLast  = content.querySelector("#lastLogin"); if (elLast)  elLast.textContent  = `Last login: ${last}`;

          const pfN = content.querySelector("#pf-name");  if (pfN)  pfN.value  = name;
          const pfE = content.querySelector("#pf-email"); if (pfE) pfE.value = email;
          const pfP = content.querySelector("#pf-phone"); if (pfP) pfP.value = phone;
        } catch {}
      })();

      const u = getUser();
      hydrateProfile(u);
      window.addEventListener("ws:user", ev => hydrateProfile(ev.detail));
      return;
    }

    if (section === "users") {
      try {
        const res = await fetch(`/partials/users.html?v={{Date.now()}}`.replace("{{Date.now()}}", Date.now()));
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

    // Generic partials
    try {
      const res = await fetch(`/partials/${section}.html?v=${Date.now()}`);
      content.innerHTML = res.ok ? await res.text() : `<div class="p-3"></div>`;

      // (NEW) For Dispatch: ensure data-adapter is present before running the partial's inline script.
      if (section === "dispatch" && typeof window.WattSunAdminData === "undefined") {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "/admin/js/data-adapter.js";
          s.onload = resolve;
          s.onerror = reject;
          document.body.appendChild(s);
        }).catch(() => console.warn("Failed to load data-adapter.js"));
      }

      runInlineScripts(content);
      window.dispatchEvent(new CustomEvent("admin:partial-loaded", { detail: { name: section }}));
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
    const elLast  = content.querySelector("#lastLogin");

    if (elName)  elName.textContent  = name;
    if (elEmail) elEmail.textContent = email;
    if (elRole)  elRole.textContent  = role;
    if (elLast)  elLast.textContent  = `Last login: ${last}`;

    const pfN = content.querySelector("#pf-name");
    const pfE = content.querySelector("#pf-email");
    const pfP = content.querySelector("#pf-phone");
    if (pfN) pfN.value = info.fullName || info.name || "";
    if (pfE) pfE.value = email;
    if (pfP) pfP.value = phone;
  }

  // ---- Sidebar nav → partial loader (supports both attributes) ----
  if (sidebar && !sidebar._bound) {
    sidebar._bound = true;
    sidebar.addEventListener("click", (e) => {
      const a = e.target.closest("a[data-partial], a[data-section]");
      if (!a) return;
      e.preventDefault();
      sidebar.querySelectorAll("a").forEach(x => x.classList.remove("active"));
      a.classList.add("active");
      const sect = a.getAttribute("data-partial") || a.getAttribute("data-section");
      // keep URL in sync (NEW)
      location.hash = "#" + sect;
      loadSection(sect);
    });
  }

  // ---- Boot ----
  const u = getUser();
  if (u) { updateHeaderUser(u); setUserCtx(u); }
  setHeaderSearchVisible(true);
  // Start from hash if provided (NEW); otherwise system-status
  const initial = sectionFromHash();
  setActiveInSidebar(initial);
  loadSection(initial);
});
