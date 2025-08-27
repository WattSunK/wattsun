/* Admin Users — list + Add/Edit modal (adapter-aware, strictly scoped, idempotent) */
(function () {
  const State = {
    all: [],
    filtered: [],
    page: 1,
    per: 10,
    root: null,
    els: {},
  };

  // ---------- Helpers
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const T  = (v) => (v == null ? "" : String(v));
  const esc = (s) => T(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function log(...a){ console.log("[Users]", ...a); }

  async function fetchUsersViaAdapter(type = "") {
    try {
      if (window.WattSunAdminData?.users?.get) {
        const res = await window.WattSunAdminData.users.get({ type });
        const list = Array.isArray(res) ? res : (Array.isArray(res?.users) ? res.users : []);
        return list.map(normalizeUser);
      }
    } catch(_) { /* adapter missing or failed */ }
    const url = type ? `/api/users?type=${encodeURIComponent(type)}` : `/api/users`;
    const r = await fetch(url, { credentials: "same-origin" });
    const j = await r.json();
    const list = Array.isArray(j) ? j : (Array.isArray(j?.users) ? j.users : []);
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
      orders: Number.isFinite(u.orders) ? u.orders : (u.orderCount ?? 0),
      _raw: u
    };
  }

  // ---------- Render
  function rowHtml(u, slno) {
    const statusClass = (u.status === "Active") ? "ws-badge-success" : "ws-badge-muted";
    return `
      <tr data-user-id="${esc(u.id)}">
        <td>${slno}</td>
        <td>
          <a href="#" class="ws-link user-view-link" data-action="open-profile" data-id="${esc(u.id)}">
            ${esc(u.name || "(no name)")}
          </a>
        </td>
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

  function render() {
    const { page, per, filtered, els } = State;
    const start = (page - 1) * per;
    const rows = filtered.slice(start, start + per);

    els.tbody.innerHTML = rows.length
      ? rows.map((u, idx) => rowHtml(u, start + idx + 1)).join("")
      : `<tr class="ws-empty"><td colspan="9">No users found</td></tr>`;

    const total = filtered.length;
    const end = Math.min(start + rows.length, total);
    els.info.textContent = total ? `${start + 1}–${end} of ${total}` : "0–0 of 0";

    renderPager(total);
  }

  // ---------- Filtering
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
    // let skin know new rows are in
    window.dispatchEvent(new CustomEvent("users:rendered"));
  }

  // ---------- Persist (adapter first, REST fallback)
  async function createUser(payload) {
    try {
      if (window.WattSunAdminData?.users?.create) {
        return normalizeUser(await window.WattSunAdminData.users.create(payload));
      }
    } catch(_) {}
    const r = await fetch(`/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error(`Create failed ${r.status}`);
    const j = await r.json();
    return normalizeUser(Array.isArray(j?.users) ? j.users[0] : j.user || j);
  }

  async function updateUser(id, payload) {
    try {
      if (window.WattSunAdminData?.users?.update) {
        return normalizeUser(await window.WattSunAdminData.users.update(id, payload));
      }
    } catch(_) {}
    const r = await fetch(`/api/users/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error(`Update failed ${r.status}`);
    const j = await r.json();
    return normalizeUser(Array.isArray(j?.users) ? j.users[0] : j.user || j);
  }

  // ---------- Modal
  function ensureModal() {
    const modal = $("#users-modal");
    if (!modal) return null;

    const data = {
      modal,
      title: $("#users-modal-title", modal),
      form: $("#users-form", modal),
      id: $("#um-id", modal),
      name: $("#um-name", modal),
      email: $("#um-email", modal),
      phone: $("#um-phone", modal),
      type: $("#um-type", modal),
      status: $("#um-status", modal),
      password: $("#um-password", modal),
      save: $("#users-save-btn", modal),
      closers: $$("[data-users-close]", modal)
    };

    if (!modal.dataset.bound) {
      modal.dataset.bound = "1";
      // close actions
      data.closers.forEach(btn => btn.addEventListener("click", closeModal));
      modal.addEventListener("click", (e) => {
        if (e.target.matches(".ws-modal, .ws-modal-backdrop")) closeModal();
      });
      document.addEventListener("keydown", (e) => {
        if (modal.style.display !== "none" && e.key === "Escape") closeModal();
      });
      // save
      data.save.addEventListener("click", onSaveClicked);
    }

    return data;
  }

  function openModal(user) {
    const m = ensureModal();
    if (!m) return;
    const isNew = !user || !user.id;
    m.modal.dataset.mode = isNew ? "create" : "edit";
    m.title.textContent = isNew ? "Add User" : "Edit User";

    m.id.value = user?.id || "";
    m.name.value = user?.name || "";
    m.email.value = user?.email || "";
    m.phone.value = user?.phone || "";
    m.type.value = user?.type || "";
    m.status.value = user?.status || "Active";
    m.password.value = "";

    m.modal.style.display = "";
    m.modal.removeAttribute("aria-hidden");
    setTimeout(() => m.name?.focus(), 10);
  }

  function closeModal() {
    const m = $("#users-modal");
    if (!m) return;
    m.style.display = "none";
    m.setAttribute("aria-hidden", "true");
  }

  async function onSaveClicked(e) {
    e.preventDefault();
    e.stopPropagation();

    const m = ensureModal(); if (!m) return;

    const id = m.id.value.trim();
    const payload = {
      name: m.name.value.trim(),
      email: m.email.value.trim(),
      phone: m.phone.value.trim(),
      type: m.type.value.trim(),
      status: m.status.value.trim()
    };
    const pwd = m.password.value.trim();
    if (pwd) payload.password = pwd; // optional

    // basic client validation
    if (!payload.name || !payload.phone || !payload.type) {
      alert("Name, phone and type are required.");
      return;
    }

    try {
      let saved;
      if (id) {
        saved = await updateUser(id, payload);
        // update in place
        const ix = State.all.findIndex(u => String(u.id) === String(id));
        if (ix >= 0) State.all[ix] = { ...State.all[ix], ...saved };
      } else {
        saved = await createUser(payload);
        // add to top
        State.all.unshift(saved);
      }
      applyFilters();
      closeModal();
      log("Saved", saved);
    } catch (err) {
      console.warn(err);
      alert("Save failed. Please check the server endpoint and try again.");
    }
  }

  // ---------- Actions (GUARDED to stop cross-pane listeners)
  async function onAction(e) {
    const el = e.target.closest('[data-action], .user-view-link, .user-view, .user-edit, .user-delete');
    if (!el) return;

    // Block any global listeners (e.g., Orders edit modal)
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const tr = el.closest('tr[data-user-id], tr[data-id]');
    const id = el.getAttribute('data-id') || tr?.dataset.userId || tr?.dataset.id || "";
    const action =
      el.getAttribute('data-action') ||
      (el.classList.contains('user-view-link') ? 'open-profile' :
       el.classList.contains('user-view') ? 'view-user' :
       el.classList.contains('user-edit') ? 'edit-user' :
       el.classList.contains('user-delete') ? 'delete-user' : '');

    switch (action) {
      case 'open-profile':
      case 'view-user': {
        try { localStorage.setItem('adminSelectedUserId', String(id)); } catch {}
        location.hash = '#profile';
        window.postMessage({ type: 'admin-user-open', userId: String(id) }, '*');
        break;
      }
      case 'edit-user': {
        const u = State.all.find(x => String(x.id) === String(id));
        openModal(u);
        break;
      }
      case 'delete-user': {
        if (!confirm('Deactivate this user?')) return;
        try {
          await fetch(`/api/users/${encodeURIComponent(id)}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ status: 'Inactive' })
          });
          const row = State.all.find(u => String(u.id) === String(id));
          if (row) row.status = 'Inactive';
          applyFilters();
        } catch (err) {
          console.warn('[Users] delete failed:', err);
          alert('Could not deactivate user (endpoint may be missing).');
        }
        break;
      }
      default:
        // no-op
        break;
    }
  }

  // ---------- Wire events (delegated to users-root)
  function wireEvents() {
    const { root, els } = State;

    root.addEventListener('click', onAction, true); // capture=true to pre-empt others

    // search/filters
    els.searchBtn.addEventListener('click', applyFilters);
    els.clearBtn.addEventListener('click', () => {
      els.search.value = "";
      els.type.value = "";
      els.status.value = "";
      State.page = 1;
      applyFilters();
    });
    els.search.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyFilters(); });
    els.type.addEventListener('change', applyFilters);
    els.status.addEventListener('change', applyFilters);
    els.per.addEventListener('change', () => {
      State.per = parseInt(els.per.value, 10) || 10;
      State.page = 1;
      render();
      window.dispatchEvent(new CustomEvent("users:rendered"));
    });

    // pager
    els.pager.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-page]');
      if (!b) return;
      const p = parseInt(b.getAttribute('data-page'), 10);
      if (!Number.isFinite(p)) return;
      State.page = p;
      render();
      window.dispatchEvent(new CustomEvent("users:rendered"));
    });

    // add user → open modal (create)
    $("#add-user-btn", root)?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openModal(null);
    });
  }

  // ---------- Init
  async function initUsersController() {
    const root = document.getElementById('users-root');
    if (!root) return;

    // idempotency when partial reinserted
    if (root.dataset.wsInit === '1') return;
    root.dataset.wsInit = '1';

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
    window.dispatchEvent(new CustomEvent("users:rendered"));
  }

  // Keep observing so re-inserts re-init automatically
  function autoInitWhenReady() {
    const tryInitOnce = () => {
      const root = document.getElementById('users-root');
      if (root && root.dataset.wsInit !== '1') {
        initUsersController();
      }
    };
    tryInitOnce();
    const mo = new MutationObserver(tryInitOnce);
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // Expose (compat with shim and legacy)
  window.AdminUsers = { init: initUsersController };
  window.initAdminUsers = initUsersController;
  window.fetchUsers = initUsersController;

  (document.readyState === 'loading')
    ? document.addEventListener('DOMContentLoaded', autoInitWhenReady)
    : autoInitWhenReady();
})();

