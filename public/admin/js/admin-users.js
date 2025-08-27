/* public/admin/js/admin-users.js (root-agnostic)
 * - Works with old Users partial ids (#usersTbody, #usersTable, #usersSearch, ...)
 * - Strict scoping when possible; falls back to document if needed
 * - Add/Edit modal (Items-style), name-click opens modal
 * - Adaptive endpoints (PATCH/PUT/POST; /api/admin/users, /api/users, legacy variants)
 * - Idempotent init
 */
(() => {
  // ========= Tiny utils
  const Q  = (sel, root) => (root ? root.querySelector(sel) : document.querySelector(sel));
  const QA = (sel, root) => Array.from(root ? root.querySelectorAll(sel) : document.querySelectorAll(sel));
  const T  = v => (v == null ? "" : String(v));
  const esc = s => T(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const once = (fn => { let d=false; return (...a)=>{ if(d) return; d=true; fn(...a); }; })();

  // ========= State
  const State = {
    booted:false,
    root:null,            // preferred scope; may be null if not found
    els:{},
    all:[],
    filtered:[],
    q:"", type:"", status:"",
    page:1, per:10,
    inflight:0,
  };
  window.UsersState = State; // optional

  // ========= Root detection (legacy-safe)
  function findRoot() {
    // 1) Preferred new ids/markers
    let r = Q("#users-root") || Q('[data-users-scope]');
    // 2) Legacy anchors: table/tbody -> closest section/div
    r = r || Q("#usersTbody")?.closest("section,div,main") || Q("#usersTable")?.closest("section,div,main");
    // 3) Header text fallback
    if (!r) {
      const headers = QA("h1,h2,h3").filter(h => /(^|\s)users(\s|$)/i.test(h.textContent.trim()));
      if (headers.length) r = headers[0].closest("section,div,main") || headers[0].parentElement;
    }
    // 4) As a last resort, allow global binding (root = document) but keep a flag
    State.root = r || null;
    return !!State.root;
  }

  // ========= Endpoint helpers
  async function hit(method, url, body, headers={}) {
    const h = { "Content-Type":"application/json", ...headers };
    const res = await fetch(url, { method, headers:h, body: body ? JSON.stringify(body) : undefined, credentials:"same-origin" });
    let j=null; const t = await res.text(); try{ j = JSON.parse(t); }catch{}
    return { ok:res.ok, status:res.status, json:j, text:t };
  }
  async function getUsersFrom(url){
    const r = await hit("GET", url);
    if(!r.ok) return null;
    const j = r.json || {};
    const arr = Array.isArray(j) ? j :
                Array.isArray(j.users) ? j.users :
                Array.isArray(j.data) ? j.data :
                Array.isArray(j.results) ? j.results : null;
    return arr;
  }
  function normalizeUser(u, ix=0){
    const id     = u.id ?? u.userId ?? u._id ?? u.uid ?? u.msisdn ?? u.phone ?? String(ix+1);
    const name   = u.name ?? u.fullName ?? u.displayName ?? "—";
    const email  = u.email ?? u.mail ?? "";
    const phone  = u.phone ?? u.msisdn ?? "";
    const type   = u.type ?? u.role ?? "User";
    const status = u.status ?? (u.active===false ? "Inactive":"Active");
    const lastActive = u.lastActive ?? u.lastLogin ?? u.lastSeen ?? "";
    const orders = u.orders ?? u.ordersCount ?? u.orderCount ?? 0;
    return { id:String(id), name, email, phone, type, status, lastActive, orders };
  }
  async function fetchUsers(){
    const bases = [
      "/api/admin/users",
      "/api/users",
      "/api/admin/users/list",
      "/api/user-setup/users",
    ];
    for (const b of bases){
      try{
        const arr = await getUsersFrom(b);
        if (arr) { console.info("[Users] list via", b, "count=", arr.length); return arr.map(normalizeUser); }
      }catch(_){}
    }
    return [];
  }
  async function createOrUpdateUser(payload, userId){
    const tries = userId ? [
      ["PATCH", `/api/admin/users/${encodeURIComponent(userId)}`],
      ["PUT",   `/api/admin/users/${encodeURIComponent(userId)}`],
      ["POST",  `/api/admin/users/update/${encodeURIComponent(userId)}`],
      ["PATCH", `/api/users/${encodeURIComponent(userId)}`],
      ["PUT",   `/api/users/${encodeURIComponent(userId)}`],
      ["POST",  `/api/users/update/${encodeURIComponent(userId)}`],
      ["POST",  `/api/admin/users?id=${encodeURIComponent(userId)}`],
      ["POST",  `/api/users?id=${encodeURIComponent(userId)}`],
    ] : [
      ["POST", `/api/admin/users`],
      ["POST", `/api/users`],
      ["POST", `/api/admin/users/create`],
    ];
    let last;
    for (const [m,u] of tries){
      try{
        const r = await hit(m, u, payload);
        if (r.ok && (r.json?.success !== false)){ console.info("[Users] save via", m, u); return r.json || {success:true}; }
        last = r;
      }catch(e){ last=e; }
    }
    throw last || new Error("Save failed");
  }

  // ========= Rendering
  const fmtLast = s => s ? s.replace("T"," ").replace("Z","Z") : "—";

  function applyFilters(){
    const q = (State.q||"").trim().toLowerCase();
    State.filtered = State.all.filter(u=>{
      if (State.type && u.type !== State.type) return false;
      if (State.status && (u.status||"Active") !== State.status) return false;
      if (q){
        const hay = `${u.name} ${u.email} ${u.phone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    State.page = 1;
  }

  function slicePage(){
    const s = (State.page-1)*State.per;
    return State.filtered.slice(s, s+State.per);
  }

  function renderRows(){
    const tb = State.els.tbody;
    if (!tb) return;
    const rows = slicePage().map((u,i)=>{
      const idx = (State.page-1)*State.per + i + 1;
      const nameA = `<a href="#" class="ws-link" data-users-action="open" data-id="${esc(u.id)}">${esc(u.name)}</a>`;
      const pill  = `<span class="ws-badge ${u.status==='Active'?'ws-badge-success':'ws-badge-muted'}">${esc(u.status||"Active")}</span>`;
      const actions = `
        <button class="ws-btn ws-btn-xs" data-users-action="open" data-id="${esc(u.id)}">View</button>
        <button class="ws-btn ws-btn-xs ws-btn-ghost" data-users-action="deactivate" data-id="${esc(u.id)}">Delete</button>
      `;
      return `<tr data-user-id="${esc(u.id)}">
        <td>${idx}</td>
        <td>${nameA}</td>
        <td>${esc(u.email)}</td>
        <td>${esc(u.phone)}</td>
        <td>${esc(u.type)}</td>
        <td>${esc(u.orders)}</td>
        <td>${pill}</td>
        <td>${esc(fmtLast(u.lastActive))}</td>
        <td class="ws-actions">${actions}</td>
      </tr>`;
    });
    tb.innerHTML = rows.length ? rows.join("") : `<tr class="ws-empty"><td colspan="9">No users found</td></tr>`;
  }

  function renderPager(){
    const info = State.els.info, pager = State.els.pager;
    if (!info || !pager) return;

    const total = State.filtered.length;
    if (!total){ info.textContent = "0–0 of 0"; pager.innerHTML=""; return; }

    const start = (State.page-1)*State.per+1;
    const end   = Math.min(State.page*State.per, total);
    info.textContent = `${start}–${end} of ${total}`;

    const pages = Math.max(1, Math.ceil(total/State.per));
    const btn = (p, label=p, dis=false, cur=false)=>`<button class="ws-page ${cur?'is-active':''}" data-users-action="page" data-page="${p}" ${dis?'disabled':''}>${label}</button>`;
    let html = btn(Math.max(1,State.page-1), "‹", State.page===1);
    for (let p=1;p<=pages;p++){
      if (p===1||p===pages||Math.abs(p-State.page)<=2) html += btn(p, p, false, p===State.page);
      else if (!/…$/.test(html)) html += `<span class="ws-ellipsis">…</span>`;
    }
    html += btn(Math.min(pages,State.page+1), "›", State.page===pages);
    pager.innerHTML = html;
  }

  function render(){
    renderRows();
    renderPager();
    window.dispatchEvent(new CustomEvent("users:rendered"));
  }

  // ========= Modal (Add / Edit)
  function closeModal(){ Q("#usersModal")?.remove(); }
  function openModal(user=null){
    closeModal();
    const isEdit = !!user;
    const html = `
<div id="usersModal" class="ws-modal" style="display:block" aria-hidden="false" role="dialog">
  <div class="ws-dialog">
    <div class="ws-dialog-header">
      <h3 class="ws-dialog-title">${isEdit?"Edit User":"Add User"}</h3>
      <button class="ws-btn ws-btn-ghost ws-btn-xs" data-users-action="modal-close">✖</button>
    </div>
    <div class="ws-dialog-body">
      <form class="ws-form" id="usersForm" novalidate>
        <input type="hidden" id="u-id" value="${esc(user?.id||"")}"/>
        <div class="ws-grid ws-grid-2">
          <label class="ws-field"><span>Name</span>
            <input id="u-name" class="ws-input" type="text" value="${esc(user?.name||"")}" required />
          </label>
          <label class="ws-field"><span>Email</span>
            <input id="u-email" class="ws-input" type="email" value="${esc(user?.email||"")}" />
          </label>
          <label class="ws-field"><span>Phone</span>
            <input id="u-phone" class="ws-input" type="text" value="${esc(user?.phone||"")}" required />
          </label>
          <label class="ws-field"><span>Type</span>
            <select id="u-type" class="ws-select" required>
              ${["","Admin","Driver","Customer","Installer","Manufacturer","User"].map(v=>`<option ${v===(user?.type||"")?"selected":""} value="${v}">${v||"Select…"}</option>`).join("")}
            </select>
          </label>
          <label class="ws-field"><span>Status</span>
            <select id="u-status" class="ws-select">
              <option ${((user?.status||"Active")==="Active")?"selected":""}>Active</option>
              <option ${((user?.status||"Active")==="Inactive")?"selected":""}>Inactive</option>
            </select>
          </label>
          <label class="ws-field ${isEdit?"ws-hidden":""}"><span>Temp Password (optional)</span>
            <input id="u-pass" class="ws-input" type="text" placeholder="Leave blank to auto-generate"/>
          </label>
        </div>
      </form>
    </div>
    <div class="ws-dialog-footer">
      <button class="ws-btn ws-btn-ghost" data-users-action="modal-close">Cancel</button>
      <button class="ws-btn ws-btn-primary" data-users-action="modal-save">Save</button>
    </div>
  </div>
</div>`;
    (State.root || document.body).insertAdjacentHTML("beforeend", html);
    setTimeout(()=>Q("#u-name")?.focus(), 10);
  }

  async function saveModal(){
    const id   = Q("#u-id")?.value?.trim();
    const name = Q("#u-name")?.value?.trim();
    const email= Q("#u-email")?.value?.trim();
    const phone= Q("#u-phone")?.value?.trim();
    const type = Q("#u-type")?.value?.trim();
    const status = Q("#u-status")?.value?.trim();
    const pass = Q("#u-pass")?.value?.trim();
    if (!name || !phone || !type){ alert("Name, phone and type are required."); return; }
    const payload = { name, email, phone, type, status };
    if (!id && pass) payload.password = pass;

    try{
      const r = await createOrUpdateUser(payload, id || null);
      if (id){
        const i = State.all.findIndex(x=>x.id===id);
        if (i>=0) State.all[i] = { ...State.all[i], ...payload };
      } else {
        const newId = r?.user?.id || r?.id || Math.random().toString(36).slice(2);
        State.all.unshift({ id:newId, orders:0, lastActive:"", ...payload });
      }
      applyFilters(); render(); closeModal();
    }catch(err){
      console.warn("[Users] save failed", err);
      alert(err?.json?.error?.message || err?.text || err?.message || "Save failed. Check the endpoint and try again.");
    }
  }

  // ========= Bind UI (legacy-safe selectors)
  function findInScope(sel){
    return State.root ? Q(sel, State.root) : Q(sel);
  }
  function bindUI(){
    // Inputs (with legacy fallbacks)
    State.els.tbody = findInScope("#users-tbody") || findInScope("#usersTbody") || findInScope("#users-table-body");
    State.els.info  = findInScope("#users-table-info") || findInScope("#usersInfo");
    State.els.pager = findInScope("#users-pagination") || findInScope("#usersPager");

    State.els.search = findInScope("#user-search-input") || findInScope("#users-search-input") || findInScope("#usersSearch") || findInScope('input[type="search"]');
    State.els.type   = findInScope("#user-type-filter") || findInScope("#users-type-filter") || findInScope("#usersType");
    State.els.status = findInScope("#user-status-filter") || findInScope("#users-status-filter") || findInScope("#usersStatus");
    State.els.per    = findInScope("#users-per-page") || findInScope("#users-per") || findInScope('select[name="perPage"]');
    State.els.addBtn = findInScope("#users-add-btn") || findInScope("#add-user-btn") || findInScope("#addUserBtn");

    // Search/filters
    State.els.search?.addEventListener("keydown", e => { if(e.key==="Enter"){ State.q = State.els.search.value||""; applyFilters(); render(); }});
    State.els.search?.addEventListener("input",  () => { State.q = State.els.search.value||""; applyFilters(); render(); });
    State.els.type?.addEventListener("change",   () => { State.type = State.els.type.value||""; applyFilters(); render(); });
    State.els.status?.addEventListener("change", () => { State.status = State.els.status.value||""; applyFilters(); render(); });
    State.els.per?.addEventListener("change",    () => {
      const v = parseInt(State.els.per.value,10); State.per = isNaN(v)?10:Math.max(5,v); State.page=1; render();
    });

    // Pager
    State.els.pager?.addEventListener("click", (e)=>{
      const b = e.target.closest("[data-users-action='page'],[data-page]");
      if(!b) return;
      const p = parseInt(b.getAttribute("data-page") || b.dataset.page, 10);
      if (Number.isFinite(p)) { State.page = p; render(); }
    });

    // Add
    State.els.addBtn?.addEventListener("click", ()=> openModal(null));

    // Table actions (namespaced)
    (State.root || document).addEventListener("click", (e)=>{
      const el = e.target.closest("[data-users-action], a.ws-link");
      if (!el) return;
      const act = el.getAttribute("data-users-action") || (el.matches("a.ws-link") ? "open" : "");
      if (!act) return;

      // Preempt other panes
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();

      const id = el.getAttribute("data-id") || el.closest("tr")?.getAttribute("data-user-id") || "";
      switch(act){
        case "open": {
          const u = State.all.find(x=>x.id===id);
          openModal(u || null); break;
        }
        case "deactivate": {
          if (!confirm("Deactivate this user?")) return;
          // Try gentle status update; fall back to inline
          (async () => {
            const payload = { status:"Inactive" };
            const tries = [
              ["PATCH", `/api/admin/users/${encodeURIComponent(id)}/status`],
              ["PUT",   `/api/admin/users/${encodeURIComponent(id)}/status`],
              ["PATCH", `/api/admin/users/${encodeURIComponent(id)}`],
              ["PUT",   `/api/admin/users/${encodeURIComponent(id)}`],
              ["PATCH", `/api/users/${encodeURIComponent(id)}`],
              ["PUT",   `/api/users/${encodeURIComponent(id)}`],
            ];
            for (const [m,u] of tries){
              try{ const r = await hit(m,u,payload); if (r.ok){ const row = State.all.find(x=>x.id===id); if(row) row.status="Inactive"; applyFilters(); render(); return; } }catch{}
            }
            alert("Could not deactivate user (endpoint missing).");
          })();
          break;
        }
        case "modal-close": closeModal(); break;
        case "modal-save":  saveModal(); break;
      }
    });
  }

  // ========= Init
  async function refresh(){
    if (State.inflight) return;
    State.inflight++;
    try{
      State.all = await fetchUsers();
      // initial filter values (read whatever exists)
      State.q = State.els.search?.value || "";
      State.type = State.els.type?.value || "";
      State.status = State.els.status?.value || "";
      State.per = parseInt(State.els.per?.value || "10", 10) || 10;
      applyFilters(); render();
    } finally {
      State.inflight = 0;
    }
  }

  const boot = once(() => {
    findRoot();         // might be null; UI binding handles global fallback
    bindUI();
    refresh();
  });

  // Boot strategies: DOM ready, hash change, partial-loaded custom event
  (document.readyState === "loading")
    ? document.addEventListener("DOMContentLoaded", boot)
    : boot();

  window.addEventListener("hashchange", ()=>{ if (location.hash.includes("users")) boot(); });
  window.addEventListener("admin:partial-loaded", e=>{ if ((e?.detail||"")==="users") boot(); });

  // Dashboard compatibility export
  window.fetchUsers = boot;
  window.AdminUsers = { init: boot };
})();
