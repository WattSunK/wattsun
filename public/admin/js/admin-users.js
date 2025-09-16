/* Admin Users — scoped, idempotent controller with Items-style modal.
   - Keeps existing list/search/pager behavior
   - Exposes window.fetchUsers for dashboard loader
   - Deterministic save: POST /api/admin/users (create), PUT /api/admin/users/:id (update)
   - Optional overrides via localStorage (no bursts, no 502s)
*/
(function(){
  // ========= State & Utils =========
  const State = {
    all: [], filtered: [], page: 1, per: 10,
    root: null, els: {}
  };
  window.UsersState = State; // optional for debugging

  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const T  = v => (v==null ? "" : String(v));
  const esc= s => T(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  // ========= Endpoint (cached LIST base; SAVE is deterministic)
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

  // Optional manual overrides (no probing; one call only)
  const USERS_UPDATE_BASE   = localStorage.getItem('wsUsersUpdateBase')   || "/api/admin/users";
  const USERS_UPDATE_METHOD = (localStorage.getItem('wsUsersUpdateMethod') || "PUT").toUpperCase();

  // ========= Data
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
    const r = await fetch(base, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      credentials:"same-origin",
      body: JSON.stringify(payload)
    });
    if(!r.ok) throw new Error(`Create failed ${r.status}`);
    const j = await r.json().catch(()=> ({}));
    return normalize(j.user || (Array.isArray(j.users) ? j.users[0] : j));
  }

  async function updateUser(id, payload){
    try{
      if (window.WattSunAdminData?.users?.update){
        return normalize(await window.WattSunAdminData.users.update(id, payload));
      }
    }catch(_){}
    const r = await fetch(`${USERS_UPDATE_BASE}/${encodeURIComponent(id)}`, {
      method: USERS_UPDATE_METHOD, // default PUT
      headers:{ "Content-Type":"application/json" },
      credentials:"same-origin",
      body: JSON.stringify(payload)
    });
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
          <!-- Single entry point: opens the Users modal -->
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
    if (els.pager) els.pager.innerHTML = html;
  }

  function render(){
    const { page, per, filtered, els } = State;
    const start = (page-1)*per;
    const rows  = filtered.slice(start, start+per);

    if (els.tbody) {
      els.tbody.innerHTML = rows.length
        ? rows.map((u, i)=>rowHtml(u, start+i+1)).join("")
        : `<tr class="ws-empty"><td colspan="9">No users found</td></tr>`;
    }

    const total = filtered.length;
    const end   = Math.min(start+rows.length, total);
    if (els.info) els.info.textContent = total ? `${start+1}–${end} of ${total}` : "0–0 of 0";

    renderPager(total);
    window.dispatchEvent(new CustomEvent("users:rendered"));
  }

  function applyFilters(){
    const q = (State.els.search?.value || "").trim().toLowerCase();
    const type = (State.els.type?.value || "").trim();
    const status = (State.els.status?.value || "").trim();

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
    if (!State.root?.contains(e.target)) return;
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
        if (State.els.search) State.els.search.value = "";
        if (State.els.type)   State.els.type.value   = "";
        if (State.els.status) State.els.status.value = "";
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

    els.search?.addEventListener("keydown", (e)=>{ if (e.key==="Enter") applyFilters(); });
    els.type?.addEventListener("change", applyFilters);
    els.status?.addEventListener("change", applyFilters);
    els.per?.addEventListener("change", ()=>{
      State.per = parseInt(els.per.value, 10) || 10;
      State.page = 1;
      render();
    });

    // ESC closes modal
    document.addEventListener("keydown", (e)=>{
      const m = $("#usersModal");
      if (m && m.style.display !== "none" && e.key === "Escape") closeModal();
    });
  }

  // ========= Loader (surgical insert)
  async function load(){
    try{
      // For first pass we fetch all; filters/pager are client-side like Orders baseline
      const list = await fetchList(); // respects resolved base
      State.all = Array.isArray(list) ? list : [];
      State.filtered = State.all.slice();
      // per select initial value
      const perVal = parseInt(State.els.per?.value || "10", 10);
      if (Number.isFinite(perVal)) State.per = perVal;
      render();
    }catch(err){
      console.warn("[Users] load() failed:", err);
      // Keep empty state rendered
      State.all = [];
      State.filtered = [];
      render();
    }
  }

  // ========= Init / Re-init
  async function init(){
    const root = document.getElementById("users-root");
    if (!root) return;
    if (root.dataset.wsInit === "1") return;

    State.root = root;
    State.els = {
      tbody:  document.querySelector("#usersTbody"),
      pager:  document.querySelector("#usersPager"),
      info:   document.querySelector("#usersInfo"),
      type:   document.querySelector("#usersType"),
      status: document.querySelector("#usersStatus"),
      search: document.querySelector("#usersSearch"),
      per:    document.querySelector("#usersPer"),
      addBtn: document.querySelector("#btnUsersAdd")
    };

    await load();
    wire();
    root.dataset.wsInit = "1";
    console.log("👷 [Users] controller attached (event-driven, no auto-init).");
  }

  // === Event-driven activation (no autoInit/observers)
  function onPartialLoaded(evt){
    // Many admin partials dispatch { detail: { name: "<partial-name>" } }
    const name = (evt && evt.detail && (evt.detail.name || evt.detail)) || "";
    if (!/users/i.test(String(name))) return; // only when Users partial is loaded
    init();
  }

  // Public hooks (optional)
  window.AdminUsers = { init };

  // Arm listener once; no DOM polling, no probes
  document.addEventListener("admin:partial-loaded", onPartialLoaded);
  console.log("🔎 [Users] controller armed for admin:partial-loaded (passive).");

  // NOTE: intentionally no autoInit() here to avoid cross-partial side effects.
})();
