/* public/admin/js/admin-users.js
 * Admin — Users controller (SSR-friendly, idempotent, strictly scoped)
 * - Single source of truth for fetch + render (no duplicates)
 * - Snappy client-side pagination, search and filters
 * - Strict DOM scoping to #users-root (no cross-talk with other panes)
 * - Idempotent init/refresh (boot guard + rehydrate)
 * - Namespaced actions so Orders modal can’t hijack our clicks
 */
(() => {
  // ========= Tiny utils
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const T  = v => (v == null ? "" : String(v));
  const esc = s => T(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  const fmtLastActive = iso => {
    if (!iso) return "—";
    // Keep server UTC as-is; this is just visual.
    return iso.replace("T", " ").replace("Z", "Z");
  };

  const once = (fn => {
    let done = false;
    return (...a) => { if (done) return; done = true; fn(...a); };
  });

  // ========= Local state (single source of truth)
  const State = {
    booted: false,
    root: null,
    els: {},
    // data
    all: [],
    filtered: [],
    // ui
    q: "",
    type: "",
    status: "",
    page: 1,
    per: 10,
    // re-entrant guard
    inflight: 0,
  };

  // ========= Endpoint helpers (modern → legacy fallbacks)
  async function hit(method, url, body, headers = {}) {
    const h = { "Content-Type": "application/json", ...headers };
    const res = await fetch(url, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { ok: res.ok, status: res.status, json, text };
  }

  async function getUsersFrom(url) {
    const r = await hit("GET", url);
    if (!r.ok) return null;
    const j = r.json ?? {};
    // Accept several shapes
    const arr =
      Array.isArray(j) ? j :
      Array.isArray(j.users) ? j.users :
      Array.isArray(j.data) ? j.data :
      Array.isArray(j.results) ? j.results : null;
    if (!arr) return null;
    return arr;
  }

  // Normalizer to a canonical user shape used by UI
  function normalizeUser(u, ix = 0) {
    const id     = u.id ?? u.userId ?? u._id ?? u.uid ?? u.msisdn ?? u.phone ?? String(ix + 1);
    const name   = u.name ?? u.fullName ?? u.displayName ?? "—";
    const email  = u.email ?? u.mail ?? "";
    const phone  = u.phone ?? u.msisdn ?? "";
    const type   = u.type ?? u.role ?? "User";
    const status = u.status ?? (u.active === false ? "Inactive" : "Active");
    const lastActive = u.lastActive ?? u.lastLogin ?? u.lastSeen ?? "";
    const orders = u.orders ?? u.ordersCount ?? u.orderCount ?? 0;
    return { id: String(id), name, email, phone, type, status, lastActive, orders };
  }

  async function fetchUsers() {
    // Try modern admin list first, then legacy fallbacks
    const candidates = [
      "/api/admin/users",                             // modern
      "/api/users",                                   // generic
      "/api/user-setup/users",                        // legacy
      "/api/admin/users/list",                        // legacy variant
    ];
    for (const u of candidates) {
      try {
        const arr = await getUsersFrom(u);
        if (arr) {
          console.info("[Users] Loaded from", u, "count=", arr.length);
          return arr.map(normalizeUser);
        }
      } catch (e) {
        console.warn("[Users] Failed", u, e);
      }
    }
    // As a last resort, attempt to recover from localStorage (very defensive)
    try {
      const b = localStorage.getItem("wattsunUser");
      if (b) {
        const j = JSON.parse(b);
        const u = {
          id: j.id || j.user?.id || j.userId || "me",
          name: j.name || j.user?.name || j.fullName || "My Account",
          email: j.email || j.user?.email || "",
          phone: j.phone || j.user?.phone || j.user?.msisdn || "",
          type: j.type || j.user?.type || j.user?.role || "User",
          status: "Active",
          lastActive: "",
          orders: 0
        };
        return [u];
      }
    } catch {}
    return [];
  }

  async function createOrUpdateUser(payload, userId) {
    // Accept both create and update with a cascade of endpoints (modern → legacy)
    const tries = [];

    if (userId) {
      // Update
      tries.push(["PATCH", `/api/admin/users/${encodeURIComponent(userId)}`, payload]);
      tries.push(["PUT",   `/api/admin/users/${encodeURIComponent(userId)}`, payload]);
      tries.push(["POST",  `/api/admin/users/update/${encodeURIComponent(userId)}`, payload]); // legacy
      tries.push(["PATCH", `/api/users/${encodeURIComponent(userId)}`, payload]);              // generic
      tries.push(["PUT",   `/api/users/${encodeURIComponent(userId)}`, payload]);
    } else {
      // Create
      tries.push(["POST", `/api/admin/users`, payload]);
      tries.push(["POST", `/api/users`,       payload]); // generic
      tries.push(["POST", `/api/admin/users/create`, payload]); // legacy
    }

    let lastErr = null;
    for (const [m,u,b] of tries) {
      try {
        const r = await hit(m, u, b);
        if (r.ok && (r.json?.success !== false)) {
          console.info("[Users] Saved via", m, u);
          return r.json || { success: true };
        }
        lastErr = r;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("Save failed (no endpoint accepted)");
  }

  // ========= Rendering (strictly scoped)
  function applyFilters() {
    const q = State.q.trim().toLowerCase();
    const type = State.type;
    const status = State.status;

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
  }

  function slicePage() {
    const start = (State.page - 1) * State.per;
    return State.filtered.slice(start, start + State.per);
  }

  function renderTableRows() {
    const tbody = State.els.tbody;
    if (!tbody) return;

    const rows = slicePage().map((u, i) => {
      const idx = (State.page - 1) * State.per + i + 1;
      const nameLink = `<a href="#users/${esc(u.id)}" class="ws-link user-link" data-action="user.view" data-id="${esc(u.id)}">${esc(u.name)}</a>`;
      const statusPill = `<span class="ws-pill ${u.status === "Active" ? "is-green" : "is-grey"}">${esc(u.status || "Active")}</span>`;
      // No “Edit” button as requested; keep “View” for parity, plus “Delete” placeholder if you wire it later
      const actions =
        `<div class="ws-actions">` +
          `<button class="ws-btn ws-btn-slim" data-action="user.view" data-id="${esc(u.id)}">View</button>` +
          `</div>`;

      return `<tr data-row-id="${esc(u.id)}">
        <td class="ws-col-num">${idx}</td>
        <td class="ws-col-name">${nameLink}</td>
        <td class="ws-col-email">${esc(u.email)}</td>
        <td class="ws-col-phone">${esc(u.phone)}</td>
        <td class="ws-col-type">${esc(u.type)}</td>
        <td class="ws-col-orders">${esc(u.orders ?? 0)}</td>
        <td class="ws-col-status">${statusPill}</td>
        <td class="ws-col-last">${esc(fmtLastActive(u.lastActive))}</td>
        <td class="ws-col-actions">${actions}</td>
      </tr>`;
    });

    tbody.innerHTML = rows.length
      ? rows.join("")
      : `<tr class="ws-empty"><td colspan="9">No users found</td></tr>`;
  }

  function renderPager() {
    const info = State.els.info;
    const pager = State.els.pager;
    const total = State.filtered.length;
    if (!info || !pager) return;

    if (!total) {
      info.textContent = "0–0 of 0";
      pager.innerHTML = "";
      return;
    }

    const start = (State.page - 1) * State.per + 1;
    const end = Math.min(State.page * State.per, total);
    info.textContent = `${start}–${end} of ${total}`;

    const pages = Math.ceil(total / State.per);
    const btn = (p, label = p, disabled = false, current = false) =>
      `<button class="ws-page ${disabled ? "is-disabled" : ""} ${current ? "is-current" : ""}" data-page="${p}" ${disabled ? "disabled" : ""}>${label}</button>`;

    const parts = [];
    parts.push(btn(Math.max(1, State.page - 1), "‹", State.page === 1));
    for (let p = 1; p <= pages; p++) {
      if (p === 1 || p === pages || Math.abs(p - State.page) <= 2) {
        parts.push(btn(p, p, false, p === State.page));
      } else if (parts[parts.length - 1] !== "...") {
        parts.push(`<span class="ws-ellipsis">…</span>`);
      }
    }
    parts.push(btn(Math.min(pages, State.page + 1), "›", State.page === pages));

    pager.innerHTML = parts.join("");
  }

  function render() {
    renderTableRows();
    renderPager();
    // Emit a hook so other scripts can sync if needed
    window.dispatchEvent(new CustomEvent("users:rendered"));
  }

  // ========= Modal (Add / Edit / View)
  function ensureModalHost() {
    let host = $("#users-modal-host", State.root);
    if (!host) {
      host = document.createElement("div");
      host.id = "users-modal-host";
      State.root.appendChild(host);
    }
    return host;
  }

  function closeModal() {
    const m = $("#users-modal");
    if (m) m.remove();
  }

  function openModal({ title = "Edit User", user = null } = {}) {
    ensureModalHost();
    closeModal();

    const isEdit = !!user;
    const name  = user?.name  ?? "";
    const email = user?.email ?? "";
    const phone = user?.phone ?? "";
    const type  = user?.type  ?? "";
    const status = user?.status ?? "Active";

    const html =
`<div class="ws-modal" id="users-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
  <div class="ws-modal__card">
    <div class="ws-modal__header">
      <h3 class="ws-modal__title">${esc(isEdit ? "Edit User" : "Add User")}</h3>
      <button class="ws-btn ws-btn-light" data-action="user.modal.close">Close</button>
    </div>

    <div class="ws-modal__body">
      <div class="ws-form">
        <div class="ws-form__row">
          <label>Name</label>
          <input type="text" id="user-name" class="ws-input" value="${esc(name)}" placeholder="Full name"/>
        </div>
        <div class="ws-form__row">
          <label>Email</label>
          <input type="email" id="user-email" class="ws-input" value="${esc(email)}" placeholder="Email"/>
        </div>
        <div class="ws-form__row">
          <label>Phone</label>
          <input type="text" id="user-phone" class="ws-input" value="${esc(phone)}" placeholder="+2547..."/>
        </div>
        <div class="ws-form__row">
          <label>Type</label>
          <select id="user-type" class="ws-select">
            <option value="">Select…</option>
            <option ${type==="Admin"?"selected":""} value="Admin">Admin</option>
            <option ${type==="Driver"?"selected":""} value="Driver">Driver</option>
            <option ${type==="Customer"?"selected":""} value="Customer">Customer</option>
            <option ${type==="User"?"selected":""} value="User">User</option>
            <option ${type==="Installer"?"selected":""} value="Installer">Installer</option>
            <option ${type==="Manufacturer"?"selected":""} value="Manufacturer">Manufacturer</option>
          </select>
        </div>
        <div class="ws-form__row">
          <label>Status</label>
          <select id="user-status" class="ws-select">
            <option ${status==="Active"?"selected":""} value="Active">Active</option>
            <option ${status==="Inactive"?"selected":""} value="Inactive">Inactive</option>
          </select>
        </div>

        <div class="ws-form__hint">Temp Password (optional for Add): add in “Password” field below only when creating a new user.</div>
        <div class="ws-form__row ${isEdit?"is-hidden":""}">
          <label>Password (optional)</label>
          <input type="password" id="user-pass" class="ws-input" placeholder="Leave blank to auto-generate"/>
        </div>
      </div>
    </div>

    <div class="ws-modal__footer">
      <button class="ws-btn" data-action="user.modal.cancel">Cancel</button>
      <button class="ws-btn ws-btn-primary" data-action="user.modal.save" data-id="${esc(user?.id ?? "")}">
        Save
      </button>
    </div>
  </div>
</div>`;

    $("#users-modal-host", State.root).insertAdjacentHTML("beforeend", html);
  }

  // ========= Events (scoped + namespaced)
  function bindUI() {
    const r = State.root;
    if (!r) return;

    // Search / filters
    State.els.search = $("#users-search", r) || $("#searchUsers", r);
    State.els.type   = $("#user-type-filter", r) || $("#usersType", r);
    State.els.status = $("#users-status-filter", r) || $("#usersStatus", r);
    State.els.per    = $("#users-per", r);
    State.els.tbody  = $("#users-table-body", r) || $("#usersTbody", r);
    State.els.info   = $("#users-table-info", r) || $("#usersInfo", r);
    State.els.pager  = $("#users-pagination", r) || $("#usersPager", r);
    State.els.addBtn = $("#add-user-btn", r) || $("#addUserBtn", r);

    // Input handlers (debounced search)
    if (State.els.search) {
      let t = null;
      State.els.search.addEventListener("input", () => {
        clearTimeout(t);
        t = setTimeout(() => {
          State.q = State.els.search.value || "";
          applyFilters();
          render();
        }, 120);
      });
    }
    if (State.els.type) {
      State.els.type.addEventListener("change", () => {
        State.type = State.els.type.value || "";
        applyFilters(); render();
      });
    }
    if (State.els.status) {
      State.els.status.addEventListener("change", () => {
        State.status = State.els.status.value || "";
        applyFilters(); render();
      });
    }
    if (State.els.per) {
      State.els.per.addEventListener("change", () => {
        const v = parseInt(State.els.per.value, 10);
        State.per = isNaN(v) ? 10 : Math.max(5, v);
        State.page = 1;
        render();
      });
    }
    if (State.els.pager) {
      State.els.pager.addEventListener("click", (e) => {
        const b = e.target.closest("[data-page]");
        if (!b) return;
        const p = parseInt(b.dataset.page, 10);
        if (!isNaN(p) && p !== State.page) { State.page = p; render(); }
      });
    }

    // Table actions — namespaced
    r.addEventListener("click", async (e) => {
      const a = e.target.closest("[data-action]");
      if (!a) return;
      const action = a.dataset.action;

      // prevent Orders modal hijack
      if (/^order\./.test(action)) return;

      if (action === "user.view") {
        e.preventDefault();
        const id = a.dataset.id || a.closest("tr")?.dataset.rowId;
        const u = State.all.find(x => x.id === id);
        openModal({ title: "Edit User", user: u });
        return;
      }

      if (action === "user.modal.close" || action === "user.modal.cancel") {
        closeModal();
        return;
      }

      if (action === "user.modal.save") {
        const id = a.dataset.id || "";
        const host = $("#users-modal");
        const name  = $("#user-name")?.value?.trim();
        const email = $("#user-email")?.value?.trim();
        const phone = $("#user-phone")?.value?.trim();
        const type  = $("#user-type")?.value || "";
        const status= $("#user-status")?.value || "Active";
        const pass  = $("#user-pass")?.value?.trim();

        const payload = { name, email, phone, type, status };
        if (!id && pass) payload.password = pass;

        try {
          a.disabled = true;
          const res = await createOrUpdateUser(payload, id || null);
          // Optimistic refresh of row in memory
          if (id) {
            const idx = State.all.findIndex(x => x.id === id);
            if (idx >= 0) State.all[idx] = { ...State.all[idx], ...payload };
          } else {
            // best-effort append (id may be returned)
            const newId = res?.user?.id || res?.id || Math.random().toString(36).slice(2);
            State.all.unshift(normalizeUser({ id: newId, ...payload, orders: 0 }));
          }
          applyFilters(); render();
          closeModal();
          // Signal other tabs/pages if they show users
          try { localStorage.setItem("usersUpdatedAt", String(Date.now())); } catch {}
        } catch (err) {
          console.error("[Users] Save failed", err);
          const msg = err?.json?.error?.message || err?.text || err?.message || "Save failed. Check the endpoint and try again.";
          alert(msg);
        } finally {
          a.disabled = false;
        }
        return;
      }
    });

    // Add button
    if (State.els.addBtn) {
      State.els.addBtn.addEventListener("click", () => openModal({ title: "Add User", user: null }));
    }
  }

  // ========= Init / refresh (idempotent)
  async function refresh() {
    if (State.inflight) return; // avoid duplicate fetch
    State.inflight++;
    try {
      State.all = await fetchUsers();
      State.q = State.els.search?.value || "";
      State.type = State.els.type?.value || "";
      State.status = State.els.status?.value || "";
      State.per = parseInt(State.els.per?.value || "10", 10) || 10;
      applyFilters();
      render();
    } finally {
      State.inflight = Math.max(0, State.inflight - 1);
    }
  }

  function locateRoot() {
    const root = $("#users-root") || $("#users");
    State.root = root || document.createElement("div");
    if (!root) console.warn("[Users] #users-root not found; controller loaded but detached.");
    return !!root;
  }

  const boot = once(() => {
    if (!locateRoot()) return;        // defer until partial is present
    bindUI();
    refresh();
  });

  // ========= Activate on:
  // 1) DOM ready (if partial present)
  document.addEventListener("DOMContentLoaded", () => boot());
  // 2) Hash change to #users pane
  window.addEventListener("hashchange", () => {
    if (location.hash.includes("users")) boot();
  });
  // 3) When your partial loader announces users pane
  window.addEventListener("admin:partial-loaded", (e) => {
    if ((e?.detail || "") === "users") boot();
  });
})();
