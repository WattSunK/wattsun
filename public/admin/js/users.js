/* Compat shim for legacy loader expecting /admin/js/users.js + fetchUsers()
   - Dynamically loads /admin/js/admin-users.js once.
   - Then calls AdminUsers.init() (or the global fallbacks) safely.
   - Idempotent: multiple calls won’t re‑init or re‑load.
*/
(function () {
  const ADMIN_USERS_SRC = "/admin/js/admin-users.js";
  let loaded = false;
  let loadingPromise = null;

  function ensureAdminUsersLoaded() {
    if (loaded || window.AdminUsers || window.initAdminUsers) {
      loaded = true;
      return Promise.resolve();
    }
    if (loadingPromise) return loadingPromise;

    loadingPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = ADMIN_USERS_SRC + (ADMIN_USERS_SRC.includes("?") ? "" : `?v=${Date.now()}`); // cache‑bust first load
      s.async = true;
      s.onload = () => {
        loaded = true;
        resolve();
      };
      s.onerror = (e) => reject(new Error("Failed to load admin-users.js"));
      document.body.appendChild(s);
    });
    return loadingPromise;
  }

  async function initUsers() {
    await ensureAdminUsersLoaded();
    // Prefer the official namespace, then fallbacks exposed by admin-users.js
    if (window.AdminUsers && typeof window.AdminUsers.init === "function") {
      return window.AdminUsers.init();
    }
    if (typeof window.initAdminUsers === "function") {
      return window.initAdminUsers();
    }
    // As a last resort, try once more after a microtask (in case of late defines)
    queueMicrotask(() => {
      if (window.AdminUsers?.init) window.AdminUsers.init();
    });
  }

  // Legacy entrypoint expected by dashboard.js
  window.fetchUsers = initUsers;

  // Also kick automatically if the users partial is already present
  function autoKick() {
    if (document.getElementById("users-root")) initUsers();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoKick);
  } else {
    autoKick();
  }
})();


// ===== Users surgical skin (non-breaking) =====
(function(){
  const $ = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  function badge(text){
    const t=(text||'').trim().toLowerCase();
    if(!t) return '';
    const cls = t==='active' ? 'ws-badge ws-badge-success' : 'ws-badge ws-badge-muted';
    return `<span class="${cls}">${text}</span>`;
  }
  function skinRows(){
    const tbody = $('#usersTbody');
    if(!tbody) return;
    $$('#usersTbody tr').forEach(tr=>{
      const statusCell = tr.querySelector('[data-col="status"], .col-status') || tr.children[4];
      if(statusCell && !statusCell.dataset.wsBadged){
        const raw = statusCell.textContent.trim();
        statusCell.innerHTML = badge(raw) || raw;
        statusCell.dataset.wsBadged = '1';
      }
      const actions = tr.querySelector('.actions');
      if(actions && !actions.dataset.wsSkinned){
        $$('button', actions).forEach(b=>{
          if(!b.classList.contains('ws-btn')){
            b.classList.add('ws-btn','ws-btn-xs');
          }
        });
        actions.dataset.wsSkinned = '1';
      }
    });
  }
  function skinShell(){
    const table = $('#usersTable'); if(table) table.classList.add('ws-admin-table');
    const wrap = table ? table.closest('div') : null;
    if(wrap) wrap.classList.add('ws-admin-card');
    $('#usersPager')?.classList.add('ws-admin-pager');
    $('#usersSearch')?.classList.add('ws-admin-input');
    $('#usersStatus')?.classList.add('ws-admin-input');
  }
  function observe(){
    const tbody = $('#usersTbody'); if(!tbody) return;
    const mo = new MutationObserver(()=>skinRows());
    mo.observe(tbody, {childList:true, subtree:false});
  }
  // Hook custom event if controller emits it
  window.addEventListener('users:rendered', ()=>{ skinRows(); });
  document.addEventListener('DOMContentLoaded', ()=>{ skinShell(); skinRows(); observe(); });
})();
