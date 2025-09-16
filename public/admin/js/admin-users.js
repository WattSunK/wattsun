/* public/admin/js/admin-users.js
   Admin Users — event-driven, auto-discovery wiring (list rendering only, no UI changes)
*/
(function () {
  if (window.__ADMIN_USERS_CONTROLLER__) return;
  window.__ADMIN_USERS_CONTROLLER__ = true;

  const DEBUG = true; // set to false after verification
  const State = { all: [], filtered: [], page: 1, per: 10, root: null, els: {} };

  const esc = (s) => (s == null ? "" : String(s)).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));

  // ---------- Auto-discovery helpers ----------
  function findRoot() {
    // Prefer an explicit wrapper if present
    const byId = document.getElementById("users-root");
    if (byId) return byId;

    // Fallback: locate the Users table's tbody and walk up to a card/container
    const tbody =
      document.querySelector("#usersTbody") ||
      document.querySelector(".card table tbody") ||
      document.querySelector("table tbody");
    if (!tbody) return null;

    const root =
      tbody.closest("#users-root, .card, section, .panel, .box, .content") || document.body;
    return root;
  }

  function looksNumericSelect(sel) {
    if (!sel || sel.tagName !== "SELECT") return false;
    const opts = Array.from(sel.options);
    if (!opts.length) return false;
    // If most options parse as finite integers, treat as per-page select
    const numericCount = opts.reduce((n, o) => (Number.isFinite(parseInt(o.value || o.text, 10)) ? n + 1 : n), 0);
    return numericCount >= Math.max(1, Math.floor(opts.length * 0.6));
  }

  function findControls(root) {
    // Try explicit IDs first, then heuristic fallbacks
    const els = {
      tbody:
        document.querySelector("#usersTbody") ||
        root.querySelector("tbody"),
      search:
        document.querySelector("#usersSearch") ||
        root.querySelector("input[type='search'], input[name='search']"),
      status:
        document.querySelector("#usersStatus") ||
        // first select whose initial option includes "All Status"
        Array.from(root.querySelectorAll("select")).find(s =>
          (s.options[0]?.textContent || "").toLowerCase().includes("all status")
        ) || null,
      type:
        document.querySelector("#usersType") ||
        // first select whose initial option includes "All Types"
        Array.from(root.querySelectorAll("select")).find(s =>
          (s.options[0]?.textContent || "").toLowerCase().includes("all types")
        ) || null,
      per:
        document.querySelector("#usersPer") ||
        Array.from(root.querySelectorAll("select")).find(looksNumericSelect) || null,
      pager:
        document.querySelector("#usersPager") ||
        root.querySelector("[data-users-pager]") || null,
      info:
        document.querySelector("#usersInfo") ||
        root.querySelector("[data-users-info]") || null
    };
    return els;
  }

  // ---------- Endpoint ----------
  const USERS_BASES = ["/api/admin/users", "/api/users", "/admin/users", "/users"];
  let USERS_BASE = null;

  async function resolveUsersBase() {
    if (USERS_BASE) return USERS_BASE;
    USERS_BASE = localStorage.getItem("wsUsersBase") || null;

    async function ok(url) {
      try {
        const r = await fetch(url, { method: "GET", credentials: "include" });
        return r.ok || r.status === 405;
      } catch { return false; }
    }
    for (const base of USERS_BASES) {
      if (await ok(base)) { USERS_BASE = base; localStorage.setItem("wsUsersBase", base); break; }
    }
    USERS_BASE = USERS_BASE || "/api/admin/users";
    return USERS_BASE;
  }

  // ---------- Data ----------
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

  async function fetchList() {
    const base = await resolveUsersBase();
    const per = parseInt(State.els?.per?.value || State.per || 10, 10) || 10;
    const page = 1;
    const url = `${base}?page=${page}&per=${per}`;
    const r = await fetch(url, { credentials: "include" });
    const ct = r.headers.get("content-type") || "";
    const body = ct.includes("json") ? await r.json() : await r.text();

    if (DEBUG) {
      console.log("🧪 [Users] fetch", { url, status: r.status, ct, shape: typeof body === "object" ? Object.keys(body) : "text" });
    }

    let list = [];
    if (Array.isArray(body)) list = body;
    else if (body && typeof body === "object") {
      if (Array.isArray(body.users)) list = body.users;
      else if (body.data && Array.isArray(body.data)) list = body.data;
      else {
        const keys = ["rows", "results", "list", "items"];
        for (const k of keys) { if (Array.isArray(body[k])) { list = body[k]; break; } }
        if (!list.length && body.data && typeof body.data === "object") {
          for (const k of keys) { if (Array.isArray(body.data[k])) { list = body.data[k]; break; } }
        }
      }
    }
    if (DEBUG) console.log("🧪 [Users] parsed length:", list.length);
    return list.map(normalize);
  }

  // ---------- Render ----------
  function rowHtml(u, slno) {
  const badge = (u.status === "Active") ? "badge badge-success" : "badge badge-muted";
  const mk = (p, label, dis = false, act = false) =>
  `<button class="btn btn-xs ${act ? 'btn-primary' : 'btn-light'} ${dis ? 'is-disabled' : ''}"
           data-users-action="page" data-page="${p}" ${dis ? 'disabled' : ''}>${label}</button>`;
  return `
    <tr data-users-row data-user-id="${esc(u.id)}">
      <td>${slno}</td>
      <td><a href="#" class="link" data-users-action="open-edit" data-id="${esc(u.id)}">${esc(u.name || "(no name)")}</a></td>
      <td>${esc(u.email)}</td>
      <td>${esc(u.phone)}</td>
      <td>${esc(u.type)}</td>
      <td>${esc(u.orders)}</td>
      <td><span class="${badge}">${esc(u.status || "Active")}</span></td>
      <td>${u.createdAt ? esc(u.createdAt) : ""}</td>
      <td class="actions">
        <button class="btn btn-xs btn-primary" data-users-action="open-edit" data-id="${esc(u.id)}">View</button>
        <button class="btn btn-xs btn-danger"  data-users-action="deactivate" data-id="${esc(u.id)}">Delete</button>
      </td>
    </tr>`;
}

  function renderPager(total) {
    const { page, per, els } = State;
    const pages = Math.max(1, Math.ceil(total / per));
    if (State.page > pages) State.page = pages;

    if (!els.pager) return;
    const mk = (p, label, dis = false, act = false) =>
      `<button class="ws-page-btn ${act ? "is-active" : ""} ${dis ? "is-disabled" : ""}" data-users-action="page" data-page="${p}" ${dis ? "disabled" : ""}>${label}</button>`;

    let html = "";
    html += mk(1, "«", page === 1);
    html += mk(Math.max(1, page - 1), "‹", page === 1);
    const win = 5, s = Math.max(1, page - Math.floor(win / 2)), e = Math.min(pages, s + win - 1);
    for (let p = s; p <= e; p++) html += mk(p, String(p), false, p === page);
    html += mk(Math.min(pages, page + 1), "›", page === pages);
    html += mk(pages, "»", page === pages);
    els.pager.innerHTML = html;
  }

  function render() {
    const { page, per, filtered, els } = State;
    const start = (page - 1) * per;
    const rows = filtered.slice(start, start + per);

    if (DEBUG) console.log("🧪 [Users] render()", {
      tbodyFound: !!els.tbody, pagerFound: !!els.pager, infoFound: !!els.info,
      page, per, filteredTotal: filtered.length, pageRows: rows.length
    });

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
    const rawQ = (State.els.search?.value || "").trim();
    const rawType = (State.els.type?.value || "").trim();
    const rawStatus = (State.els.status?.value || "").trim();

    const type = (!rawType || /^all\b/i.test(rawType)) ? "" : rawType;
    const status = (!rawStatus || /^all\b/i.test(rawStatus)) ? "" : rawStatus;

    const q = rawQ.toLowerCase();

    State.filtered = State.all.filter(u => {
      if (type && (u.type || "").trim() !== type) return false;
      if (status && (u.status || "Active") !== status) return false;
      if (q) {
        const hay = `${u.name || ""} ${u.email || ""} ${u.phone || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    State.page = 1;
    render();
  }

  // ---------- Events ----------
  function onRootClick(e) {
    if (!State.root?.contains(e.target)) return;
    const actEl = e.target.closest("[data-users-action], a.ws-link"); if (!actEl) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();

    let action = actEl.getAttribute("data-users-action") || "";
    const row = actEl.closest("[data-users-row]");
    const id = actEl.getAttribute("data-id") || row?.getAttribute("data-user-id") || "";
    if (!action && actEl.matches("a.ws-link")) action = "open-edit";

    switch (action) {
      case "open-create": /* next step */ break;
      case "open-edit":   /* next step */ break;
      case "deactivate":  /* next step */ break;
      case "search":      applyFilters(); break;
      case "clear":
        if (State.els.search) State.els.search.value = "";
        if (State.els.type)   State.els.type.value   = State.els.type.options[0]?.value ?? "";
        if (State.els.status) State.els.status.value = State.els.status.options[0]?.value ?? "";
        State.page = 1; applyFilters(); break;
      case "page":
        const p = parseInt(actEl.getAttribute("data-page"), 10);
        if (Number.isFinite(p)) { State.page = p; render(); }
        break;
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
      State.page = 1; render();
    });
  }

  // ---------- Loader ----------
  async function load() {
    const list = await fetchList();
    State.all = Array.isArray(list) ? list : [];
    State.filtered = State.all.slice();

    const perVal = parseInt(State.els.per?.value || "10", 10);
    if (Number.isFinite(perVal)) State.per = perVal;

    if (DEBUG) {
      console.log("🧪 [Users] load()", {
        found: {
          root: !!State.root,
          tbody: !!State.els.tbody,
          type: !!State.els.type,
          status: !!State.els.status,
          search: !!State.els.search,
          per: !!State.els.per,
          pager: !!State.els.pager,
          info: !!State.els.info
        },
        count: State.all.length
      });
    }

    render();
  }

  // ---------- Init (auto-discovery) ----------
  async function init() {
    const root = findRoot();
    if (!root) return; // Nothing to do if even tbody is missing
    if (root.dataset.wsInit === "1") return;

    State.root = root;
    State.els = findControls(root);

    await load();
    wire();

    root.dataset.wsInit = "1";
    console.log("👷 [Users] controller attached (auto-discovered).");
  }

  // Expose to global scope for SPA attach logic
  window.AdminUsers = { init };
  window.UsersState = State;

  // ---------- Activation (robust SPA-safe attach) ----------
(function activateUsersController(){
  // Preferred custom event (if your router emits it)
  document.addEventListener("admin:partial-loaded", (evt) => {
    const name = (evt && evt.detail && (evt.detail.name || evt.detail)) || "";
    if (/users/i.test(String(name))) ensureAttached();
  });

  // Hash and initial page load (covers direct links to #users)
  function tryHashInit() {
    if (location.hash && /#users\b/i.test(location.hash)) ensureAttached();
  }
  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(tryHashInit, 0);
  } else {
    document.addEventListener("DOMContentLoaded", () => setTimeout(tryHashInit, 0));
  }
  window.addEventListener("hashchange", () => setTimeout(tryHashInit, 0));

  // Sidebar clicks (works even if hash doesn't change)
  document.addEventListener("click", (e) => {
    const t = e.target.closest('[data-partial="users"], a[href$="#users"], a[href*="#users"]');
    if (t) setTimeout(ensureAttached, 0);
  }, true);

  // Persistent, very-light DOM watcher that attaches when the Users UI actually appears
  let mo;
  function ensureAttached() {
    // If already attached and root is alive, stop
    if (window.__ADMIN_USERS_ATTACHED__ && UsersState?.root && document.contains(UsersState.root)) return;

    // If the Users DOM is present now, attach immediately
    try {
      const root = (typeof findRoot === "function") ? findRoot() : null;
      if (root) {
        window.AdminUsers?.init();
        window.__ADMIN_USERS_ATTACHED__ = true;
        return;
      }
    } catch (_) {}

    // Otherwise watch for it to show up
    if (mo) mo.disconnect();
    mo = new MutationObserver(() => {
      try {
        const root = (typeof findRoot === "function") ? findRoot() : null;
        if (root) {
          mo.disconnect();
          window.AdminUsers?.init();
          window.__ADMIN_USERS_ATTACHED__ = true;
        }
      } catch (_) {}
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // Safety stop after 8s (keeps it light if user never opens Users)
    setTimeout(() => mo && mo.disconnect(), 8000);
  }

  // If we leave Users (root removed), allow a re-attach next time
  const leaveMo = new MutationObserver(() => {
    if (UsersState?.root && !document.contains(UsersState.root)) {
      window.__ADMIN_USERS_ATTACHED__ = false;
    }
  });
  leaveMo.observe(document.body, { childList: true, subtree: true });

  console.log("🔎 [Users] controller armed (event + hash + click + persistent DOM observer).");
})();
}
)();
