/* Admin Users — controller (observer init + adapter aware + namespaced actions) */
(function () {
  const State = {
    all: [],
    filtered: [],
    page: 1,
    per: 10,
    root: null,
    els: {},
  };

  // --------- Utilities
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const T  = (v) => (v == null ? "" : String(v));
  const esc = (s) => T(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  // robust adapter call (accepts array or {success, users})
  async function fetchUsersViaAdapter(type = "") {
    try {
      if (window.WattSunAdminData?.users?.get) {
        const res = await window.WattSunAdminData.users.get({ type });
        const list = Array.isArray(res) ? res : Array.isArray(res?.users) ? res.users : [];
        return list.map(normalizeUser);
      }
    } catch (_) {}
    // Fallbacks
    const url = type ? `/api/users?type=${encodeURIComponent(type)}` : `/api/users`;
    const r = await fetch(url, { credentials: "same-origin" });
    const j = await r.json();
    const list = Array.isArray(j) ? j : Array.isArray(j?.users) ? j.users : [];
    return list.map(normalizeUser);
  }

  function normalizeUser(u) {
    const created = u.createdAt || u.created_at || u.lastActive || null;
    return {
      id: u.id ?? u.userId ?? u._id ?? "",
      name: u.name ?? u.fullName ?? "",
      email: u.email ?? "",
      phone: u.phone ?? "",
      type: u.type ?? u.role ?? "",
      status: u.status ?? "Active",
      createdAt: created,
      orders: Number.isFinite(u.orders) ? u.orders : (u.orderCount ?? 0)
    };
  }

  // --------- Rendering
  function render() {
    const { page, per, filtered, els } = State;
    const start = (page - 1) * per;
    const rows = filtered.slice(start, start + per);

    els.tbody.innerHTML = rows.length ? rows.map((u, idx) => rowHtml(u, start + idx + 1)).join("") :
      `<tr class="ws-empty"><td colspan="9">No users found</td></tr>`;

    // info
    const total = filtered.length;
    const end = Math.min(start + rows.length, total);
    els.info.textContent = total ? `${start + 1}–${end} of ${total}` : "0–0 of 0";

    // pager
    renderPager(total);
  }

  function rowHtml(u, slno) {
    const statusClass = (u.status === "Active") ? "ws-badge-success" : "ws-badge-muted";
    return `
      <tr data-user-id="${esc(u.id)}">
        <td>${slno}</td>
        <td><a href="#" class="ws-link user-link" data-action="open-profile" data-id="${esc(u.id)}">${esc(u.name || "(no name)")}</a></td>
        <td>${esc(u.email)}</td>
        <td>${esc(u.phone)}</td>
        <td>${esc(u.type)}</td>
        <td>${esc(u.orders)}</td>
        <td><span class="ws-badge ${statusClass}">${esc(u.status || "Active")}</span></td>
        <td>${u.createdAt ? esc(u.createdAt) : ""}</td>
        <td class="ws-actions">
          <button class="ws-btn ws-btn-xs" data-action="view-user" data-id="${esc(u.id)}">View</button>
          <button class="ws-btn ws-btn-xs ws-btn-primary" data-action="edit-user" data-id="${esc(u.id)}">Edit</button>
          <button class="ws-btn ws-btn-xs ws-btn-ghost" data-action="delete-user" data-id="${esc(u.id)}">Delete</button>
        </td>
      </tr>
    `;
  }

  function renderPager(total) {
    const { page, per, els } = State;
    const pages = Math.max(1, Math.ceil(total / per));
    if (State.page > pages) State.page = pages;

    let html = "";
    const btn = (p, label, disabled = false, active = false) => {
      const cls = ["ws-page-btn", active ? "is-active" : "", disabled ? "is-disabled" : ""].join(" ");
      return `<button class="${cls}" data-page="${p}" ${disabled ? "disabled" : ""}>${label}</button>`;
    };
    html += btn(1, "«", page === 1);
    html += btn(Math.max(1, page - 1), "‹", page === 1);
    const win = 5;
    const s = Math.max(1, page - Math.floor(win / 2));
    const e = Math.min(pages, s + win - 1);
    for (let p = s; p <= e; p++) html += btn(p, p, false, p === page);
    html += btn(Math.min(pages, page + 1), "›", page === pages);
    html += btn(pages, "»", page === pages);

    els.pager.innerHTML = html;
  }

  // --------- Filtering
  function applyFilters() {
    const q = State.els.search.value.trim().toLowerCase();
    const type = State.els.type.value.trim();
    const status = State.els.status.value.trim();

    State.filtered = State.all.filter(u => {
      if (type && u.type !== type) return false;
      if (status && (u.status || "Active") !== status) return false;
      if (q) {
        const hay = `${u.name} ${u.email} ${u.phone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    State.page = 1;
    render();
  }

  // --------- Actions (namespaced + safe)
  async function onAction(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    // prevent any global listeners (e.g., orders modal) from catching this
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id") || btn.closest("tr")?.dataset?.userId;

    switch (action) {
      case "open-profile":
      case "view-user": {
        // Route to Profile tab and pass the selected user id
        try {
          localStorage.setItem("adminSelectedUserId", id);
        } catch(_) {}
        // switch tab
        location.hash = "#profile";
        // optional: lightweight ping for profile.js to refetch
        window.postMessage({ type: "admin-user-open", userId: id }, "*");
        break;
      }
      case "edit-user": {
        // Placeholder: open profile for edit; later we can load a dedicated modal
        try { localStorage.setItem("adminSelectedUserId", id); } catch(_) {}
        location.hash = "#profile";
        window.postMessage({ type: "admin-user-edit", userId: id }, "*");
        break;
      }
      case "delete-user": {
        const tr = btn.closest("tr");
        if (!id || !confirm("Deactivate this user? (You can re-activate later)")) return;
        try {
          // Soft delete → set status=Inactive (non-destructive)
          const r = await fetch(`/api/users/${encodeURIComponent(id)}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "Inactive" }),
            credentials: "same-origin",
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          // reflect immediately
          const row = State.all.find(u => String(u.id) === String(id));
          if (row) row.status = "Inactive";
          applyFilters();
        } catch (err) {
          alert("Could not deactivate user (endpoint missing). We’ll wire this later.");
          console.warn("[Users] delete-user failed:", err);
        }
        break;
      }
      default:
        // no-op
        break;
    }
  }

  // --------- Event wiring (delegated)
  function wireEvents() {
    const { root, els } = State;

    // Actions (namespaced to users-root to avoid Orders modal handlers)
    root.addEventListener("click", onAction, true);

    // Search + filters
    els.searchBtn.addEventListener("click", applyFilters);
    els.clearBtn.addEventListener("click", () => {
      els.search.value = "";
      els.type.value = "";
      els.status.value = "";
      State.page = 1;
      applyFilters();
    });
    els.search.addEventListener("keydown", (e) => { if (e.key === "Enter") applyFilters(); });
    els.type.addEventListener("change", applyFilters);
    els.status.addEventListener("change", applyFilters);
    els.per.addEventListener("change", () => {
      State.per = parseInt(els.per.value, 10) || 10;
      State.page = 1;
      render();
    });

    // Pager
    els.pager.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-page]");
      if (!b) return;
      const p = parseInt(b.getAttribute("data-page"), 10);
      if (!Number.isFinite(p)) return;
      State.page = p;
      render();
    });

    // Add user (placeholder → go to Profile new-user mode)
    $("#add-user-btn", root)?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { localStorage.removeItem("adminSelectedUserId"); } catch(_) {}
      location.hash = "#profile";
      window.postMessage({ type: "admin-user-create" }, "*");
    });
  }

  // --------- Init
  async function initUsersController() {
    const root = document.getElementById("users-root");
    if (!root) return;

    // idempotency (important when swapping partials)
    if (root.dataset.wsInit === "1") return;
    root.dataset.wsInit = "1";

    State.root = root;
    State.els = {
      tbody: $("#users-table-body", root),
      info: $("#users-table-info", root),
      pager: $("#users-pagination", root),
      search: $("#user-search-input", root),
      searchBtn: $("#user-search-btn", root),
      clearBtn: $("#user-clear-btn", root),
      type: $("#user-type-filter", root),
      status: $("#user-status-filter", root),
      per: $("#users-per-page", root),
    };

    State.per = parseInt(State.els.per?.value || "10", 10);

    const typeParam = State.els.type?.value || "";
    State.all = await fetchUsersViaAdapter(typeParam);
    State.filtered = State.all.slice();

    wireEvents();
    render();
  }

  // keep observing to re-init every time users partial is inserted
  function autoInitWhenReady() {
    const tryInitOnce = () => {
      const root = document.getElementById("users-root");
      if (root && root.dataset.wsInit !== "1") {
        initUsersController();
      }
    };

    tryInitOnce();
    const mo = new MutationObserver(tryInitOnce);
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // Expose globals (loader/shim compatibility)
  window.AdminUsers = { init: initUsersController };
  window.initAdminUsers = initUsersController;
  window.fetchUsers = initUsersController;

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", autoInitWhenReady)
    : autoInitWhenReady();
})();
