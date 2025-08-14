/* Admin Users — controller (observer init + adapter aware) */
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
  function $(sel, root = document) { return root.querySelector(sel); }
  function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
  function text(v) { return (v === null || v === undefined) ? "" : String(v); }
  function escapeHtml(s) { return text(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

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
    // tolerant mapping
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

    // tbody
    els.tbody.innerHTML = rows.length ? rows.map((u, idx) => `
      <tr data-id="${escapeHtml(u.id)}">
        <td>${start + idx + 1}</td>
        <td><a href="#" class="user-view-link">${escapeHtml(u.name || "(no name)")}</a></td>
        <td>${escapeHtml(u.email)}</td>
        <td>${escapeHtml(u.phone)}</td>
        <td>${escapeHtml(u.type)}</td>
        <td>${escapeHtml(u.orders)}</td>
        <td>
          <label class="ws-badge ${u.status === "Active" ? "ws-badge-success" : "ws-badge-muted"}">
            ${escapeHtml(u.status || "Active")}
          </label>
        </td>
        <td>${u.createdAt ? escapeHtml(u.createdAt) : ""}</td>
        <td>
          <button class="ws-btn ws-btn-xs user-view">View</button>
          <button class="ws-btn ws-btn-xs user-edit">Edit</button>
          <button class="ws-btn ws-btn-xs ws-btn-ghost user-delete">Delete</button>
        </td>
      </tr>
    `).join("") : `
      <tr class="ws-empty"><td colspan="9">No users found</td></tr>
    `;

    // info
    const total = filtered.length;
    const end = Math.min(start + rows.length, total);
    els.info.textContent = total ? `${start + 1}–${end} of ${total}` : "0–0 of 0";

    // pager
    renderPager(total);
  }

  function renderPager(total) {
    const { page, per, els } = State;
    const pages = Math.max(1, Math.ceil(total / per));
    if (page > pages) State.page = pages;

    let html = "";
    function btn(p, label, disabled = false, active = false) {
      const cls = ["ws-page-btn", active ? "is-active" : "", disabled ? "is-disabled" : ""].join(" ");
      return `<button class="${cls}" data-page="${p}" ${disabled ? "disabled" : ""}>${label}</button>`;
    }
    html += btn(1, "«", page === 1);
    html += btn(Math.max(1, page - 1), "‹", page === 1);
    const windowSize = 5;
    const start = Math.max(1, page - Math.floor(windowSize / 2));
    const end = Math.min(pages, start + windowSize - 1);
    for (let p = start; p <= end; p++) html += btn(p, p, false, p === page);
    html += btn(Math.min(pages, page + 1), "›", page === pages);
    html += btn(pages, "»", page === pages);

    els.pager.innerHTML = html;
  }

  // --------- Filtering
  function applyFilters() {
    const q = State.els.search.value.trim().toLowerCase();
    const type = State.els.type.value.trim();
    const status = State.els.status.value.trim();

    const f = State.all.filter(u => {
      if (type && u.type !== type) return false;
      if (status && (u.status || "Active") !== status) return false;
      if (q) {
        const hay = `${u.name} ${u.email} ${u.phone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    State.filtered = f;
    State.page = 1;
    render();
  }

  // --------- Event wiring (delegated)
  function wireEvents() {
    const { root, els } = State;

    // Search + filters
    els.searchBtn.addEventListener("click", applyFilters);
    els.clearBtn.addEventListener("click", () => {
      els.search.value = "";
      els.type.value = "";
      els.status.value = "";
      State.page = 1;
      applyFilters();
    });
    els.search.addEventListener("keydown", (e) => {
      if (e.key === "Enter") applyFilters();
    });
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

    // Row actions (future: hook to real modals/endpoints)
    root.addEventListener("click", (e) => {
      if (e.target.closest(".user-view")) {
        e.preventDefault();
        const tr = e.target.closest("tr[data-id]");
        console.log("View user", tr?.dataset.id);
      }
      if (e.target.closest(".user-edit")) {
        e.preventDefault();
        const tr = e.target.closest("tr[data-id]");
        console.log("Edit user", tr?.dataset.id);
      }
      if (e.target.closest(".user-delete")) {
        e.preventDefault();
        const tr = e.target.closest("tr[data-id]");
        console.log("Delete user", tr?.dataset.id);
      }
    });
  }

  // --------- Init
  async function initUsersController() {
    const root = document.getElementById("users-root");
    if (!root) return;
    root.dataset.wsInit = "1"; // idempotency guard

    // cache elements
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

    // per-page default
    State.per = parseInt(State.els.per?.value || "10", 10);

    // fetch users
    const typeParam = State.els.type?.value || "";
    State.all = await fetchUsersViaAdapter(typeParam);
    State.filtered = State.all.slice();

    wireEvents();
    render();
  }

  // auto-init via MutationObserver (survives partial swaps)
    // auto-init via MutationObserver (survives partial swaps)
  function autoInitWhenReady() {
    function tryInitOnce() {
      const root = document.getElementById("users-root");
      if (root && !root.dataset.wsInit) {
        root.dataset.wsInit = "1";
        initUsersController();
      }
    }

    // Try immediately in case the partial is already present
    tryInitOnce();

    // Keep observing forever; do NOT disconnect after the first hit
    const mo = new MutationObserver(() => { tryInitOnce(); });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // Expose globals (compat with older loader)
  window.AdminUsers = { init: initUsersController };
  window.initAdminUsers = initUsersController; // name used in some pages
  window.fetchUsers = initUsersController;     // legacy shim if dashboard expects fetchUsers()

  // kick
  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", autoInitWhenReady)
    : autoInitWhenReady();
})();
