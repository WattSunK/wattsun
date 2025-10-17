/* public/admin/js/admin-users.js
   Admin Users — lean controller with mount sentinel + optional tracing
   Enable trace (noisy, dev-only): localStorage.dbgUsers = "trace"; location.reload();
*/
(function () {
  if (window.__ADMIN_USERS_CONTROLLER__) return;
  window.__ADMIN_USERS_CONTROLLER__ = true;

  // ---------------------------------------------------------------------
  // Trace helpers (disabled by default; no-op unless dbgUsers === "trace")
  // ---------------------------------------------------------------------
  const TRACE_ON = String(localStorage.getItem("dbgUsers")) === "trace";
  const tlog = (...a) => { if (TRACE_ON) console.debug("[users:trace]", ...a); };
  const mark = (tag, extra = {}) => {
    if (!TRACE_ON) return;
    try { performance.mark(`users:${tag}`); } catch {}
    tlog(tag, { ts: +performance.now().toFixed(1), ...extra });
  };

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  const State = {
    all: [],
    filtered: [],
    page: 1,
    per: 10,
    root: null,
    els: {},
    _attached: false,
  };

  // ---------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------
  const esc = (s) =>
    (s == null ? "" : String(s)).replace(/[&<>"']/g, (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
    );

  function looksNumericSelect(sel) {
    if (!sel || sel.tagName !== "SELECT") return false;
    const opts = Array.from(sel.options);
    if (!opts.length) return false;
    const numericCount = opts.reduce(
      (n, o) => (Number.isFinite(parseInt(o.value || o.text, 10)) ? n + 1 : n),
      0
    );
    return numericCount >= Math.max(1, Math.floor(opts.length * 0.6));
  }

  // ---------------------------------------------------------------------
  // DOM discovery (strictly under Users container)
  // Prefer an explicit anchor; fall back to a Users-card heuristic.
  // ---------------------------------------------------------------------
  function findRoot() {
    const byId = document.getElementById("users-root");
    if (byId) return byId;

    const byData = document.querySelector('[data-module="users"]');
    if (byData) return byData;

    // Heuristic: container with a title that contains "Users" and a table.
    const containers = Array.from(
      document.querySelectorAll(
        "section, .card, .panel, .block, [data-partial='users'], [role='region']"
      )
    ).filter((c) => !c.closest(".modal,[role='dialog']"));
    for (const c of containers) {
      const heading = c.querySelector(
        "h1,h2,h3,.card-title,.header,.title,[data-title]"
      );
      if (!heading) continue;
      const title = (heading.textContent || "").trim().toLowerCase();
      if (!title.includes("users")) continue;
      if (c.querySelector("table")) return c;
    }
    return null;
  }

  function findControls(root) {
    const table =
      root.querySelector(".users-table") ||
      root.querySelector("table.users-table") ||
      root.querySelector('table[data-users="1"]') ||
      root.querySelector("table");

    return {
      table,
      tbody: root.querySelector("#usersRows") || root.querySelector("#usersTbody") || root.querySelector("tbody"),
      search:
        root.querySelector("#usersSearch") ||
        root.querySelector('input[type="search"]') ||
        root.querySelector('input[name="search"]'),
      status:
        root.querySelector("#usersStatus") ||
        root.querySelector("[data-users-status]") ||
        Array.from(root.querySelectorAll("select")).find((s) =>
          (s.options[0]?.textContent || "").toLowerCase().includes("all status")
        ) ||
        null,
      type:
        root.querySelector("#userType") ||         // fallback to your HTML id
        root.querySelector("#usersType") ||
        root.querySelector("[data-users-type]") ||
        Array.from(root.querySelectorAll("select")).find((s) =>
          (s.options[0]?.textContent || "").toLowerCase().includes("all types")
        ) ||
        null,
      per:
        root.querySelector("#per-users") ||        // fallback to your HTML id
        root.querySelector("#usersPer") ||
        root.querySelector("[data-users-per]") ||
        root.querySelector('select[name="per"]') ||
        Array.from(root.querySelectorAll("select")).find(looksNumericSelect) ||
        null,
       pager:
        root.querySelector("#users-pagination") ||  // fallback to your HTML id
        root.querySelector("#usersPager") ||
        root.querySelector("[data-users-pager]") ||
        null,
      info:
        root.querySelector("#usersInfo") ||
        root.querySelector("[data-users-info]") ||
        null,
    };
  }

  // ---------------------------------------------------------------------
  // API endpoint detection (idempotent)
  // ---------------------------------------------------------------------
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

  // ---------------------------------------------------------------------
  // Data helpers
  // ---------------------------------------------------------------------
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
    mark("load-start", { url });

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
          const keys2 = ["rows", "results", "list", "items"];
          for (const k of keys2) {
            if (Array.isArray(body.data[k])) { list = body.data[k]; break; }
          }
        }
      }
    }
    const rows = list.map(normalize);
    mark("load-done", { n: rows.length });
    return rows;
  }

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------
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
          <button class="btn btn-sm btn-outline"        data-users-action="open-view"  data-id="${esc(u.id)}">View</button>
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
function syncTypesFromData() {
  const known = new Set(["Admin","Driver","Customer","User"]);
  for (const u of State.all) if (u.type) known.add(u.type);

  // Update the page filter
  const filterSel = document.getElementById("userType");
  if (filterSel) {
    const have = new Set(Array.from(filterSel.options).map(o => o.value));
    for (const t of known) {
      if (!have.has(t)) {
        const opt = document.createElement("option");
        opt.value = t; opt.textContent = t;
        filterSel.appendChild(opt);
      }
    }
  }

  // Update the modal type select, keeping Custom… at the end
  const modalSel = document.getElementById("userTypeField");
  if (modalSel) {
    const customOpt = modalSel.querySelector('option[value="__custom__"]');
    const have = new Set(Array.from(modalSel.options).map(o => o.value));
    for (const t of known) {
      if (t !== "__custom__" && !have.has(t)) {
        const opt = document.createElement("option");
        opt.value = t; opt.textContent = t;
        modalSel.insertBefore(opt, customOpt || null);
      }
    }
  }
}

  // ---------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------
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
    tlog('click', { action, id });

    switch (action) {
  case "open-view": {
  const u = State.all.find((x) => String(x.id) === String(id));
  UsersModal.open("view", u || null);
  break;
}
      case "open-create": {
        UsersModal.open("add", null);
        break;
      }
      case "open-edit": {
        const u = State.all.find((x) => String(x.id) === String(id));
        UsersModal.open("edit", u || null);
        break;
      }
      case "deactivate": {
        const u = State.all.find((x) => String(x.id) === String(id));
        const label = u?.name || u?.email || id;
        if (!confirm(`Delete user "${label}"? This cannot be undone.`)) return;

        const prevAll = State.all.slice();
        State.all = prevAll.filter((x) => String(x.id) !== String(id));
        State.filtered = State.filtered.filter((x) => String(x.id) !== String(id));
        render();

        (async () => {
          try {
            const base = await resolveUsersBase();
            await fetch(`${base}/${encodeURIComponent(id)}`, {
              method: "DELETE",
              credentials: "include",
            });
          } catch {
            State.all = prevAll;
            applyFilters();
          }
        })();
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
  // Add User button (if present)
    const addBtn = root.querySelector("#addUserBtn");
    if (addBtn) addBtn.addEventListener("click", (e) => { e.preventDefault(); UsersModal.open("add", null); });
    els.search?.addEventListener("keydown", (e) => { if (e.key === "Enter") applyFilters(); });
    els.type?.addEventListener("change", applyFilters);
    els.status?.addEventListener("change", applyFilters);
    els.per?.addEventListener("change", () => {
      State.per = parseInt(els.per.value, 10) || 10;
      State.page = 1;
      render();
    });
  }

  // ---------------------------------------------------------------------
  // Loader
  // ---------------------------------------------------------------------
  async function load() {
    const list = await fetchList();
    State.all = Array.isArray(list) ? list : [];
    State.filtered = State.all.slice();

    const perVal = parseInt(State.els.per?.value || "10", 10);
    if (Number.isFinite(perVal)) State.per = perVal;
    syncTypesFromData();   // keep filter & modal options in sync with actual data
    render();
  }

  // ---------------------------------------------------------------------
  // Init / Rehydrate
  // ---------------------------------------------------------------------
  async function init() {
    mark("init-start");
    const root = findRoot();
    if (!root) { mark("init-skip-no-root"); return; }

    // prevent double-init within the same mount
    if (root.dataset.wsInit === "1") { mark("init-skip-already"); return; }

    State.root = root;
    State.els = findControls(root);
    wire();
    await load();

    root.dataset.wsInit = "1";
    State._attached = true;
    mark("init-done");
  }

  // Rehydrate when Users root is still in DOM but tbody was cleared/replaced
  async function rehydrate() {
    mark("rehydrate");
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
// ---------------------------------------------------------------------
// Users Modal (single reusable)
// ---------------------------------------------------------------------
const UsersModal = (() => {
  let el, form, titleEl, closeBtn, cancelBtn, saveBtn;
  let idEl, nameEl, emailEl, phoneEl, typeEl, typeCustomEl, statusEl, resetChk, emailErr;
  let docKeyHandler = null;
  let mode = "view"; // "add" | "edit"

  function q(id) { return document.getElementById(id); }
 
  function visible(v) {
    if (!el) return;
    const asDialog = el && el.tagName === 'DIALOG';
    try {
      if (v) {
        if (asDialog && typeof el.showModal === 'function') {
          el.showModal();
        } else if (asDialog) {
          el.setAttribute('open', 'open');
        } else {
          el.hidden = false;
          el.style.display = '';
        }
      } else {
        if (asDialog && typeof el.close === 'function') {
          el.close();
        } else if (asDialog) {
          el.removeAttribute('open');
        }
        el.hidden = true;
      }
    } catch (_) {
      // Ultimate fallback: attribute + display flip
      if (v) { el.setAttribute('open','open'); el.hidden = false; el.style.display = ''; }
      else { el.removeAttribute('open'); el.hidden = true; }
    }
  }


  function fill(u) {
    // Fill the basics
    idEl.value     = u?.id ?? "";
    nameEl.value   = u?.name ?? "";
    emailEl.value  = u?.email ?? "";
    phoneEl.value  = u?.phone ?? "";
    statusEl.value = u?.status ?? "Active";

    // Built-in vs Custom type
    const builtin = new Set(["Admin","Driver","Customer","User"]);
    const isBuiltin = builtin.has(u?.type);
    typeEl.value = isBuiltin ? (u?.type || "User") : "__custom__";
    if (typeCustomEl) {
      typeCustomEl.style.display = (typeEl.value === "__custom__") ? "" : "none";
      typeCustomEl.value = isBuiltin ? "" : (u?.type || "");
    }

    // Clear inline email error
    emailErr.style.display = "none";
    emailErr.textContent = "";

    // Show reset toggle only when adding/editing (not view-only)
    q("resetEmailRow").style.display = (mode === "add" || mode === "edit") ? "" : "none";
  }

  function setMode(nextMode) {
    mode = nextMode;
    const isAdd  = mode === "add";
  const isEdit = mode === "edit";
  const isView = mode === "view";

  titleEl.textContent = isAdd ? "Add User" : isView ? "View User" : "Edit User";
  saveBtn.textContent = "Save";

  // Lock or unlock all fields
  const lock = (el, on) => { if (el) el.disabled = !!on; };
  [nameEl, emailEl, phoneEl, typeEl, typeCustomEl, statusEl, resetChk].forEach(el => lock(el, isView));

  // Hide Save in view mode, show otherwise
  if (saveBtn) saveBtn.style.display = isView ? "none" : "";
  if (cancelBtn) cancelBtn.textContent = isView ? "Close" : "Cancel";
  }

  function serialize() {
    const effectiveType =
      (typeEl.value === "__custom__")
        ? (typeCustomEl?.value || "").trim()
        : typeEl.value.trim();

    return {
      name:   nameEl.value.trim(),
      email:  emailEl.value.trim(),
      phone:  phoneEl.value.trim(),
      type:   effectiveType,          // <-- use effective type
      status: statusEl.value.trim(),
    };
  }

  async function onSave() {
    // Basic front-end validation
    if (!form.reportValidity()) return;

    const payload = serialize();
    if (typeEl.value === "__custom__" && !payload.type) {
      alert("Please enter a type name.");
      typeCustomEl?.focus();
      return;
    }
    const base = await resolveUsersBase();
    const isAdd = mode === "add";
    let id = idEl.value;

    try {
      let r;
      if (isAdd) {
        r = await fetch(base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
      } else {
        r = await fetch(`${base}/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
      }

      const ct = r.headers.get("content-type") || "";
      const body = ct.includes("json") ? await r.json() : {};
      if (!r.ok || body.success === false) {
        // Try to surface inline errors (e.g., duplicate email)
        const msg = (body && (body.error?.message || body.message)) || `Request failed (${r.status})`;
        // crude inline hook for email
        if (/email/i.test(msg)) {
          emailErr.textContent = msg;
          emailErr.style.display = "";
        } else {
          alert(msg);
        }
        return;
      }

      // success; body may contain the new/updated row
      const returned = body.user || body.data || body;
      if (isAdd) id = returned?.id ?? id;

      // optional: send reset email on save
      if (q("sendResetEmail").checked) {
        try {
          await fetch(`${base}/${encodeURIComponent(id)}/send-reset`, {
            method: "POST",
            credentials: "include",
          });
        } catch {}
      }

      await load();         // reuse existing loader to refresh list
      close();              // close modal
    } catch (err) {
      alert(err?.message || "Network error");
    }
  }

  function onCancel(e) {
    e?.preventDefault?.();
    close();
  }

  function onClose(e) {
    e?.preventDefault?.();
    close();
  }

  function open(nextMode, user) {
    ensureEls();
    setMode(nextMode);
    fill(user);
    // Ensure no other global dialogs are masking us
    try {
      document.querySelectorAll('dialog[open]').forEach(d => {
        if (d !== el) { try { d.close(); } catch { d.removeAttribute('open'); } }
      });
    } catch(_){}
    visible(true);

    document.body.classList.add("ws-modal-open");
    try { document.documentElement.classList.add('ws-modal-open'); } catch {}
    // Bring to top in case another overlay left z-index behind
    try { el.style.zIndex = '2205'; } catch {}
    try { (window.toast||console.log)(`Users modal: ${nextMode}`,'info'); } catch {}

    docKeyHandler = (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    close();    
  }
};
document.addEventListener("keydown", docKeyHandler, true);

    // focus first field for faster entry
    (nameEl || emailEl || saveBtn)?.focus?.();
  }

  function close() {
    visible(false);
    form?.reset?.();

    if (docKeyHandler) {
      document.removeEventListener("keydown", docKeyHandler, true);
      docKeyHandler = null;
    }

    document.body.classList.remove("ws-modal-open");
  }

  function ensureEls() {
    if (el) return;
    el      = q("users-modal");
    form    = q("usersForm");
    titleEl = q("usersModalTitle");
    closeBtn= q("usersModalClose");
    cancelBtn=q("usersModalCancel");
    saveBtn = q("usersModalSave");

    idEl    = q("userId");
    nameEl  = q("userName");
    emailEl = q("userEmail");
    phoneEl = q("userPhone");
    typeEl        = q("userTypeField");
   typeCustomEl  = q("userTypeCustom");        // NEW
 // Show the free-text input only when "Custom…" is selected
   typeEl?.addEventListener("change", () => {
   const isCustom = typeEl.value === "__custom__";
   if (typeCustomEl) typeCustomEl.style.display = isCustom ? "" : "none";
   if (!isCustom) typeCustomEl.value = "";
 });
    statusEl= q("userStatusField");
    resetChk= q("sendResetEmail");
    emailErr= q("err-userEmail");

    emailEl?.addEventListener("input", () => {
    if (!emailErr) return;
    emailErr.style.display = "none";
    emailErr.textContent = "";
  });

    closeBtn?.addEventListener("click", onClose);
    cancelBtn?.addEventListener("click", onCancel);
    saveBtn?.addEventListener("click", (e) => { e.preventDefault(); onSave(); });
    form?.addEventListener("submit", (e) => { e.preventDefault(); onSave(); });
  }

  return { open, close };
})();

  // ---------------------------------------------------------------------
  // Mount sentinel (uses findRoot so it works without explicit anchors)
  // ---------------------------------------------------------------------
  (function usersMountSentinel() {
    let mountedRoot = null;
    let mo = null;

    function mount(root) {
      if (mountedRoot === root) return;
      mountedRoot = root;
      mark("root-inserted");
      if (root && root.dataset && root.dataset.wsInit === "1") delete root.dataset.wsInit; // clean re-init
      init();
    }

    function unmount() {
      if (!mountedRoot) return;
      mark("root-removed");
      State._attached = false;
      mountedRoot = null;
    }

    function scan() {
      const root = findRoot();
      if (root) mount(root); else unmount();
    }

    mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });

    // Run once now, and again on the next tick (handles “already in DOM” case)
    scan();
    setTimeout(scan, 0);

    // Also on hash / router events
    window.addEventListener("hashchange", scan);
    document.addEventListener("admin:partial-loaded", scan);
  })();

  // ---------------------------------------------------------------------
  // Optional manual hook (for debugging)
  // ---------------------------------------------------------------------
  window.AdminUsers = { init, rehydrate };
})();