/* === Users surgical skin — (kept as-is) === */
(function(){
  const $ = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  function badge(text){
    const ok=/^(active|enabled|verified|driver|admin|staff)$/i.test(text||'');
    return `<span class="ws-badge ${ok?'ws-badge-success':'ws-badge-muted'}">${text||''}</span>`;
  }
  function shell(){
    $('#usersTable')?.classList.add('ws-admin-table');
    $('#usersPager')?.classList.add('ws-admin-pager');
    $('#usersSearch')?.classList.add('ws-admin-input');
    $('#usersStatus')?.classList.add('ws-admin-input');
    $('#usersTable')?.closest('div')?.classList.add('ws-admin-card');
  }
  function rows(){
    const tb=$('#usersTbody'); if(!tb) return;
    $$('#usersTbody tr').forEach(tr=>{
      const statusCell = tr.querySelector('[data-col="status"], .col-status') || tr.children[4];
      if(statusCell && !statusCell.dataset.wsBadged){
        const raw=statusCell.textContent.trim();
        statusCell.innerHTML = badge(raw);
        statusCell.dataset.wsBadged='1';
      }
      const act = tr.querySelector('.actions');
      if(act && !act.dataset.wsSkinned){
        $$('button', act).forEach(b=>{
          if(!b.classList.contains('ws-btn')){
            /view|show/i.test(b.textContent)? b.classList.add('ws-btn','ws-btn-ghost','ws-btn-xs') : b.classList.add('ws-btn','ws-btn-xs');
          }
        });
        act.dataset.wsSkinned='1';
      }
    });
  }
  function observe(){
    const tb=$('#usersTbody'); if(!tb) return;
    new MutationObserver(()=>rows()).observe(tb,{childList:true});
  }
  function init(){
    if(!$('#usersTable')) return;
    shell(); rows(); observe();
  }
  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('hashchange', ()=>{ if(location.hash.includes('users')) setTimeout(init, 25); });
  window.addEventListener('users:rendered', init);
  window.addEventListener('admin:partial-loaded', e=>{ if((e.detail||'')==='users') setTimeout(init, 10); });
  setTimeout(init, 50);
})();
