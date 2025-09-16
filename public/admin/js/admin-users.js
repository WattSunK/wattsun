/* Admin Users — scoped, idempotent, event-driven controller (list-only step)
   - Activates ONLY when the Users partial fires `admin:partial-loaded`
   - Renders table rows from /api/admin/users (tolerant to response shapes)
   - No UI/style changes; Add/Edit/Delete wiring kept minimal (next steps)
*/
(function () {
  // Guard against double-loading
  if (window.__ADMIN_USERS_CONTROLLER__) return;
  window.__ADMIN_USERS_CONTROLLER__ = true;

  // ========= State & Utils =========
  const DEBUG = true; // set to false after verification
  const State = {
    all: [],
    filtered: [],
    page: 1,
    per: 10,
    root: null,
    els: {}
  };
  window.UsersState = State; // optional for debugging

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) =>
    (s == null ? "" : String(s)).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m]));

  // ========= Endpoint resolution (non-invasive)
  const USERS_ENDPOINT_CANDIDATES = ["/api/admin/users", "/api/users", "/admin/users", "/users"];
  let USERS_BASE = null;

  async function resolveUsersBase() {
    if (USERS_BASE) return USERS_BASE;
    USERS_BASE = localStorage.getItem("wsUsersBase") || null;

    async function check(url) {
      try {
        const r = await fetch(url, { method: "GET", credentials: "same-origin" });
        // ok (200) or method-not-allowed (405) are enough to accept the base
        if (r.ok || r.status === 405) return true;
      } catch (_) {}
      return false;
    }

    for (const base of USERS_ENDPOINT_CANDIDATES) {
      if (await check(base)) {
        USERS_BASE = base;
        localStorage.setItem("wsUsersBase", base);
        break;
      }
    }

    // Default to admin route even if live probe failed (e.g., 403 when not logged)
    USERS_BASE = USERS_BASE || "/api/admin/users";
    return USERS_BASE;
  }

  // Writes default (kept for later steps; harmless now)
  const USERS_UPDATE_BASE = localStorage.getItem("wsUsersUpdateBase") || "/api/admin/users";
  const USERS_UPDATE_METHOD = (localStorage.getItem("wsUsersUpdateMethod") || "PUT").toUpperCase();

  // ========= Data helpers
  function normalize(u) {
    const created = u.createdAt || u.created_at || u.lastActive || u.last_active || "";
    return {
      id: u.id ?? u.userId ?? u._id ?? "",
      name: u.name ?? u.fullName ?? u.full_name ?? "",
      email: u.email ?? "",
      phone: u.phone ?? u.msisdn ?? "",
      type: u.type ?? u.role ?? "",
      status: u.status ?? "Active",
      createdAt: created,
      orders: Number.isFinite(u.orders) ? u.orders : (u.orderCount ?? u.orders_count ?? 0),
      _raw: u
    };
  }

  // ========= FETCH LIST — tolerant parser
  async function fetchList() {
    const base = await resolveUsersBase();
    const per = parseInt(State.els?.per?.value || State.per || 10, 10) || 10;
    const page = 1;
    const url = `${base}?page=${page}&per=${per}`;

    const r = await fetch(url, { credentials: "same-origin" });
    const ct = r.headers.get("content-type") || "";
    const body = ct.includes("application/json") ? await r.json() : await r.text();

    if (DEBUG) {
      console.log("🧪 [Users] fetch", {
        url,
        status: r.status,
        ct,
        shape: typeof body === "object" ? Object.keys(body) : "text"
      });
    }

    // Accept common shapes: [], {users:[]}, {data:[]}, {rows:[]}, {results:[]}, {list:[]}, {items:[]}, or nested under .data
    let list = [];
    if (Array.isArray(body)) list = body;
    else if (body && typeof body === "object") {
      const keys = ["users", "data", "rows", "results", "list", "items"];
      for (const k of keys) {
        if (Array.isArray(body[k])) {
          list = body[k];
          break;
        }
      }
      if (!list.length && body.data && typeof body.data === "object") {
        for (const k of keys) {
          if (Array.isArray(body.data[k])) {
            list = body.data[k];
            break;
          }
        }
      }
    }

    if (DEBUG) console.log("🧪 [Users] parsed length:", list.length);
    return list.map(normalize);
  }

  // ========= (Later) Create/Update/Deactivate — stubs kept for future steps
  async function createUser(payload) {
    const base = await resolveUsersBase();
    const r = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error(`Create failed ${r.status}`);
    const j = await r.json().catch(() => ({}));
    const user = j.user || (Array.isArray(j.users) ? j.users[0] : j);
    return normalize(user);
  }

  async function updateUser(id, payload) {
    const r = await fetch(`${USERS_UPDATE_BASE}/${encodeURIComponent(id)}`, {
      method: USERS_UPDATE_METHOD,
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error(`Update failed ${r.status}`);
    const j = await r.json().catch(() => ({}));
    const user = j.user || (Array.isArray(j.users) ? j.users[0] : j);
    return normalize(user);
  }

  async function deactivateUser(id) {
    const base = await resolveUsersBase();
    await fetch(`${base}/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ status: "Inactive" })
    });
  }

  // ========= Render
  function rowHtml(u, slno) {
    const badge = (u.status === "Active") ? "ws-badge-success" : "ws-badge-muted";
    return `
      <tr data-users-row data-user-id="${esc(u.id)}">
        <td>${slno}</td>
        <td>
          <a href="#" class="ws-link" data-users-action="open-edit" data-id="${esc(u.id)}">
            ${esc(u.name || "(no name)")}
          </a>
        </td>
        <td>${esc(u.email)}</td>
        <td>${esc(u.phone)}</td>
        <td>${esc(u.type)}</td>
        <td>${esc(u.orders)}</td>
        <td><span class="ws-badge ${badge}">${esc(u.status || "Active")}</span></td>
        <td>${u.createdAt ? esc(u.createdAt) : ""}</td>
        <td class="ws-actions">
          <button class="ws-btn ws-btn-xs ws-btn-primary" data-users-action="open-edit" data-id="${esc(u.id)}">View</button>
          <button class="ws-btn ws-btn-xs ws-btn-ghost" data-users-action="deactivate" data-id="${esc(u.id)}">Delete</button>
        </td>
      </tr>`;
  }

  function renderPager(total) {
    const { page, per, els } = State;
    const pages = Math.max(1, Math.ceil(total / per));
    if (State.page > pages) State.page = pages;

    let html = "";
    const btn = (p, label, dis = false, act = false) =>
      `<button class="ws-page-btn ${act ? "is-active" : ""} ${dis ? "is-disabled" : ""}" data-users-action="page" data-page="${p}" ${dis ? "disabled" : ""}>${label}</button>`;

    html += btn(1, "«", page === 1);
    html += btn(Math.max(1, page - 1), "‹", page === 1);
    const win = 5, s = Math.max(1, page - Math.floor(win / 2)), e = Math.min(pages, s + win - 1);
    for (let p = s; p <= e; p++) html += btn(p, String(p), false, p === page);
    html += btn(Math.min(pages, page + 1), "›", page === pages);
    html += btn(pages, "»", page === pages);

    if (els.pager) els.pager.innerHTML = html;
  }

  function render() {
    const { page, per, filtered, els } = State;
    const start = (page - 1) * per;
    const rows = filtered.slice(start, start + per);

    if (els.tbody) {
      els.tbody.innerHTML = rows.length
        ? rows.map((u, i) => rowHtml(u, start + i + 1)).join("")
        : `<tr class="ws-empty"><td colspan="9">No users found</td></tr>`;
    }

    const total = filtered.length;
    const end = Math.min(start + rows.length, total);
    if (els.info) els.info.textContent = total ? `${start + 1}–${end} of ${total}` : "0–0 of 0";

    renderPager(total);
    window.dispatchEvent(new CustomEvent("users:rendered"));
  }

  function applyFilters() {
    const q = (State.els.search?.value || "").trim().toLowerCase();
    const type = (State.els.type?.value || "").trim();
    const status = (State.els.status?.value || "").trim();

    State.filtered = State.all.filter((u) => {
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

  // ========= Modal skeleton (future steps)
  function mget() {
    const modal = document.getElementById("usersModal");
    return {
      modal,
      title: $("#users-modal-title", modal),
      id: $("#u-id", modal),
      name: $("#u-name", modal),
      email: $("#u-email", modal),
      phone: $("#u-phone", modal),
      type: $("#u-type", modal),
      status: $("#u-status", modal),
      pwd: $("#u-password", modal)
    };
  }
  function openModal(user) {
    const m = mget(); if (!m.modal) return;
    const isNew = !user || !user.id;
    m.title.textContent = isNew ? "Add User" : "Edit User";
    m.id.value = user?.id || "";
    m.name.value = user?.name || "";
    m.email.value = user?.email || "";
    m.phone.value = user?.phone || "";
    m.type.value = user?.type || "";
    m.status.value = user?.status || "Active";
    m.pwd.value = "";
    m.modal.style.display = "";
    m.modal.removeAttribute("aria-hidden");
    setTimeout(() => m.name?.focus(), 10);
  }
  function closeModal() {
    const m = mget(); if (!m.modal) return;
    m.modal.style.display = "none";
    m.modal.setAttribute("aria-hidden", "true");
  }
  async function saveModal() {
    // wired in a later increment
  }

  // ========= Events (scoped)
  function onRootClick(e) {
    if (!State.root?.contains(e.target)) return;
    const actEl = e.target.closest("[data-users-action], a.ws-link");
    if (!actEl) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    let action = actEl.getAttribute("data-users-action") || "";
    const row = actEl.closest("[data-users-row]");
    const id = actEl.getAttribute("data-id") || row?.getAttribute("data-user-id") || "";

    if (!action && actEl.matches("a.ws-link")) action = "open-edit";

    switch (action) {
      case "open-create": openModal(null); break;
      case "open-edit":   openModal(State.all.find((x) => String(x.id) === String(id))); break;
      case "deactivate":
        if (!confirm("Deactivate this user?")) return;
        deactivateUser(id)
          .then(() => {
            const u = State.all.find((x) => String(x.id) === String(id));
            if (u) u.status = "Inactive";
            applyFilters();
          })
          .catch((err) => {
            console.warn("[Users] deactivate failed", err);
            alert("Could not deactivate user.");
          });
        break;
      case "search": applyFilters(); break;
      case "clear":
        if (State.els.search) State.els.search.value = "";
        if (State.els.type)   State.els.type.value   = "";
        if (State.els.status) State.els.status.value = "";
        State.page = 1;
        applyFilters();
        break;
      case "page":
        {
          const p = parseInt(actEl.getAttribute("data-page"), 10);
          if (Number.isFinite(p)) { State.page = p; render(); }
        }
        break;
      case "close": closeModal(); break;
      case "save":  saveModal(); break;
      default: break;
    }
  }

  function wire() {
    const { root, els } = State;
    root.addEventListener("click", onRootClick, true);

    els.search?.addEventListener("keydown", (e) => { if (e.key === "Enter") applyFilters(); });
    els.type?.addEventListener("change", applyFilters);
    els.status?.addEventListener("change", applyFilters);
    els.per?.addEventListener("change", () => {
      State.per = parseInt(els.per.value, 10) || 10;
      State.page = 1;
      render();
    });

    // ESC closes modal (if present)
    document.addEventListener("keydown", (e) => {
      const m = $("#usersModal");
      if (m && m.style.display !== "none" && e.key === "Escape") closeModal();
    });
  }

  // ========= Loader
  async function load() {
    try {
      const list = await fetchList();
      State.all = Array.isArray(list) ? list : [];
      State.filtered = State.all.slice();
      const perVal = parseInt(State.els.per?.value || "10", 10);
      if (Number.isFinite(perVal)) State.per = perVal;
      render();
    } catch (err) {
      console.warn("[Users] load() failed:", err);
      State.all = [];
      State.filtered = [];
      render();
    }
  }

  // ========= Init / Re-init
  async function init() {
    const root = document.getElementById("users-root");
    if (!root) return;
    if (root.dataset.wsInit === "1") return;

    State.root = root;
    State.els = {
      tbody: $("#usersTbody"),
      pager: $("#usersPager"),
      info:  $("#usersInfo"),
      type:  $("#usersType"),
      status: $("#usersStatus"),
      search: $("#usersSearch"),
      per: $("#usersPer"),
      addBtn: $("#btnUsersAdd")
    };

    await load();
    wire();
    root.dataset.wsInit = "1";
    console.log("👷 [Users] controller attached (event-driven, no auto-init).");
  }

  // ========= Event-driven activation (no auto-init, no observers)
  function onPartialLoaded(evt) {
    const name = (evt && evt.detail && (evt.detail.name || evt.detail)) || "";
    if (!/users/i.test(String(name))) return; // only when Users partial is loaded
    init();
  }

  window.AdminUsers = { init }; // optional manual hook
  document.addEventListener("admin:partial-loaded", onPartialLoaded);
  console.log("🔎 [Users] controller armed for admin:partial-loaded (passive).");
})();
