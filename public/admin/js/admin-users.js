/* Admin Users — scoped, idempotent controller with Add/Edit modal */
(function(){
  const State = {
    all: [],
    filtered: [],
    page: 1,
    per: 10,
    root: null,
    els: {}
  };

  // ---------- utils
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const T  = (v)=> (v==null ? "" : String(v));
  const esc= (s)=> T(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  function log(...a){ console.log("[Users]", ...a); }

  // ---------- data
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

  async function fetchUsers(type=""){
    // adapter first
    try{
      if (window.WattSunAdminData?.users?.get){
        const res = await window.WattSunAdminData.users.get({ type });
        const list = Array.isArray(res) ? res : (Array.isArray(res?.users) ? res.users : []);
        return list.map(normalize);
      }
    }catch(_){}
    // REST fallback
    const url = type ? `/api/users?type=${encodeURIComponent(type)}` : `/api/users`;
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
    const r = await fetch(`/api/users`, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      credentials:"same-origin",
      body: JSON.stringify(payload)
    });
    if(!r.ok) throw new Error(`Create failed ${r.status}`);
    const j = await r.json();
    return normalize(j.user || (Array.isArray(j.users) ? j.users[0] : j));
  }

  async function updateUser(id, payload){
    try{
      if (window.WattSunAdminData?.users?.update){
        return normalize(await window.WattSunAdminData.users.update(id, payload));
      }
    }catch(_){}
    const r = await fetch(`/api/users/${encodeURIComponent(id)}`, {
      method:"PATCH",
      headers:{"Content-Type":"application/json"},
      credentials:"same-origin",
      body: JSON.stringify(payload)
    });
    if(!r.ok) throw new Error(`Update failed ${r.status}`);
    const j = await r.json();
    return normalize(j.user || (Array.isArray(j.users) ? j.users[0] : j));
  }

  async function deactivateUser(id){
    try{
      if (window.WattSunAdminData?.users?.deactivate){
        await window.WattSunAdminData.users.deactivate(id);
        return;
      }
    }catch(_){}
    await fetch(`/api/users/${encodeURIComponent(id)}/status`, {
      method:"PATCH",
      headers:{"Content-Type":"application/json"},
      credentials:"same-origin",
      body: JSON.stringify({ status:"Inactive" })
    });
  }

  // ---------- render
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
          <button class="ws-btn ws-btn-xs" data-users-action="open-edit" data-id="${esc(u.id)}">View</button>
          <button class="ws-btn ws-btn-xs ws-btn-primary" data-users-action="open-edit" data-id="${esc(u.id)}">Edit</button>
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

  // ---------- modal (unique id + users-scoped actions)
  function mget(){
    const modal = document.getElementById("usersModal");
    return {
      modal,
      title: $("#users-modal-title", modal),
      form:  $("#users-form", modal),
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
    m.id.value = user?.id || "";
    m.name.value = user?.name || "";
    m.email.value = user?.email || "";
    m.phone.value = user?.phone || "";
    m.type.value = user?.type || "";
    m.status.value = user?.status || "Active";
    m.pwd.value = "";
    m.modal.style.display = "";
    m.modal.removeAttribute("aria-hidden");
    setTimeout(()=>m.name?.focus(), 10);
  }
  function closeModal(){
    const m = mget(); if (!m.modal) return;
    m.modal.style.display = "none";
    m.modal.setAttribute("aria-hidden", "true");
  }

  async function saveModal(){
    const m = mget();
    const id = m.id.value.trim();
    const payload = {
      name: m.name.value.trim(),
      email: m.email.value.trim(),
      phone: m.phone.value.trim(),
      type: m.type.value.trim(),
      status: m.status.value.trim()
    };
    const pwd = m.pwd.value.trim();
    if (pwd) payload.password = pwd;

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

  // ---------- events (strictly under users-root + stopImmediatePropagation)
  function onRootClick(e){
    if (!State.root.contains(e.target)) return;     // hard scope
    e.stopPropagation();
    e.stopImmediatePropagation();

    const actEl = e.target.closest("[data-users-action]");
    if (!actEl) return;

    const action = actEl.getAttribute("data-users-action");
    const id = actEl.getAttribute("data-id")
           || actEl.closest("[data-users-row]")?.getAttribute("data-user-id") || "";

    switch(action){
      case "open-create":
        e.preventDefault(); openModal(null); break;

      case "open-edit": {
        e.preventDefault();
        const u = State.all.find(x => String(x.id) === String(id));
        openModal(u);
        break;
      }

      case "deactivate":
        e.preventDefault();
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

      case "search":
        e.preventDefault(); applyFilters(); break;

      case "clear":
        e.preventDefault();
        State.els.search.value = "";
        State.els.type.value = "";
        State.els.status.value = "";
        State.page = 1;
        applyFilters();
        break;

      case "page":
        e.preventDefault();
        const p = parseInt(actEl.getAttribute("data-page"), 10);
        if (Number.isFinite(p)){
          State.page = p;
          render();
        }
        break;

      case "close":
        e.preventDefault(); closeModal(); break;

      case "save":
        e.preventDefault(); saveModal(); break;

      default: break;
    }
  }

  function wire(){
    const { root, els } = State;

    root.addEventListener("click", onRootClick, true); // capture + scoped
    els.search.addEventListener("keydown", (e)=>{ if (e.key==="Enter") applyFilters(); });
    els.type.addEventListener("change", applyFilters);
    els.status.addEventListener("change", applyFilters);
    els.per.addEventListener("change", ()=>{
      State.per = parseInt(els.per.value, 10) || 10;
      State.page = 1;
      render();
    });
    // modal ESC
    document.addEventListener("keydown", (e)=>{
      const m = $("#usersModal");
      if (m && m.style.display !== "none" && e.key === "Escape") closeModal();
    });
  }

  async function init(){
    const root = document.getElementById("users-root");
    if (!root) return;
    if (root.dataset.wsInit === "1") return; // idempotent
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

    State.all = await fetchUsers("");
    State.filtered = State.all.slice();

    wire();
    render();
  }

  // re-init if partial is re-inserted
  function autoInit(){
    const tryOnce = ()=>{ const r = document.getElementById("users-root"); if (r && r.dataset.wsInit!=="1") init(); };
    tryOnce();
    new MutationObserver(tryOnce).observe(document.body, { childList:true, subtree:true });
  }

  // public hooks expected by dashboard loader
  window.fetchUsers = init;
  window.AdminUsers = { init };

  (document.readyState === "loading")
    ? document.addEventListener("DOMContentLoaded", autoInit)
    : autoInit();
})();
