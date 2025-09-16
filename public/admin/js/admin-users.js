/* public/admin/js/admin-users.js
   Admin Users — event-driven, auto-discovery wiring (list rendering only; quiet)
*/
(function () {
  if (window.__ADMIN_USERS_CONTROLLER__) return;
  window.__ADMIN_USERS_CONTROLLER__ = true;

  // ---------------- State ----------------
  const State = { all: [], filtered: [], page: 1, per: 10, root: null, els: {} };

  const esc = (s) => (s == null ? "" : String(s)).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));

  // ---------------- Auto-discovery ----------------
  function findRoot() {
    const byId = document.getElementById("users-root");
    if (byId) return byId;

    // Prefer a wrapper with Users header + table
    const cards = Array.from(document.querySelectorAll("section, .card, .panel, .block, [data-partial='users']"));
    for (const c of cards) {
      const heading = c.querySelector("h1,h2,h3,.card-title,.header,.title,[data-title]");
      if (!heading || !/users/i.test((heading.textContent || "").trim())) continue;
      if (c.querySelector("table")) return c;
    }

    // Fallback: any table under main that has expected columns
    const tables = Array.from(document.querySelectorAll("main table, .content table, .card table"));
    for (const t of tables) {
      const th = Array.from(t.querySelectorAll("thead th")).map(x => (x.textContent || "").toLowerCase());
      const looks = th.some(x=>x.includes("sl")) && th.some(x=>x.includes("name")) && th.some(x=>x.includes("email"));
      if (looks) return t.closest(".card, .panel, .block, section") || t.parentElement;
    }
    return null;
  }

  function looksNumericSelect(sel) {
    if (!sel || sel.tagName !== "SELECT") return false;
    const opts = Array.from(sel.options);
    if (!opts.length) return false;
    const numericCount = opts.reduce((n,o)=> (Number.isFinite(parseInt(o.value || o.text,10))?n+1:n), 0);
    return numericCount >= Math.max(1, Math.floor(opts.length*0.6));
  }

  function findControls(root) {
    const table =
      document.querySelector(".users-table") ||
      root.querySelector(".users-table") ||
      root.querySelector("table.users-table") ||
      root.querySelector("table");

    return {
      table,
      tbody:
        document.querySelector("#usersTbody") ||
        root.querySelector("tbody"),
      search:
        document.querySelector("#usersSearch") ||
        root.querySelector("input[type='search'], input[name='search']"),
      status:
        document.querySelector("#usersStatus") ||
        Array.from(root.querySelectorAll("select")).find(s =>
          (s.options[0]?.textContent || "").toLowerCase().includes("all status")
        ) || null,
      type:
        document.querySelector("#usersType") ||
        Array.from(root.querySelectorAll("select")).find(s =>
          (s.options[0]?.textContent || "").toLowerCase().includes("all types")
        ) || null,
      per:
        document.querySelector("#usersPer") ||
        root.querySelector("select[name='per']") ||
        Array.from(root.querySelectorAll("select")).find(looksNumericSelect) || null,
      pager:
        document.querySelector("#usersPager") ||
        root.querySelector("[data-users-pager]") ||
        null,
      info:
        document.querySelector("#usersInfo") ||
        root.querySelector("[data-users-info]") ||
        null,
    };
  }

  // ---------------- Endpoint ----------------
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
    return USERS_BASE;
  }

  // ---------------- Data helpers ----------------
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
      orders: Number.isFinite(u.orders) ? u.orders : u.orderCount ?? u.orders_count ?? 0,
      _raw: u,
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

    let list = [];
    if (Array.isArray(body)) list = body;
    else if (body && typeof body === "object") {
      if (Array.isArray(body.users)) list = body.users;
      else if (body.data && Array.isArray(body.data)) list = body.data;
      else {
        const keys = ["rows", "results", "list", "items"];
        for (const k of keys) {
          if (Array.isArray(body[k])) { list = body[k]; break; }
        }
        if (!list.length && body.data && typeof body.data === "object") {
          for (const k of keys) {
            if (Array.isArray(body.data[k])) { list = body.data[k]; break; }
          }
        }
      }
    }
    return list.map(normalize);
  }

  async function deleteUser(id) {
    const base = await resolveUsersBase();
    const r = await fetch(`${base}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!(r.ok || r.status === 204)) {
      const txt = await r.text().catch(() => "");
      throw new Error(`Delete failed ${r.status}: ${txt}`);
    }
  }

  // ---------------- Render ----------------
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
          <button class="btn btn-sm btn-outline"        data-users-action="open-edit"  data-id="${esc(u.id)}">View</button>
          <button class="btn btn-sm btn-outline danger" data-users-action="deactivate" data-id="${esc(u.id)}">Delete</button>
        </td>
      </tr>`;
  }

  function renderPager(total) {
    const { page, per, els } = State;
    const pages = Math.max(1, Math.ceil(total / per));
    if (State.page > pages) State.page = pages;
    if (!els.pager) return;

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
    els.pager.innerHTML = html;
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
    const rawQ = (State.els.search?.value || "").trim();
    const rawType = (State.els.type?.value || "").trim();
    const rawStatus = (State.els.status?.value || "").trim();

    const type = !rawType || /^all\b/i.test(rawType) ? "" : rawType;
    const status = !rawStatus || /^all\b/i.test(rawStatus) ? "" : rawStatus;

    const q = rawQ.toLowerCase();

    State.filtered = State.all.filter((u) => {
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

  // ---------------- Events ----------------
  function onRootClick(e) {
    if (!State.root?.contains(e.target)) return;
    const actEl = e.target.closest("[data-users-action], a.ws-link, a.link");
    if (!actEl) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    let action = actEl.getAttribute("data-users-action") || "";
    const row = actEl.closest("[data-users-row]");
    const id = actEl.getAttribute("data-id") || row?.getAttribute("data-user-id") || "";
    if (!action && actEl.matches("a.ws-link, a.link")) action = "open-edit";

    switch (action) {
      case "open-create":
        break;
      case "open-edit":
        break;
      case "deactivate": {
        const u = State.all.find((x) => String(x.id) === String(id));
        const label = u?.name || u?.email || id;
        if (!confirm(`Delete user "${label}"? This cannot be undone.`)) return;

        const prevAll = State.all.slice();
        State.all = prevAll.filter((x) => String(x.id) !== String(id));
        State.filtered = State.filtered.filter((x) => String(x.id) !== String(id));
        render();

        deleteUser(id).catch(() => {
          State.all = prevAll;
          applyFilters();
        });
        break;
      }
      case "search":
        applyFilters();
        break;
      case "clear":
        if (State.els.search) State.els.search.value = "";
        if (State.els.type) State.els.type.value = State.els.type.options[0]?.value ?? "";
        if (State.els.status) State.els.status.value = State.els.status.options[0]?.value ?? "";
        State.page = 1;
        applyFilters();
        break;
      case "page": {
        const p = parseInt(actEl.getAttribute("data-page"), 10);
        if (Number.isFinite(p)) {
          State.page = p;
          render();
        }
        break;
      }
      default:
        break;
    }
  }

  function wire() {
    const { root, els } = State;
    root.addEventListener("click", onRootClick, true);
    els.search?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") applyFilters();
    });
    els.type?.addEventListener("change", applyFilters);
    els.status?.addEventListener("change", applyFilters);
    els.per?.addEventListener("change", () => {
      State.per = parseInt(els.per.value, 10) || 10;
      State.page = 1;
      render();
    });
  }

  // ---------------- Loader ----------------
  async function load() {
    const list = await fetchList();
    State.all = Array.isArray(list) ? list : [];
    State.filtered = State.all.slice();

    const perVal = parseInt(State.els.per?.value || "10", 10);
    if (Number.isFinite(perVal)) State.per = perVal;

    render();
  }

  // ---------------- Init ----------------
  async function init() {
    const root = findRoot();
    if (!root) return;
    if (root.dataset.wsInit === "1") return;

    State.root = root;
    State.els = findControls(root);

    await load();
    wire();

    root.dataset.wsInit = "1";
  }

  // Rehydrate when Users root is still in DOM but tbody was cleared/replaced
  async function rehydrate() {
    const root = findRoot();
    if (!root) return;

    const prevTbody = State.els && State.els.tbody ? State.els.tbody : null;

    // refresh controls against current DOM
    State.root = root;
    State.els = findControls(root);

    const tb = State.els && State.els.tbody ? State.els.tbody : null;
    const tbodyReplaced = prevTbody && tb && prevTbody !== tb;
    const needsData = !tb || tb.children.length === 0;

    if (tbodyReplaced || needsData) {
      await load();
    }
  }

  // ---------- Activation (robust SPA-safe attach / rehydrate) ----------
  (function activateUsersController(){
    document.addEventListener("admin:partial-loaded", (evt) => {
      const name = (evt && evt.detail && (evt.detail.name || evt.detail)) || "";
      if (/users/i.test(String(name))) ensureAttached(true);
    });

    function tryHashInit() {
      if (location.hash && /#users\b/i.test(location.hash)) ensureAttached(true);
    }
    if (document.readyState === "complete" || document.readyState === "interactive") {
      setTimeout(tryHashInit, 0);
    } else {
      document.addEventListener("DOMContentLoaded", () => setTimeout(tryHashInit, 0));
    }
    window.addEventListener("hashchange", () => setTimeout(tryHashInit, 0));

    document.addEventListener("click", (e) => {
      const t = e.target.closest('[data-partial="users"], a[href$="#users"], a[href*="#users"]');
      if (t) setTimeout(() => ensureAttached(true), 0);
    }, true);

    function isVisible(el) {
      if (!el) return false;
      if (el.offsetParent !== null) return true;
      const r = el.getClientRects();
      return !!(r && r.length);
    }

    function needRehydrate() {
      if (!window.__ADMIN_USERS_ATTACHED__) return true;
      if (!State.root) return true;
      if (!document.contains(State.root)) return true;
      if (!isVisible(State.root)) return true;
      const tb = State.els && State.els.tbody;
      if (!tb) return true;
      if (tb.children.length === 0) return true;
      return false;
    }

    let mo;
    function ensureAttached(allowRehydrate) {
      // If we're already attached and the root is still present, only rehydrate when tbody is missing/empty
      if (window.__ADMIN_USERS_ATTACHED__ && State && State.root && document.contains(State.root)) {
        const tb = State.els && State.els.tbody ? State.els.tbody : null;
        if (!tb || tb.children.length === 0) {
          window.AdminUsers?.rehydrate?.();
        }
        return;
      }

      try {
        const root = findRoot();
        if (root) {
          // If same root, rehydrate; otherwise init fresh
          if (State && State.root && State.root === root) {
            window.AdminUsers?.rehydrate?.();
          } else {
            window.AdminUsers?.init?.();
            window.__ADMIN_USERS_ATTACHED__ = true;
          }
          return;
        }
      } catch {}

      if (mo) mo.disconnect();
      mo = new MutationObserver(() => {
        try {
          const rootNow = findRoot();
          if (rootNow) {
            mo.disconnect();
            window.AdminUsers?.init?.();
            window.__ADMIN_USERS_ATTACHED__ = true;
          }
        } catch {}
      });
      mo.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => mo && mo.disconnect(), 8000);
    }

    const leaveMo = new MutationObserver(() => {
      if (!State?.root) return;
      const gone = !document.contains(State.root);
      const hidden = !isVisible(State.root);
      if (gone || hidden) {
        window.__ADMIN_USERS_ATTACHED__ = false;
      }
    });
    leaveMo.observe(document.body, { childList: true, subtree: true });
  })();

  // Optional manual hook
  window.AdminUsers = { init, rehydrate };
})();
