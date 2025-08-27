/* Admin Users — scoped, idempotent controller with Items-style modal.
   - Keeps existing list/search/pager behavior
   - Exposes window.fetchUsers for dashboard loader
   - Adapter-first saves, REST fallback with a single safe fallback (no bursts)
*/
(function(){
  // ========= State & Utils =========
  const State = { all: [], filtered: [], page: 1, per: 10, root: null, els: {} };
  window.UsersState = State;

  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const T  = (v)=> (v==null ? "" : String(v));
  const esc= (s)=> T(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));

  // ========= Endpoint auto-detect (cached for LIST only)
  const USERS_ENDPOINT_CANDIDATES = ["/api/admin/users","/api/users","/admin/users","/users"];
  let USERS_BASE = null;

  async function resolveUsersBase() {
    if (USERS_BASE) return USERS_BASE;
    USERS_BASE = localStorage.getItem("wsUsersBase") || null;

    async function check(url) {
      try {
        const r = await fetch(url, { method: "GET", credentials: "same-origin" });
        if (r.ok || r.status === 405) return true;
      } catch (_) {}
      return false;
    }
    for (const base of USERS_ENDPOINT_CANDIDATES) {
      if (await check(base)) { USERS_BASE = base; localStorage.setItem("wsUsersBase", base); break; }
    }
    USERS_BASE = USERS_BASE || "/api/users";
    return USERS_BASE;
  }

  // ========= Data (adapter-first)
  function normalize(u){
    const created = u.createdAt || u.created_at || u.lastActive || "";
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

  async function fetchList(type=""){
    try{
      if (window.WattSunAdminData?.users?.get){
        const res = await window.WattSunAdminData.users.get({ type });
        const list = Array.isArray(res) ? res : (Array.isArray(res?.users) ? res.users : []);
        return list.map(normalize);
      }
    }catch(_){}
    const base = await resolveUsersBase();
    const url = type ? `${base}?type=${encodeURIComponent(type)}` : base;
    const r = await fetch(url, { credentials: "same-origin" });
    const j = await r.json();
    const list = Array.isArray(j) ? j : (Array.isArray(j?.users) ? j.users : []);
    return list.map(normalize);
  }

  async function createUser(payload){
    try{
      if (window.WattSunAdminData?.users?.create){
        return normalize(await window.WattSunAdminData.users.create(payload));
      }
    }catch(_){}
    const base = await resolveUsersBase();
    let r = await fetch(base, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      credentials:"same-origin",
      body: JSON.stringify(payload)
    });
    // one safe fallback if the list base is the admin route but POST 404s there
    if (r.status === 404 && base.includes("/api/admin/users")) {
      r = await fetch(`/api/users`, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        credentials:"same-origin",
        body: JSON.stringify(payload)
      });
    }
    if(!r.ok) throw new Error(`Create failed ${r.status}`);
    const j = await r.json().catch(()=> ({}));
    return normalize(j.user || (Array.isArray(j.users) ? j.users[0] : j));
  }

  // Manual overrides (optional, no probing)
  const USERS_UPDATE_BASE_OVERRIDE   = localStorage.getItem('wsUsersUpdateBase')   || '';
  const USERS_UPDATE_METHOD_OVERRIDE = (localStorage.getItem('wsUsersUpdateMethod') || '').toUpperCase();

  async function updateUser(id, payload){
    try{
      if (window.WattSunAdminData?.users?.update){
        return normalize(await window.WattSunAdminData.users.update(id, payload));
      }
    }catch(_){}

    const base = USERS_UPDATE_BASE_OVERRIDE || await resolveUsersBase();
    const method = USERS_UPDATE_METHOD_OVERRIDE || 'PATCH';

    // single attempt
    let r = await fetch(`${base}/${encodeURIComponent(id)}`, {
      method,
      headers:{ "Content-Type":"application/json" },
      credentials:"same-origin",
      body: JSON.stringify(payload)
    });

    // exact one fallback (avoid bursts/gateway 502)
    if (r.status === 404 && !USERS_UPDATE_BASE_OVERRIDE && base.includes('/api/admin/users')) {
      r = await fetch(`/api/users/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers:{ "Content-Type":"application/json" },
        credentials:"same-origin",
        body: JSON.stringify(payload)
      });
    }

    if(!r.ok) throw new Error(`Update failed ${r.status}`);
    const j = await r.json().catch(()=> ({}));
    return normalize(j.user || (Array.isArray(j.users) ? j.users[0] : j));
  }

  async function deactivateUser(id){
    try{
      if (window.WattSunAdminData?.users?.deactivate){
        await window.WattSunAdminData.users.deactivate(id);
        return;
      }
    }catch(_){}
    const base = await resolveUsersBase();
    await fetch(`${base}/${encodeURIComponent(id)}/status`, {
      method:"PATCH",
      headers:{ "Content-Type":"application/json" },
      credentials:"same-origin",
      body: JSON.stringify({ status: "Inactive" })
    });
  }

  // ========= Render
  function rowHtml(u, slno){
    const badge = (u.status==="Active") ? "ws-badge-success" : "ws-badge-muted";
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
      </tr>
    `;
  }

  function renderPager(total){
    const { page, per, els } = State;
    const pages = Math.max(1, Math.ceil(total/per));
    if (State.page > pages) State.page = pages;

    let html = "";
    const btn = (p, label, disabled=false, active=false)=>{
      const cls = ["ws-page-btn", active?"is-active":"", disabled?"is-disabled":""].join(" ");
      return `<button class="${cls}" data-users-action="page" data-page="${p}" ${disabled?"disabled":""}>${label}</button>`;
    };
    html += btn(1, "«", page===1);
    html += btn(Math.max(1, page-1), "‹", page===1);
    const win=5, s=Math.max(1,page-Math.floor(win/2)), e=Math.min(pages,s+win-1);
    for (let p=s; p<=e; p++) html += btn(p, String(p), false, p===page);
    html += btn(Math.min(pages,page+1), "›", page===pages);
    html += btn(pages, "»", page===pages);
    els.pager.innerHTML = html;
  }

  function render(){
    const { page, per, filtered, els } = State;
    const start = (page-1)*per;
    const rows  = filtered.slice(start, start+per);

    els.tbody.innerHTML = rows.length
      ? rows.map((u, i)=>rowHtml(u, start+i+1)).join("")
      : `<tr class="ws-empty"><td colspan="9">No users found</td></tr>`;

    const total = filtered.length;
    const end   = Math.min(start+rows.length, total);
    els.info.textContent = total ? `${start+1}–${end} of ${total}` : "0–0 of 0";

    renderPager(total);
    window.dispatchEvent(new CustomEvent("users:rendered"));
  }

  function applyFilters(){
    const q = State.els.search.value.trim().toLowerCase();
    const type = State.els.type.value.trim();
    const status = State.els.status.value.trim();

    State.filtered = State.all.filter(u=>{
      if (type && u.type !== type) return false;
      if (status && (u.status || "Active") !== status) return false;
      if (q){
        const hay = `${u.name} ${u.email} ${u.phone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    State.page = 1;
    render();
  }

  // ========= Modal
  function mget(){
    const modal = document.getElementById("usersModal");
    return {
      modal,
      title: $("#users-modal-title", modal),
      id:    $("#u-id", modal),
      name:  $("#u-name", modal),
      email: $("#u-email", modal),
      phone: $("#u-phone", modal),
      type:  $("#u-type", modal),
      status:$("#u-status", modal),
      pwd:   $("#u-password", modal)
    };
  }

  function openModal(user){
    const m = mget(); if (!m.modal) return;
    const isNew = !user || !user.id;
    m.title.textContent = isNew ? "Add User" : "Edit User";
    m.id.value     = user?.id || "";
    m.name.value   = user?.name || "";
    m.email.value  = user?.email || "";
    m.phone.value  = user?.phone || "";
    m.type.value   = user?.type || "";
    m.status.value = user?.status || "Active";
    m.pwd.value    = "";
    m.modal.style.display = "";
    m.modal.removeAttribute("aria-hidden");
    setTimeout(()=>m.name?.focus(), 10);
  }
  function closeModal(){
    const m = mget(); if (!m.modal) return;
    m.modal.style.display = "none";
    m.modal.setAttribute("aria-hidden","true");
  }

  async function saveModal(){
    const m = mget(); if (!m.modal) return;
    const id = m.id.value.trim();
    const payload = {
      name: m.name.value.trim(),
      email: m.email.value.trim(),
      phone: m.phone.value.trim(),
      type: m.type.value.trim(),
      status: m.status.value.trim()
    };
    const pwd = m.pwd.value.trim(); if (pwd) payload.password = pwd;

    if (!payload.name || !payload.phone || !payload.type){
      alert("Name, phone and type are required.");
      return;
    }
    try{
      let saved;
      if (id){
        saved = await updateUser(id, payload);
        const ix = State.all.findIndex(u => String(u.id) === String(id));
        if (ix >= 0) State.all[ix] = { ...State.all[ix], ...saved };
      }else{
        saved = await createUser(payload);
        State.all.unshift(saved);
      }
      applyFilters();
      closeModal();
    }catch(err){
      console.warn(err);
      alert("Save failed. Check the endpoint and try again.");
    }
  }

  // ========= Events (strictly scoped; capture + stopImmediatePropagation)
  function onRootClick(e){
    if (!State.root.contains(e.target)) return;
    const actEl = e.target.closest("[data-users-action], a.ws-link");
    if (!actEl) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    let action = actEl.getAttribute("data-users-action") || "";
    const row  = actEl.closest("[data-users-row]");
    const id   = actEl.getAttribute("data-id") || row?.getAttribute("data-user-id") || "";

    if (!action && actEl.matches('a.ws-link')) action = "open-edit";

    switch(action){
      case "open-create":   openModal(null); break;
      case "open-edit":     openModal(State.all.find(x => String(x.id) === String(id))); break;
      case "deactivate":
        if (!confirm("Deactivate this user?")) return;
        deactivateUser(id).then(()=>{
          const u = State.all.find(x => String(x.id) === String(id));
          if (u) u.status = "Inactive";
          applyFilters();
        }).catch(err=>{
          console.warn("[Users] deactivate failed", err);
          alert("Could not deactivate user.");
        });
        break;
      case "search":        applyFilters(); break;
      case "clear":
        State.els.search.value = "";
        State.els.type.value = "";
        State.els.status.value = "";
        State.page = 1;
        applyFilters();
        break;
      case "page":
        const p = parseInt(actEl.getAttribute("data-page"), 10);
        if (Number.isFinite(p)) { State.page = p; render(); }
        break;
      case "close":         closeModal(); break;
      case "save":          saveModal(); break;
      default: break;
    }
  }

  function wire(){
    const { root, els } = State;
    root.addEventListener("click", onRootClick, true);

    els.search.addEventListener("keydown", (e)=>{ if (e.key==="Enter") applyFilters(); });
    els.type.addEventListener("change", applyFilters);
    els.status.addEventListener("change", applyFilters);
    els.per.addEventListener("change", ()=>{
      State.per = parseInt(els.per.value, 10) || 10;
      State.page = 1;
      render();
    });

    document.addEventListener("keydown", (e)=>{
      const m = $("#usersModal");
      if (m && m.style.display !== "none" && e.key === "Escape") closeModal();
    });
  }

  // ========= Init / Re-init
  async function init(){
    const root = document.getElementById("users-root");
    if (!root) return;
    if (root.dataset.wsInit === "1") return;
    root.dataset.wsInit = "1";

    State.root = root;
    State.els = {
      tbody:  $("#users-tbody", root),
      info:   $("#users-table-info", root),
      pager:  $("#users-pagination", root),
      search: $("#users-search-input", root),
      type:   $("#users-type-filter", root),
      status: $("#users-status-filter", root),
      per:    $("#users-per-page", root),
    };
    State.per = parseInt(State.els.per?.value || "10", 10);

    State.all = await fetchList("");
    State.filtered = State.all.slice();

    wire();
    render();
  }

  function autoInit(){
    const tryOnce = ()=>{ const r = document.getElementById("users-root"); if (r && r.dataset.wsInit!=="1") init(); };
    tryOnce();
    new MutationObserver(tryOnce).observe(document.body, { childList:true, subtree:true });
  }

  // ========= Public hooks
  window.fetchUsers = init;
  window.AdminUsers = { init };

  (document.readyState === "loading")
    ? document.addEventListener("DOMContentLoaded", autoInit)
    : autoInit();
})();
