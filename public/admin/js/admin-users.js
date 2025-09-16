/* public/admin/js/admin-users.js
   Admin Users — lean, evidence-first controller
   - Fresh init on each "users" partial load
   - Strict DOM scoping (never touches modals)
   - No observers/polling; no console by default
   - Opt-in debug: localStorage.dbgUsers="1"
*/
(function () {
  const DBG = String(localStorage.getItem("dbgUsers")) === "1";
  const dlog = (...args) => { if (DBG) console.debug("[users]", ...args); };

  // Single exported API (re-bound each time)
  window.AdminUsers = window.AdminUsers || {};

  // ----- Small utilities -----
  const esc = (s) =>
    s == null
      ? ""
      : String(s).replace(/[&<>"']/g, (m) =>
          ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
        );
  const txt = (el) => (el?.textContent || "").trim();
  const hasTxt = (el, q) => txt(el).toLowerCase().includes(String(q).toLowerCase());
  const theadHas = (thead, labels) => {
    if (!thead) return false;
    const ths = Array.from(thead.querySelectorAll("th")).map((th) => txt(th).toLowerCase());
    return labels.every((lbl) => ths.some((t) => t.includes(lbl.toLowerCase())));
  };

  // ----- Endpoint resolution (idempotent) -----
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
      if (await ok(base)) {
        USERS_BASE = base;
        localStorage.setItem("wsUsersBase", base);
        break;
      }
    }
    USERS_BASE = USERS_BASE || "/api/admin/users";
    dlog("endpoint:", USERS_BASE);
    return USERS_BASE;
  }

  // ----- DOM discovery (strictly scoped to Users card) -----
  function findRoot() {
    // 1) Explicit hooks if present
    const byId = document.getElementById("users-root");
    if (byId) return byId;
    const byData = document.querySelector('[data-module="users"]');
    if (byData) return byData;

    // 2) Heuristic: container with heading "Users" and a table with Users columns
    const candidates = Array.from(
      document.querySelectorAll(
        'section,div.card,div.panel,div.block,div[data-partial="users"],div[role="region"]'
      )
    );
    for (const c of candidates) {
      const heading = c.querySelector("h1, h2, h3, .card-title, .header, .title, [data-title]");
      if (!heading || !hasTxt(heading, "users")) continue;
      const tbl = c.querySelector("table");
      if (!tbl) continue;
      const thead = tbl.tHead || tbl.querySelector("thead");
      if (theadHas(thead, ["sl"]) && theadHas(thead, ["name", "email"]) &&
          (theadHas(thead, ["last active"]) || theadHas(thead, ["orders"]))) {
        return c;
      }
    }
    return null;
  }

  function findControls(root) {
    // Choose the Users table by thead signature, not the first <table>
    const table = (function () {
      const explicit =
        root.querySelector(".users-table") ||
        root.querySelector("table.users-table") ||
        root.querySelector('table[data-users="1"]');
      if (explicit) return explicit;

      const tables = Array.from(root.querySelectorAll("table"));
      return tables.find((t) => {
        const th = t.tHead || t.querySelector("thead");
        return th && theadHas(th, ["sl"]) && theadHas(th, ["name"]) &&
          (theadHas(th, ["last active"]) || theadHas(th, ["orders"]));
      }) || null;
    })();

    return {
      root,
      table,
      tbody: table ? (table.tBodies[0] || table.querySelector("tbody")) : null,
      search:
        root.querySelector("#usersSearch") ||
        root.querySelector("[data-users-search]") ||
        root.querySelector('input[type="search"]') ||
        root.querySelector('input[name="search"]'),
      status:
        root.querySelector("#usersStatus") ||
        root.querySelector("[data-users-status]"),
      type:
        root.querySelector("#usersType") ||
        root.querySelector("[data-users-type]"),
      per:
        root.querySelector("#usersPer") ||
        root.querySelector("[data-users-per]") ||
        root.querySelector('select[name="per"]'),
      pager:
        root.querySelector("#usersPager") ||
        root.querySelector("[data-users-pager]"),
      info:
        root.querySelector("#usersInfo") ||
        root.querySelector("[data-users-info]"),
    };
  }

  // ----- Data layer -----
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
      _raw: u,
    };
  }

  async function fetchUsers(per = 10) {
    const base = await resolveUsersBase();
    const url = `${base}?page=1&per=${per}`;
    const r = await fetch(url, { credentials: "include" });
    const ct = r.headers.get("content-type") || "";
    const body = ct.includes("json") ? await r.json() : await r.text();

    let list = [];
    if (Array.isArray(body)) list = body;
    else if (body && typeof body === "object") {
      list =
        body.users || (body.data && body.data.items) || body.data || body.rows ||
        body.results || body.list || body.items || [];
    }
    const normalized = (Array.isArray(list) ? list : []).map(normalize);
    dlog("fetched:", normalized.length);
    return normalized;
  }

  // ----- Renderer -----
  function rowHtml(u, slno) {
    const badge = u.status === "Active" ? "badge badge-success" : "badge badge-muted";
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
          <button class="btn btn-sm btn-outline" data-users-action="open-edit" data-id="${esc(u.id)}">View</button>
          <button class="btn btn-sm btn-outline danger" data-users-action="deactivate" data-id="${esc(u.id)}">Delete</button>
        </td>
      </tr>`;
  }

  function renderTable(tbody, rows, page, per, info, pager) {
    const start = (page - 1) * per;
    const slice = rows.slice(start, start + per);
    if (tbody) {
      tbody.innerHTML = slice.length
        ? slice.map((u, i) => rowHtml(u, start + i + 1)).join("")
        : `<tr class="ws-empty"><td colspan="9">No users found</td></tr>`;
    }

    const total = rows.length;
    const end = Math.min(start + slice.length, total);
    if (info) info.textContent = total ? `${start + 1}–${end} of ${total}` : "0–0 of 0";

    if (pager) {
      const pages = Math.max(1, Math.ceil(total / per));
      const mk = (p, label, dis = false, act = false) =>
        `<button class="btn btn-sm ${act ? "btn-outline" : "btn-light"} ${dis ? "is-disabled" : ""}"
           data-users-action="page" data-page="${p}" ${dis ? "disabled" : ""}>${label}</button>`;
      let html = "";
      html += mk(1, "«", page === 1);
      html += mk(Math.max(1, page - 1), "‹", page === 1);
      const win = 5, s = Math.max(1, page - Math.floor(win / 2)), e = Math.min(pages, s + win - 1);
      for (let p = s; p <= e; p++) html += mk(p, String(p), false, p === page);
      html += mk(Math.min(pages, page + 1), "›", page === pages);
      html += mk(pages, "»", page === pages);
      pager.innerHTML = html;
    }
  }

  // ----- Controller instance (rebuilt each partial-load) -----
  function createController() {
    let els = null;
    let rows = [];
    let page = 1;
    let per = 10;
    let root = null;

    function applyFilters() {
      const q = (els.search?.value || "").trim().toLowerCase();
      const t = (els.type?.value || "").trim();
      const s = (els.status?.value || "").trim();
      const type = !t || /^all\b/i.test(t) ? "" : t;
      const status = !s || /^all\b/i.test(s) ? "" : s;

      const filtered = rows.filter((u) => {
        if (type && (u.type || "").trim() !== type) return false;
        if (status && (u.status || "Active") !== status) return false;
        if (q) {
          const hay = `${u.name || ""} ${u.email || ""} ${u.phone || ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      renderTable(els.tbody, filtered, page, per, els.info, els.pager);
      return filtered.length;
    }

    async function load() {
      if (!els.tbody) { dlog("no tbody; abort load"); return; }
      per = parseInt(els.per?.value || "10", 10) || 10;
      rows = await fetchUsers(per);
      page = 1;
      applyFilters();
    }

    function onClick(e) {
      if (!root.contains(e.target)) return;
      const a = e.target.closest("[data-users-action], a.link");
      if (!a) return;
      e.preventDefault();
      const act = a.getAttribute("data-users-action") || (a.matches("a.link") ? "open-edit" : "");
      if (act === "page") {
        const p = parseInt(a.getAttribute("data-page"), 10);
        if (Number.isFinite(p)) { page = p; applyFilters(); }
      } else if (act === "deactivate") {
        // (Wire actual DELETE later—kept minimal for this pass)
        const row = a.closest("[data-users-row]");
        if (row) row.remove();
      }
    }

    function wire() {
      if (!root) return;
      root.addEventListener("click", onClick, true);
      els.search && els.search.addEventListener("keydown", (e) => { if (e.key === "Enter") applyFilters(); });
      els.type && els.type.addEventListener("change", () => { page = 1; applyFilters(); });
      els.status && els.status.addEventListener("change", () => { page = 1; applyFilters(); });
      els.per && els.per.addEventListener("change", () => { page = 1; load(); });
    }

    function teardown() {
      if (!root) return;
      root.removeEventListener("click", onClick, true);
    }

    async function init() {
      root = findRoot();
      if (!root) { dlog("root not found"); return; }
      els = findControls(root);
      if (!els.table || !els.tbody) { dlog("users table not found"); return; }

      dlog("init on users partial");
      wire();
      await load();

      // evidence hooks (dbg only)
      if (DBG) {
        const rowsNow = els.tbody.querySelectorAll("tr").length;
        dlog("after load rows in DOM:", rowsNow);
      }
    }

    return { init, teardown };
  }

  // ----- Fresh boot on each Users partial load -----
  let ctrl = null;
  async function bootFresh() {
    if (ctrl) try { ctrl.teardown(); } catch {}
    ctrl = createController();
    await ctrl.init();
  }

  // Try immediate boot if Users is already present
  bootFresh().catch(() => {});

  // Router signal
  document.addEventListener("admin:partial-loaded", (evt) => {
    const name = (evt && evt.detail && (evt.detail.name || evt.detail)) || "";
    if (/users/i.test(String(name))) bootFresh();
  });

  // Direct hash/tab navigations
  function tryHash() {
    if (location.hash && /#users\b/i.test(location.hash)) bootFresh();
  }
  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(tryHash, 0);
  } else {
    document.addEventListener("DOMContentLoaded", () => setTimeout(tryHash, 0));
  }
  window.addEventListener("hashchange", () => setTimeout(tryHash, 0));
})();
