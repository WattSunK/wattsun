// public/admin/js/admin-loyalty.js
// Loyalty Admin — SPA-safe attach, tabs + lists + actions
// Increment 2 & 3 fixes:
// - User search + inline validation in New Withdrawal
// - Auto-fill Account ID from selected user
// - Floating Actions menu with robust auto-close + global closer
// - Guard duplicate global handlers + per-action re-entrancy (prevents double notifications)
// - Pagination: auto-inject pager if missing; works even without API totals
// - ✅ Always pass ?source= on Approve/Reject/Mark-Paid
// - ✅ Status column shows a tiny Customer/Admin chip
// - ✅ After actions, also refresh Accounts & Ledger tabs

(function () {
  "use strict";

  // ---------- tiny helpers ----------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);
  const fmtInt = (n) => (n === 0 || n ? Number(n).toLocaleString() : "—");
  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const debounce = (fn, ms=350) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

  function toast(msg, { type="info", ms=2200 } = {}) {
    const t = document.createElement("div");
    t.textContent = msg;
    t.className = `toast toast--${type}`;
    Object.assign(t.style, {
      position:"fixed", right:"16px", bottom:"16px",
      background: type==="error" ? "#b00020" : "#0f766e",
      color:"#fff", padding:"10px 14px", borderRadius:"10px",
      boxShadow:"0 6px 18px rgba(0,0,0,.18)", zIndex:9999, fontSize:"14px"
    });
    document.body.appendChild(t);
    setTimeout(()=> t.remove(), ms);
  }

  async function api(path) {
    const res = await fetch(path, { credentials: "include" });
    let data; try { data = await res.json(); } catch { data = {}; }
    if (!res.ok || data?.success === false) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    return data;
  }

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      credentials:"include",
      body: JSON.stringify(body||{})
    });
    let data = null; try { data = await res.json(); } catch {}
    if (!res.ok || data?.success === false) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      const code = data?.error?.code || "ERROR";
      throw new Error(`${code}: ${msg}`);
    }
    return data;
  }

  // ---- public helper surface (exported) ----
  if (!window.wsAdmin) window.wsAdmin = {};
  Object.assign(window.wsAdmin, {
    toast,            // show snack/toast messages
    debounce,         // debounce util for inputs
    esc,              // HTML escaper (optional, handy in admin HTML)
    api, postJSON,    // fetch helpers with error handling
    refreshActiveTab, // lets outside code trigger a refresh
    loadAccounts,     // optional: useful for admin flows to reload the Accounts tab
  });

  // ---------- SPA-safe activation ----------
  let attached = false;
  let currentRoot = null; // track which #loyalty-root we’re wired to
  let els = {};

  // Global handler guard (so we don't bind document/window handlers twice)
  let actionsHandlersBound = false;

  // Re-entrancy guard for action clicks (prevents duplicate requests/notifications)
  const runningActions = new Set(); // keys like "approve:123", "reject:45"

  function cacheEls() {
    els = {
      root: $("#loyalty-root"),
      tabWithdrawalsBtn: $("#tabWithdrawalsBtn"),
      tabAccountsBtn:    $("#tabAccountsBtn"),
      tabLedgerBtn:      $("#tabLedgerBtn"),
      tabNotifsBtn:      $("#tabNotifsBtn"),
      tabWithdrawals: $("#loyaltyTabWithdrawals"),
      tabAccounts:    $("#loyaltyTabAccounts"),
      tabLedger:      $("#loyaltyTabLedger"),
      tabNotifs:      $("#loyaltyTabNotifs"),
      searchInput: $("#loyaltySearch"),
      clearBtn:    $("#loyaltyClearBtn"),
      refreshBtn:  $("#loyaltyRefreshBtn"),
      statusSel:   $("#statusSel"),
      accStatusSel: $("#accStatusSel"),
      ledgerKindSel: $("#ledgerKindSel"),
      notifStatusSel: $("#notifStatusSel"),
      wdBody:            $("#wdBody"),
      accountsBody:      $("#loyaltyAccountsBody"),
      ledgerBody:        $("#loyaltyLedgerBody"),
      notificationsBody: $("#loyaltyNotificationsBody"),
      meta:  $("#loyaltyMeta"),
      pager: $("#loyaltyPager"),
    };
  }

  function ensurePager() {
    if (!els.pager) {
      const p = document.createElement("div");
      p.id = "loyaltyPager";
      p.style.display = "flex";
      p.style.gap = "8px";
      p.style.alignItems = "center";
      p.style.margin = "16px 0";
      p.innerHTML = `
        <button class="btn pager-prev" type="button">Prev</button>
        <button class="btn pager-next" type="button">Next</button>
        <span id="loyaltyMeta" class="muted" style="margin-left:8px;"></span>
      `;
      const anchor = els.root || document.body;
      anchor.appendChild(p);
      els.pager = p;
      els.meta = $("#loyaltyMeta");
    }
  }

  function scheduleAttach() {
    setTimeout(() => {
      const root = document.getElementById("loyalty-root");
      if (!root) return;
      if (currentRoot !== root) {
        currentRoot = root;
        attached = false;
      }
      if (attached) return;
      cacheEls();
      ensurePager();
      attach();
    }, 0);
  }

  function tryAttach() {
    const root = document.getElementById("loyalty-root");
    if (!root) return;
    if (currentRoot !== root) {
      currentRoot = root;
      attached = false;
    }
    if (!attached) scheduleAttach();
  }

  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1) {
          if (node.id === "loyalty-root" || node.querySelector?.("#loyalty-root")) {
            tryAttach();
          }
        }
      }
    }
  });
  mo.observe(document.body, { childList:true, subtree:true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryAttach);
  } else {
    tryAttach();
  }

  // ---------- state ----------
  const state = {
    activeTab:"Withdrawals",
    page:1,
    limit:10,
    total:null,
    lastCount:0
  };

  // ---------- attach ----------
  function attach() {
    attached = true;
    wireTabs();
    wireFilters();
    wirePager();

    if (!actionsHandlersBound) {
      wireInlineActionsMenu();
      actionsHandlersBound = true;
    }

    wireNewWithdrawalModal();
    wireManageModal();

    state.activeTab = "Withdrawals";
    showTab("Withdrawals");
    loadWithdrawals({ resetPage:true });

    window.addEventListener("focus", () => { try { refreshActiveTab(); } catch {} });
    window.addEventListener("storage", (e) => {
      if (e.key === "loyaltyUpdatedAt") { try { refreshActiveTab(); } catch {} }
    });
    window.addEventListener("message", (e) => {
      if (e && e.data && e.data.type === "loyalty-updated") { try { refreshActiveTab(); } catch {} }
    });

    window.loyaltyAdmin = { state, refreshActiveTab, loadWithdrawals, loadAccounts, loadLedger, loadNotifications };
  }

  // ---------- tabs ----------
  function toggleGhost(btn, on){ btn && btn.classList.toggle("btn--ghost", !!on); }
  function setShown(el,on){ if (el) el.style.display = on ? "" : "none"; }

  function wireTabs() {
    on(document, "click", (e) => {
      const btn = e.target.closest("#tabWithdrawalsBtn, #tabAccountsBtn, #tabLedgerBtn, #tabNotifsBtn");
      if (!btn) return; e.preventDefault();
      if (btn.id==="tabWithdrawalsBtn"){ showTab("Withdrawals"); loadWithdrawals({ resetPage:true }); }
      if (btn.id==="tabAccountsBtn")   { showTab("Accounts");      loadAccounts({ resetPage:true }); }
      if (btn.id==="tabLedgerBtn")     { showTab("Ledger");        loadLedger({ resetPage:true }); }
      if (btn.id==="tabNotifsBtn")     { showTab("Notifications"); loadNotifications({ resetPage:true }); }
    });
  }

  function showTab(name) {
    cacheEls();
    ensurePager();
    state.activeTab = name;
    setShown(els.tabWithdrawals, name==="Withdrawals");
    setShown(els.tabAccounts,    name==="Accounts");
    setShown(els.tabLedger,      name==="Ledger");
    setShown(els.tabNotifs,      name==="Notifications");

    const newBtn = document.getElementById("wdNewBtn");
    if (newBtn) newBtn.style.display = (name === "Withdrawals") ? "" : "none";

    [els.tabWithdrawalsBtn, els.tabAccountsBtn, els.tabLedgerBtn, els.tabNotifsBtn]
      .forEach(btn => btn && btn.classList.remove("btn--active"));

    toggleGhost(els.tabWithdrawalsBtn, name!=="Withdrawals");
    toggleGhost(els.tabAccountsBtn,    name!=="Accounts");
    toggleGhost(els.tabLedgerBtn,      name!=="Ledger");
    toggleGhost(els.tabNotifsBtn,      name!=="Notifications");

    const activeBtn = {
      "Withdrawals": els.tabWithdrawalsBtn,
      "Accounts": els.tabAccountsBtn,
      "Ledger": els.tabLedgerBtn,
      "Notifications": els.tabNotifsBtn,
    }[name];
    if (activeBtn) activeBtn.classList.add("btn--active");

    ["filterWithdrawals","filterAccounts","filterLedger","filterNotifs"].forEach(id => {
      const el = document.getElementById(id); if (el) el.style.display="none";
    });

    if (name==="Withdrawals") { $("#filterWithdrawals").style.display=""; const sel=$("#statusSel"); if (sel) sel.value=""; }
    if (name==="Accounts")    { $("#filterAccounts").style.display="";  const sel=$("#accStatusSel"); if (sel) sel.value=""; }
    if (name==="Ledger")      { $("#filterLedger").style.display="";    const sel=$("#ledgerKindSel"); if (sel) sel.value=""; }
    if (name==="Notifications"){ $("#filterNotifs").style.display="";   const sel=$("#notifStatusSel"); if (sel) sel.value=""; }

    const search = document.getElementById("loyaltySearch"); if (search) search.value = "";
  }

  function buildQuery() {
    const p = new URLSearchParams();
    p.set("page", String(state.page));
    p.set("limit", String(state.limit));
    const q = els.searchInput?.value?.trim(); if (q) p.set("q", q);
    if (state.activeTab === "Withdrawals") {
      const st = els.statusSel?.value?.trim(); if (st) p.set("status", st);
    } else if (state.activeTab === "Accounts") {
      const st = els.accStatusSel?.value?.trim(); if (st) p.set("status", st);
    } else if (state.activeTab === "Ledger") {
      const k = els.ledgerKindSel?.value?.trim(); if (k) p.set("kind", k);
    } else if (state.activeTab === "Notifications") {
      const st = els.notifStatusSel?.value?.trim(); if (st) p.set("status", st);
    }
    return `?${p.toString()}`;
  }

  function setMeta(count, total=null) {
    if (!els.meta) return;
    const p = state.page, l = state.limit, s = (p-1)*l + 1, e = (p-1)*l + count;
    els.meta.textContent = total!=null ? `${s}–${e} of ${fmtInt(total)}` : `${count} row(s)`;
  }

  function updatePager(){
    ensurePager();
    const prev = els.pager?.querySelector(".pager-prev");
    const next = els.pager?.querySelector(".pager-next");
    const hasPrev = state.page > 1;
    const hasNext = (state.total != null)
      ? (state.page < Math.ceil(state.total / state.limit))
      : (state.lastCount === state.limit);
    if (prev) prev.disabled = !hasPrev;
    if (next) next.disabled = !hasNext;
  }

  function wirePager(){
    ensurePager();
    const prev = els.pager?.querySelector(".pager-prev");
    const next = els.pager?.querySelector(".pager-next");
    on(prev, "click", () => {
      if (state.page>1){ state.page--; refreshActiveTab(); }
    });
    on(next, "click", () => {
      if (state.total == null && state.lastCount < state.limit) return;
      state.page++; refreshActiveTab();
    });
  }

  function refreshActiveTab(){
    if (state.activeTab === "Withdrawals") return loadWithdrawals();
    if (state.activeTab === "Accounts")    return loadAccounts();
    if (state.activeTab === "Ledger")      return loadLedger();
    if (state.activeTab === "Notifications")return loadNotifications();
  }

  function setRefreshDisabled(on){
    cacheEls();
    if (!els.refreshBtn) return;
    els.refreshBtn.disabled = !!on;
    els.refreshBtn.classList.toggle("is-loading", !!on);
  }

  function wireFilters(){
    if (els.searchInput){
      on(els.searchInput, "input", debounce(()=>{ state.page=1; refreshActiveTab(); }, 300));
    }
    on(els.clearBtn, "click", () => {
      if (els.searchInput) els.searchInput.value = "";
      const map = {
        "Withdrawals": els.statusSel,
        "Accounts": els.accStatusSel,
        "Ledger": els.ledgerKindSel,
        "Notifications": els.notifStatusSel
      };
      const sel = map[state.activeTab];
      if (sel) sel.value = "";
      state.page = 1;
      refreshActiveTab();
    });
    on(els.refreshBtn, "click", () => { refreshActiveTab(); });

    ["change"].forEach(ev => {
      on(els.statusSel, ev, ()=>{ state.page=1; loadWithdrawals(); });
      on(els.accStatusSel, ev, ()=>{ state.page=1; loadAccounts(); });
      on(els.ledgerKindSel, ev, ()=>{ state.page=1; loadLedger(); });
      on(els.notifStatusSel, ev, ()=>{ state.page=1; loadNotifications(); });
    });
  }

  // ---------- WITHDRAWALS ----------
  async function loadWithdrawals({resetPage=false}={}){
    if (resetPage) state.page=1; cacheEls(); ensurePager();
    const tbody = els.wdBody || $("#wdBody");
    addLoading(tbody,true); setRefreshDisabled(true);
    try{
      const data = await api(`/api/admin/loyalty/withdrawals${buildQuery()}`);
      const rows = Array.isArray(data)?data:(data.withdrawals||[]);
      state.total = (typeof data.total==="number")?data.total:null;
      state.lastCount = rows.length;
      renderWithdrawalsRows(tbody, rows);
      setMeta(rows.length, state.total);
      updatePager();
    }catch(err){
      showErrorRow(tbody, err, 9);
      setMeta(0); state.total=null; state.lastCount=0; updatePager();
    }finally{ addLoading(tbody,false); setRefreshDisabled(false); }
  }

 // ─────────────────────────────────────────────
// Action Cell Builder (Lifecycle-aware)
// Covers both Admin- and Customer-initiated withdrawals
// ─────────────────────────────────────────────
function actionCellHtml(id, status, source) {
  const st = String(status || "").trim().toLowerCase();

   // Lifecycle logic
  const canApprove = st === "pending";
  const canReject  = st === "pending";
  const canPay     = st === "approved";
  const noAction   = st === "no action" || st === "paid" || st === "rejected";

  // 🔸 Enhanced rule: disable Approve/Reject once handled
  const disableApproveReject =
    st === "approved" || st === "no action" || st === "rejected";



  // If finalised → no interactive menu
  if (!(canApprove || canReject || canPay) || noAction) {
    return `
      <span class="badge badge--muted" data-no-actions="1"
            style="display:inline-block;padding:2px 8px;border-radius:12px;
                   background:#9ca3af;color:#fff;font-size:12px;"
            title="Already settled or finalised">
        No actions
      </span>`;
  }

  const src = esc(source || "customer");
  return `
    <div class="ws-actions" data-has-actions="1" style="position:relative;"
         data-id="${esc(id)}" data-source="${src}">
      <button class="btn btn-actions" aria-haspopup="menu"
              data-id="${esc(id)}" data-source="${src}">Actions ▾</button>
      <div class="actions-menu hidden" role="menu" data-id="${esc(id)}">
  <button class="btn btn-approve"
    data-id="${esc(id)}"
    data-source="${src}"
    ${(canApprove && !disableApproveReject) ? "" : "disabled"}>
    Approve
  </button>

  <button class="btn btn-reject"
    data-id="${esc(id)}"
    data-source="${src}"
    ${(canReject && !disableApproveReject) ? "" : "disabled"}>
    Reject
  </button>

  <button class="btn btn-mark-paid"
    data-id="${esc(id)}"
    data-source="${src}"
    ${canPay ? "" : "disabled"}>
    Mark Paid
  </button>
</div>
  
    </div>`;
}


  function renderWithdrawalsRows(tbody, rows){
    if (!tbody) return; tbody.innerHTML = "";
    if (!rows?.length){ tbody.appendChild(emptyRow(9)); return; }
    const frag = document.createDocumentFragment();
    for (const w of rows){
      const id   = w.id ?? w.withdrawal_id ?? w.withdrawalId ?? "—";
      const acct = w.account_id ?? w.accountId ?? "—";
      const user = w.user_id ?? w.userId ?? w.email ?? w.phone ?? "—";
      const pts  = w.requested_points ?? w.points ?? 0;
      const st   = w.status ?? "—";
      const req  = w.requested_at ?? w.created_at ?? w.createdAt ?? "—";
      const dec  = w.decided_at ?? w.decidedAt ?? "—";
      const paid = w.paid_at ?? w.paidAt ?? "—";
      const src  = (w.source === "admin") ? "Admin" : "Customer";
      let badgeColor = "#f5c542"; // pending → yellow
      if (st.toLowerCase() === "approved") badgeColor = "#3b82f6"; // blue
      if (st.toLowerCase() === "no action") badgeColor = "#16a34a"; // green

      const tr=document.createElement("tr"); tr.dataset.id = id;
      tr.innerHTML = `
        <td>${esc(id)}</td>
        <td>${esc(acct)}</td>
        <td>${esc(user)}</td>
        <td>${fmtInt(pts)}</td>
        <td>${esc(st)} <span class="badge badge--muted" title="Source" style="margin-left:6px;">${src}</span></td>
        <td>${esc(req)}</td>
        <td>${esc(dec)}</td>
        <td>${esc(paid)}</td>
        <td>${actionCellHtml(id, st, w.source)}</td>`;
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
  }

  // ---------- shared row helpers ----------
  function addLoading(tbody, on){ if (!tbody) return; if (on){ tbody.setAttribute("aria-busy","true"); } else tbody.removeAttribute("aria-busy"); }
  function emptyRow(cols){ const tr=document.createElement("tr"); tr.innerHTML=`<td colspan="${cols}">No data</td>`; return tr; }
  function showErrorRow(tbody, err, cols){ if (!tbody) return; tbody.innerHTML=""; const tr=document.createElement("tr"); tr.innerHTML = `<td colspan="${cols}">${esc(err.message||String(err))}</td>`; tbody.appendChild(tr); }

  // ---------- Floating Actions menu ----------
  let openMenuEl = null;

  function closeFloatingMenu() {
    if (openMenuEl && openMenuEl.parentNode === document.body) {
      openMenuEl.remove();
    }
    openMenuEl = null;
  }
  window.wsCloseActionsMenu = closeFloatingMenu;

  function openFloatingMenu(btn) {
    closeFloatingMenu();
    const cellMenu = btn.closest(".ws-actions")?.querySelector(".actions-menu");
    if (!cellMenu) return;
    const menu = cellMenu.cloneNode(true);
    menu.classList.remove("hidden");
    Object.assign(menu.style, {
      position: "fixed",
      top: "0px",
      left: "0px",
      zIndex: "10000",
      background: "white",
      border: "1px solid rgba(0,0,0,.12)",
      borderRadius: "8px",
      boxShadow: "0 10px 24px rgba(0,0,0,.18)",
      padding: "8px",
      display: "flex",
      flexDirection: "column",
      gap: "6px"
    });
    const r = btn.getBoundingClientRect();
    const pad = 6;
    menu.style.top = `${r.bottom + pad}px`;
    menu.style.left = `${Math.min(window.innerWidth - 180, r.left)}px`;
    // copy data-source onto the cloned buttons
    menu.querySelectorAll("button").forEach(b => {
      if (!b.dataset.source) b.dataset.source = btn.dataset.source || "customer";
    });
    document.body.appendChild(menu);
    openMenuEl = menu;
  }

  function actionKey(action, id){ return `${action}:${id}`; }

  function wireInlineActionsMenu() {
    // --- helpers: action URLs with source ---
    function buildWithdrawalActionUrl(rowOrId, action, src) {
      const id = typeof rowOrId === 'object' ? rowOrId.id : rowOrId;
      const source = encodeURIComponent(src || (rowOrId?.source) || 'customer');
      return `/api/admin/loyalty/withdrawals/${id}/${action}?source=${source}`;
    }

    // Toggle floating menu
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-actions");
      if (!btn) return;
      const wrap = btn.closest(".ws-actions");
      if (!wrap || wrap.dataset.hasActions !== "1") return;
      e.preventDefault();
      e.stopPropagation();
      openFloatingMenu(btn);
    });

    document.addEventListener("click", (e) => {
      if (openMenuEl && !openMenuEl.contains(e.target) && !e.target.closest(".btn-actions")) {
        closeFloatingMenu();
      }
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeFloatingMenu(); });
    document.addEventListener("click", (e) => {
      if (e.target.closest(".actions-menu .btn-approve, .actions-menu .btn-reject, .actions-menu .btn-mark-paid")) {
        closeFloatingMenu();
      }
    }, true);
    window.addEventListener("scroll", closeFloatingMenu, { passive: true });
    window.addEventListener("resize", closeFloatingMenu);

    // ---- Action handlers (now pass ?source=) ----
    document.addEventListener("click", async (e)=>{
      const btn = e.target.closest(".btn-approve"); if (!btn) return;
      e.preventDefault();
      const id  = btn.dataset.id;
      const src = btn.dataset.source || btn.closest(".ws-actions")?.dataset.source || "customer";
      const key = actionKey("approve", id);
      if (runningActions.has(key)) return;
      runningActions.add(key);
      try{
        const url = buildWithdrawalActionUrl(id, "approve", src);
        const res = await fetch(url, { method: "PATCH", credentials: "include" });
        const data = await res.json().catch(()=>({}));
        if (!res.ok || data?.success === false) throw new Error(data?.error?.message || `HTTP ${res.status}`);
        toast(`Withdrawal #${id} approved`, {type:"info"});
        refreshActiveTab();
        try { loadAccounts(); } catch {}
        try { loadLedger(); } catch {}
      }catch(err){ toast(err.message||"Approve failed", {type:"error"}); }
      finally { runningActions.delete(key); }
    });

    document.addEventListener("click", async (e)=>{
      const btn = e.target.closest(".btn-reject"); if (!btn) return;
      e.preventDefault();
      const id  = btn.dataset.id;
      const src = btn.dataset.source || btn.closest(".ws-actions")?.dataset.source || "customer";
      const key = actionKey("reject", id);
      if (runningActions.has(key)) return;
      runningActions.add(key);
      try{
        const url = buildWithdrawalActionUrl(id, "reject", src);
        const res = await fetch(url, { method: "PATCH", credentials: "include" });
        const data = await res.json().catch(()=>({}));
        if (!res.ok || data?.success === false) throw new Error(data?.error?.message || `HTTP ${res.status}`);
        toast(`Withdrawal #${id} rejected`, {type:"info"});
        refreshActiveTab();
        try { loadAccounts(); } catch {}
        try { loadLedger(); } catch {}
      }catch(err){ toast(err.message||"Reject failed", {type:"error"}); }
      finally { runningActions.delete(key); }
    });

    document.addEventListener("click", async (e)=>{
      const btn = e.target.closest(".btn-mark-paid"); if (!btn) return;
      e.preventDefault();
      const id  = btn.dataset.id;
      const src = btn.dataset.source || btn.closest(".ws-actions")?.dataset.source || "customer";
      const key = actionKey("paid", id);
      if (runningActions.has(key)) return;
      runningActions.add(key);
      try{
        const url = buildWithdrawalActionUrl(id, "mark-paid", src);
        const res = await fetch(url, {
          method: "PATCH", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payoutRef: "" })
        });
        const data = await res.json().catch(()=>({}));
        if (!res.ok || data?.success === false) throw new Error(data?.error?.message || `HTTP ${res.status}`);
        toast(`Withdrawal #${id} marked as paid`, {type:"info"});
        refreshActiveTab();
        try { loadAccounts(); } catch {}
        try { loadLedger(); } catch {}
      }catch(err){ toast(err.message||"Mark Paid failed", {type:"error"}); }
      finally { runningActions.delete(key); }
    });
  }

  // ---------- NOTIFICATIONS ----------
  async function loadNotifications({resetPage=false}={}){
    if (resetPage) state.page=1; cacheEls(); ensurePager();
    const tbody = els.notificationsBody || $("#loyaltyNotificationsBody");
    addLoading(tbody,true); setRefreshDisabled(true);
    try{
      const data = await api(`/api/admin/loyalty/notifications${buildQuery()}`);
      const rows = Array.isArray(data)?data:(data.notifications||[]);
      state.total = (typeof data.total==="number")?data.total:null;
      state.lastCount = rows.length;
      renderNotifRows(tbody, rows);
      setMeta(rows.length, state.total);
      updatePager();
    }catch(err){
      showErrorRow(tbody, err, 5);
      setMeta(0); state.total=null; state.lastCount=0; updatePager();
    }finally{ addLoading(tbody,false); setRefreshDisabled(false); }
  }

  function renderNotifRows(tbody, rows){
    if (!tbody) return; 
    tbody.innerHTML = "";

    if (!rows?.length){
      tbody.appendChild(emptyRow(5));
      return;
    }
    const frag = document.createDocumentFragment();
    for (const n of rows){
      const id      = n.id;
      const kind    = n.kind ?? "—";
      const email   = n.email ?? n.user_email ?? n.recipient_email ?? n.to ?? "—";
      const status  = n.status ?? "—";
      const created = n.created_at ?? n.createdAt ?? "";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(id)}</td>
        <td>${esc(kind)}</td>
        <td>${esc(email)}</td>
        <td>${esc(status)}</td>
        <td>${esc(created)}</td>
      `;
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
  }

  // ---------- NEW WITHDRAWAL modal wiring ----------
  const SEARCH_URL = "/api/admin/users/search";
  const SEARCH_DEBOUNCE_MS = 250;

  async function searchUsers(term) {
    if (!term || term.trim().length < 2) return [];
    try {
      const r = await fetch(`${SEARCH_URL}?q=${encodeURIComponent(term)}`, { credentials: "same-origin" });
      const j = await r.json();
      const arr = Array.isArray(j) ? j : (j.results || j.users || []);
      if (!Array.isArray(arr)) return [];
      return arr.map(u => ({
        id: u.id,
        name: u.name || "",
        email: u.email || "",
        phone: u.phone || "",
        account_id: u.account_id ?? u.accountId ?? null,
        status: u.status || "",
        program_name: u.program_name || u.programName || "",
        minWithdrawPoints: u.minWithdrawPoints ?? u.min_withdraw_points ?? 0,
        balancePoints: u.balancePoints ?? u.balance_points ?? u.balance ?? 0
      }));
    } catch {
      return [
        { id: 1, name: "Demo User", email: "demo@example.com", phone: "+254700000001", account_id: 101, status: "Active", program_name: "WattSun Rewards", balancePoints: 900, minWithdrawPoints: 200 }
      ];
    }
  }

  function wireNewWithdrawalModal() {
    const dlg    = document.getElementById("wdNewDialog");
    const btn    = document.getElementById("wdNewBtn");
    const create = document.getElementById("wdCreateBtn"); // old ID; preserved
    const accId  = document.getElementById("wdAccId");     // legacy visible field
    const pts    = document.getElementById("wdPoints");
    const note   = document.getElementById("wdNote");
    const out    = document.getElementById("wdOut");

    const sInput   = document.getElementById("wdUserSearch");
    const sResults = document.getElementById("wdUserResults");
    const hidAcc   = document.getElementById("wdAccountId");

    const hintProg = document.getElementById("wdHintProgram");
    const hintMin  = document.getElementById("wdHintMin");
    const hintBal  = document.getElementById("wdHintBal");
    const inlineErr= document.getElementById("wdError");

    const legacyHint = document.getElementById("wdBalanceHint");
    const submitBtn  = document.getElementById("wdSubmit") || create;

    if (!btn || !dlg) return;

    let picked = null;

    const setOut = (msg) => { if (out) out.textContent = msg || ""; };

    const showInlineError = (msg) => {
      if (inlineErr) {
        inlineErr.textContent = msg || "";
        inlineErr.style.display = msg ? "block" : "none";
      } else {
        setOut(msg || "");
      }
    };

    const setSubmitEnabled = (ok) => { if (submitBtn) submitBtn.disabled = !ok; };

    const syncVisibleAccountId = () => {
      if (!accId) return;
      const val = (hidAcc && hidAcc.value) ? String(hidAcc.value) : "";
      accId.value = val;
      accId.readOnly = !!val;
      accId.classList.toggle("input--readonly", !!val);
    };

    const getRequestedPoints = () => {
      const raw = (pts?.value || "").toString();
      const num = parseInt(raw.replace(/[^\d\-]/g, ""), 10);
      return Number.isFinite(num) ? num : 0;
    };

    const renderHint = () => {
      const min = picked?.minWithdrawPoints ?? 0;
      const bal = picked?.balancePoints ?? picked?.balance ?? 0;
      const prog= picked?.program_name || "";

      if (hintProg) hintProg.textContent = prog || "—";
      if (hintMin)  hintMin.textContent  = String(min);
      if (hintBal)  hintBal.textContent  = String(bal);
      else if (legacyHint) {
        legacyHint.textContent = `Program: ${prog || "—"} | Minimum withdrawal = ${min} points; Balance = ${bal} points`;
      }
    };

    const validatePoints = (val, min, bal) => {
      const p = Number(val);
      if (!Number.isFinite(p) || p <= 0) return { ok:false, msg:"Enter points" };
      if (min != null && p < Number(min)) return { ok:false, msg:`Minimum is ${min} points` };
      if (bal != null && p > Number(bal)) return { ok:false, msg:`Exceeds balance (${bal})` };
      return { ok:true };
    };

    const updateValidity = () => {
      const accountId = (hidAcc && hidAcc.value) ? parseInt(hidAcc.value, 10) : (accId ? parseInt(accId.value, 10) : NaN);
      const req = getRequestedPoints();
      const min = picked?.minWithdrawPoints ?? 0;
      const bal = picked?.balancePoints ?? picked?.balance ?? Infinity;
      renderHint();
      const res = validatePoints(req, min, bal);
      showInlineError(res.ok ? "" : res.msg);

      const okNewFlow = (!!sInput || !!sResults) ? (!!accountId && res.ok) : true;
      const okLegacy  = (!sInput && !sResults) ? (Number.isInteger(accountId) && accountId > 0 && Number.isInteger(req) && req > 0) : true;
      const ok = okNewFlow && okLegacy;
      setSubmitEnabled(ok);
      return ok;
    };

    const clearSearchUI = () => {
      picked = null;
      if (sInput) sInput.value = "";
      if (sResults) sResults.innerHTML = "";
      if (hidAcc) hidAcc.value = "";
      syncVisibleAccountId();
      renderHint();
      updateValidity();
    };

    const renderNoResults = () => {
      if (!sResults) return;
      if (sResults.tagName === "SELECT") {
        sResults.innerHTML = "";
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "No results found";
        opt.disabled = true;
        opt.selected = true;
        sResults.appendChild(opt);
      } else {
        sResults.innerHTML = `<div class="muted">No results found</div>`;
      }
      picked = null;
      if (hidAcc) hidAcc.value = "";
      syncVisibleAccountId();
      renderHint();
      updateValidity();
    };

    const renderResults = (users=[]) => {
      if (!sResults) return;
      if (!users.length) { renderNoResults(); return; }
      if (sResults.tagName === "SELECT") {
        sResults.innerHTML = "";
        users.forEach(u => {
          const opt = document.createElement("option");
          opt.value = String(u.id);
          opt.textContent = `${u.name || u.email || u.phone || ('User#'+u.id)}${u.account_id ? "" : " (no active account)"}`;
          opt.dataset.payload = JSON.stringify(u);
          sResults.appendChild(opt);
        });
        sResults.selectedIndex = 0;
        sResults.dispatchEvent(new Event("change"));
      } else {
        sResults.innerHTML = "";
        users.forEach(u => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn btn--ghost";
          btn.textContent = `${u.name || u.email || u.phone || ('User#'+u.id)}${u.account_id ? "" : " (no active account)"}`;
          btn.dataset.payload = JSON.stringify(u);
          btn.addEventListener("click", () => {
            picked = u;
            if (hidAcc) hidAcc.value = u.account_id || "";
            syncVisibleAccountId();
            renderHint();
            updateValidity();
          });
          sResults.appendChild(btn);
        });
      }
    };

    const doSearch = debounce(async () => {
      if (!sInput) return;
      const term = sInput.value;
      if (!term || term.trim().length < 2) {
        sResults && (sResults.innerHTML = "");
        picked = null;
        if (hidAcc) hidAcc.value = "";
        syncVisibleAccountId();
        renderHint();
        updateValidity();
        return;
      }
      const users = await searchUsers(term);
      renderResults(users);
    }, SEARCH_DEBOUNCE_MS);

    btn && btn.addEventListener("click", () => {
      try { window.wsCloseActionsMenu && window.wsCloseActionsMenu(); } catch (_) {}
      if (accId) { accId.value = ""; accId.readOnly = false; accId.classList.remove("input--readonly"); }
      if (pts) pts.value = "";
      if (note) note.value = "";
      setOut("");
      showInlineError("");
      clearSearchUI();
      try { dlg.showModal(); } catch(_){/* safari fallback ignored */ }
    });

    if (sInput) sInput.addEventListener("input", doSearch);
    if (sResults && sResults.tagName === "SELECT") {
      sResults.addEventListener("change", () => {
        const opt = sResults.options[sResults.selectedIndex];
        picked = opt ? JSON.parse(opt.dataset.payload) : null;
        if (hidAcc) hidAcc.value = picked?.account_id || "";
        syncVisibleAccountId();
        renderHint();
        updateValidity();
      });
    }
    if (pts) pts.addEventListener("input", updateValidity);

    if (submitBtn) {
      submitBtn.addEventListener("click", async () => {
        setOut("");
        showInlineError("");

        const accountIdVal = (hidAcc && hidAcc.value) ? hidAcc.value : (accId ? accId.value : "");
        const accountId = parseInt(accountIdVal, 10);
        const points = getRequestedPoints();
        const n = (note?.value || "").trim();

        if ((sInput || sResults) && picked) {
          const min = picked?.minWithdrawPoints ?? 0;
          const bal = picked?.balancePoints ?? picked?.balance ?? Infinity;
          if (!accountId || isNaN(accountId)) {
            showInlineError("Select a user with an active loyalty account.");
            return;
          }
          const res = validatePoints(points, min, bal);
          if (!res.ok) { showInlineError(res.msg); return; }
        } else {
          if (!Number.isInteger(accountId) || accountId < 1) { showInlineError("Please enter a valid Account ID."); return; }
          if (!Number.isInteger(points) || points < 1) { showInlineError("Please enter points ≥ 1."); return; }
        }

        try {
          submitBtn.disabled = true;
          const resp = await postJSON("/api/admin/loyalty/withdrawals", { accountId, points, note:n });
          const id = resp?.withdrawal?.id ?? "—";
          toast(`Created withdrawal #${id} (${points} pts)`, { type:"info" });

          try { dlg.close("close"); } catch(_){}

          try { loadWithdrawals(); } catch(_){}
          try { loadAccounts({ resetPage:true }); } catch(_){}

          try {
            localStorage.setItem("loyaltyUpdatedAt", String(Date.now()));
            window.postMessage({ type: "loyalty-updated" }, "*");
          } catch (_) {}

        } catch (e) {
          showInlineError(e.message || "Failed to create withdrawal");
          toast("Error creating withdrawal", { type:"error" });
        } finally {
          submitBtn.disabled = false;
        }
      });
    }

    setSubmitEnabled(false);
    renderHint();
  }

  // ---------- ACCOUNTS ----------
  async function loadAccounts({resetPage=false}={}) {
    if (resetPage) state.page=1; cacheEls(); ensurePager();
    const tbody = els.accountsBody || $("#loyaltyAccountsBody");
    addLoading(tbody,true); setRefreshDisabled(true);
    try{
      const data = await api(`/api/admin/loyalty/accounts${buildQuery()}`);
      const rows = Array.isArray(data)?data:(data.accounts||[]);
      state.total = (typeof data.total==="number")?data.total:null;
      state.lastCount = rows.length;
      const count = renderAccountsRows(tbody, rows);
      setMeta(count, state.total);
      updatePager();
    }catch(err){
      showErrorRow(tbody, err, 11);
      setMeta(0); state.total=null; state.lastCount=0; updatePager();
    }finally{ addLoading(tbody,false); setRefreshDisabled(false); }
  }

  function renderAccountsRows(tbody, rows){
    if (!tbody) return 0; tbody.innerHTML = "";
    if (!rows?.length){ tbody.appendChild(emptyRow(11)); return 0; }
    const frag = document.createDocumentFragment();
    for (const a of rows){
      const tr=document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(a.id)}</td>
        <td>${esc(a.user_id)}</td>
        <td>${esc(a.email ?? "—")}</td>
        <td>${esc(a.status)}</td>
        <td>${esc(a.start_date ?? "—")}</td>
        <td>${esc(a.end_date   ?? "—")}</td>
        <td>${fmtInt(a.duration_months)}</td>
        <td>${fmtInt(a.points_balance)}</td>
        <td>${fmtInt(a.total_earned)}</td>
        <td>${fmtInt(a.total_penalty)}</td>
        <td>${fmtInt(a.total_paid)}</td>`;
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
    return rows.length;
  }

  // ---------- LEDGER ----------
  async function loadLedger({resetPage=false}={}){
    if (resetPage) state.page=1; cacheEls(); ensurePager();
    const tbody = els.ledgerBody || $("#loyaltyLedgerBody");
    addLoading(tbody,true); setRefreshDisabled(true);
    try{
      const data = await api(`/api/admin/loyalty/ledger${buildQuery()}`);
      const rows = Array.isArray(data)
        ? data
        : (data.ledger || data.rows || data.items || []);
      state.total = (typeof data.total==="number")?data.total:null;
      state.lastCount = rows.length;
      renderLedgerRows(tbody, rows);
      setMeta(rows.length, state.total);
      updatePager();
    }catch(err){
      showErrorRow(tbody, err, 8);
      setMeta(0); state.total=null; state.lastCount=0; updatePager();
    }finally{ addLoading(tbody,false); setRefreshDisabled(false); }
  }

  function renderLedgerRows(tbody, rows){
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!rows || !rows.length) { tbody.appendChild(emptyRow(8)); return; }

    const frag = document.createDocumentFragment();

    for (const r of rows){
      const delta = (r.delta_points ?? r.points_delta ?? r.pointsDelta ?? r.delta ?? r.points ?? 0);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(r.id)}</td>
        <td>${esc(r.account_id ?? r.accountId ?? "—")}</td>
        <td>${esc(r.kind ?? "—")}</td>
        <td>${fmtInt(delta)}</td>
        <td>${esc(r.note ?? "")}</td>
        <td>${esc(r.created_at ?? r.createdAt ?? "")}</td>
        <td>${esc(r.source ?? "")}</td>
        <td>${esc(r.ref_id ?? r.refId ?? "")}</td>
      `;
      frag.appendChild(tr);
    }

    tbody.appendChild(frag);
  }

  // ---------- NOTIFS UI helpers ----------
  function addLoading(tbody, on){ if (!tbody) return; if (on){ tbody.setAttribute("aria-busy","true"); } else tbody.removeAttribute("aria-busy"); }
  function emptyRow(cols){ const tr=document.createElement("tr"); tr.innerHTML=`<td colspan="${cols}">No data</td>`; return tr; }
  function showErrorRow(tbody, err, cols){ if (!tbody) return; tbody.innerHTML=""; const tr=document.createElement("tr"); tr.innerHTML = `<td colspan="${cols}">${esc(err.message||String(err))}</td>`; tbody.appendChild(tr); }

  // ---------- Manage modal search (helper) ----------
  async function manageSearchUsers(term) {
    const t = (term || "").trim();
    if (t.length < 2) return [];
    try {
      const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(t)}`, {
        credentials: "include"
      });
      const j = await res.json().catch(() => ({}));
      const arr = Array.isArray(j) ? j : (j.results || j.users || []);
      if (!Array.isArray(arr)) return [];
      return arr.map(u => ({
        id: u.id,
        name: u.name || "",
        email: u.email || "",
        phone: u.phone || "",
        account_id: u.account_id ?? u.accountId ?? null,
        status: u.status || "",
        program_name: u.program_name || u.programName || "",
        balancePoints: u.balancePoints ?? u.balance_points ?? u.balance ?? 0,
        minWithdrawPoints: u.minWithdrawPoints ?? u.min_withdraw_points ?? 0
      }));
    } catch {
      return [];
    }
  }

  // ---------- Manage modal: search + create + apply ----------
  function wireManageModal(){
    const dlg   = document.getElementById("accManageDialog");
    const btn   = document.getElementById("accManageBtn");
    if (!dlg) return;

    const showManageBtn = (on) => { if (btn) btn.style.display = on ? "" : "none"; };
    document.addEventListener("click", (e) => {
      if (e.target?.id === "tabAccountsBtn") showManageBtn(true);
      if (e.target?.id === "tabWithdrawalsBtn" || e.target?.id === "tabLedgerBtn" || e.target?.id === "tabNotifsBtn") showManageBtn(false);
    });

    const sInput   = document.getElementById("mUserSearch");
    const sResults = document.getElementById("mUserResults");
    const accId    = document.getElementById("mAccId") || document.querySelector("#accManageDialog input[placeholder*='e.g. 1']");
    const userId   = document.getElementById("mUserId") || document.querySelector("#accManageDialog input[placeholder*='e.g. 42']");
    const out      = document.getElementById("mOut")    || document.querySelector("#accManageDialog #accManageResponse, #accManageDialog .response");
    const mCreate  = document.getElementById("mCreateBtn");

    const hintProg = document.getElementById("mHintProgram");
    const hintMin  = document.getElementById("mHintMin");
    const hintElig = document.getElementById("mHintEligible");
    const hintStart= document.getElementById("mHintStart");
    const hintEnd  = document.getElementById("mHintEnd");

    const statusSel= document.getElementById("mStatus") || document.querySelector("#accManageDialog select");
    const extDate  = document.getElementById("mExtendDate");
    const eligDate = document.getElementById("mEligibleFrom");
    const extNote  = document.getElementById("mExtendNote")   || document.querySelector("#accManageDialog input[placeholder='reason or note']");
    const penPts   = document.getElementById("mPenaltyPoints")|| document.querySelector("#accManageDialog input[placeholder='e.g. 10']");
    const penNote  = document.getElementById("mPenaltyNote")  || document.querySelector("#accManageDialog input[placeholder='reason for penalty']");
    const applyBtn = document.getElementById("mApplyAll") || document.querySelector("#accManageDialog .card-actions .btn.btn--primary, #accManageDialog .card-actions .btn");

    if (applyBtn && !applyBtn.dataset.wsEndDateBound) {
      applyBtn.dataset.wsEndDateBound = "1";
      applyBtn.addEventListener("click", async () => {
        try {
          const idStr = (accId && accId.value) ? accId.value.trim() : "";
          const id = parseInt(idStr, 10);
          if (!Number.isInteger(id) || id <= 0) {
            out && (out.textContent = "Pick a user with an active account first.");
            return;
          }

          const end = (extDate && extDate.value) ? extDate.value.trim() : "";
          if (end && !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
            out && (out.textContent = "Extend Date must be YYYY-MM-DD.");
            return;
          }

          applyBtn.disabled = true;

          if (end) {
            const r = await fetch(`/api/admin/loyalty/accounts/${id}/end-date`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ end_date: end })
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || j?.success === false) throw new Error(j?.error?.message || `HTTP ${r.status}`);
          }

          const elig = (eligDate && eligDate.value) ? eligDate.value.trim() : "";
          if (elig && !/^\d{4}-\d{2}-\d{2}$/.test(elig)) {
            out && (out.textContent = "Eligible From must be YYYY-MM-DD.");
            return;
          }
          if (elig) {
            const r2 = await fetch(`/api/admin/loyalty/accounts/${id}/eligible-from`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ eligible_from: elig })
            });
            const j2 = await r2.json().catch(() => ({}));
            if (!r2.ok || j2?.success === false) throw new Error(j2?.error?.message || `HTTP ${r2.status}`);
          }

          toast("Changes applied.", { type: "info" });
          try { if (typeof loadAccounts === "function") loadAccounts({ resetPage:true }); } catch {}
          try { if (pickedUser?.id) await hydrateForUser({ id: pickedUser.id }); } catch {}

          try {
            localStorage.setItem("loyaltyUpdatedAt", String(Date.now()));
            window.postMessage({ type: "loyalty-updated" }, "*");
          } catch (_) {}

        } catch (e) {
          out && (out.textContent = e.message || "Apply failed.");
          toast(e.message || "Apply failed", { type: "error" });
        } finally {
          applyBtn.disabled = false;
        }
      });
    }

    // --- Clear account-related UI (prevents stale values while hydrating) ---
    function clearManageAccountUI() {
      if (accId) {
        accId.value = "";
        accId.readOnly = true;
        accId.classList.add("input--readonly");
      }
      if (statusSel) statusSel.value = "Active";
      if (extDate)  extDate.value  = "";
      if (eligDate) eligDate.value = "";

      if (mCreate) { mCreate.style.display = "none"; mCreate.disabled = false; }

      if (hintProg) hintProg.textContent = "—";
      if (hintMin)  hintMin.textContent  = "—";
      if (hintElig) hintElig.textContent = "—";
      if (hintStart)hintStart.textContent= "—";
      if (hintEnd)  hintEnd.textContent  = "—";
      if (out) out.textContent = "";
    }

    let pickedUser = null;
    let program    = null;

    const asDate = (d) => (d instanceof Date ? d : new Date(d));
    const ymd = (d) => {
      if (!d) return "—";
      const z = asDate(d);
      return `${z.getFullYear()}-${String(z.getMonth()+1).padStart(2,"0")}-${String(z.getDate()).padStart(2,"0")}`;
    };

    async function apiGet(url){
      const r = await fetch(url, { credentials: "include" });
      let j = null; try { j = await r.json(); } catch {}
      if (!r.ok || j?.success === false) throw new Error(j?.error?.message || `HTTP ${r.status}`);
      return j;
    }
    async function apiPost(url, body){
      const r = await fetch(url, { method:"POST", credentials:"include", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body||{}) });
      let j = null; try { j = await r.json(); } catch {}
      if (!r.ok || j?.success === false) throw new Error(j?.error?.message || `HTTP ${r.status}`);
      return j;
    }

    async function loadProgram(){
      if (program) return program;
      try { program = await apiGet("/api/admin/loyalty/program"); } catch { program = {}; }
      return program;
    }

    function computeDatesFromProgram(){
      const today = new Date();
      const start = ymd(today);
      const end = new Date(today);
      const dur = parseInt(program?.durationMonths ?? 6, 10) || 6;
      end.setMonth(end.getMonth() + dur);
      const elig = new Date(today);
      const wait = parseInt(program?.withdrawWaitDays ?? 90, 10) || 90;
      elig.setDate(elig.getDate() + wait);
      return { start, end: ymd(end), eligible: ymd(elig) };
    }

    function renderHints({ programName="—", min="—", start="—", end="—", eligible="—" }){
      if (hintProg) hintProg.textContent = programName;
      if (hintMin)  hintMin.textContent  = String(min);
      if (hintStart)hintStart.textContent= start;
      if (hintEnd)  hintEnd.textContent  = end;
      if (hintElig) hintElig.textContent = eligible;
    }

    async function hydrateForUser(u){
      pickedUser = u;
      if (userId && u?.id) {
        userId.value = String(u.id);
        userId.readOnly = true;
        userId.classList.add("input--readonly");
      }
      if (mCreate) { mCreate.style.display = "none"; mCreate.disabled = false; }

      // Fetch user's account
      let acct = null;
      try {
        const q = new URLSearchParams({
          userId: String(u.id),
          user_id: String(u.id),
          active: "true"
        }).toString();
        const data = await apiGet(`/api/admin/loyalty/accounts?${q}`);
        let rows = Array.isArray(data) ? data : (data.accounts || []);
        rows = rows.filter(r => String(r.user_id ?? r.userId) === String(u.id));
        if (rows?.length) {
          const actives = rows.filter(a =>
            a.is_active === true ||
            a.active === true ||
            String(a.status || "").toLowerCase() === "active"
          );
          acct = actives.sort((a,b)=> (b.id||0)-(a.id||0))[0] || null;
        }
      } catch {}

      const prog = await loadProgram();
      const progName = prog?.name || "—";
      const minPts = prog?.minWithdrawPoints ?? prog?.min_withdraw_points ?? null;

      let start, end, eligible;

      if (acct) {
        if (accId) { accId.value = String(acct.id); accId.readOnly = true; accId.classList.add("input--readonly"); }
        if (statusSel) statusSel.value = acct.status || "Active";
        if (extDate)   extDate.value = (acct.end_date || "").slice(0,10);
        if (eligDate)  eligDate.value = (acct.eligible_from || "").slice(0,10);
        if (mCreate) mCreate.style.display = "none";
      } else {
        if (accId) { accId.value = ""; accId.readOnly = true; accId.classList.add("input--readonly"); }
        if (statusSel) statusSel.value = "Active";
        if (extDate)   extDate.value = "";
        if (eligDate)  eligDate.value = "";
        if (mCreate) { mCreate.style.display = ""; mCreate.disabled = false; }
      }

      if (acct) {
        start    = (acct.start_date     || "").slice(0, 10);
        end      = (acct.end_date       || "").slice(0, 10);
        eligible = (acct.eligible_from  || "").slice(0, 10);
      } else {
        const d = computeDatesFromProgram();
        start = d.start; end = d.end; eligible = d.eligible;
      }

      renderHints({ programName: progName, min: (minPts ?? "—"), start, end, eligible });
    }

    const debounceFn = (typeof debounce === "function")
      ? debounce
      : (fn,ms)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms||300); }; };

    const doSearch = debounceFn(async () => {
      const term = sInput?.value || "";
      if (!term.trim()) { if (sResults) sResults.innerHTML = ""; pickedUser = null; return; }
      let users = [];
      try { users = await manageSearchUsers(term); } catch { users = []; }
      if (!sResults) return;
      sResults.innerHTML = "";
      if (!users.length){
        const opt = document.createElement("option");
        opt.value = ""; opt.textContent = "No results"; opt.disabled = true; opt.selected = true;
        sResults.appendChild(opt); return;
      }
      users.forEach(u => {
        const opt = document.createElement("option");
        const label = `${u.name || u.email || u.phone || ('User#'+u.id)}${u.account_id ? "" : " (no active account)"}`;
        opt.value = String(u.id); opt.textContent = label; opt.dataset.payload = JSON.stringify(u);
        sResults.appendChild(opt);
      });
      sResults.selectedIndex = 0;
      sResults.dispatchEvent(new Event("change"));
    }, 250);

    if (sInput) sInput.addEventListener("input", doSearch);
    if (sResults) sResults.addEventListener("change", () => {
      const opt = sResults.options[sResults.selectedIndex];
      const u = opt ? JSON.parse(opt.dataset.payload || "{}") : null;
      clearManageAccountUI();
      if (extDate) extDate.value = "";
      if (eligDate) eligDate.value = "";
      if (u && u.id) hydrateForUser(u);
    });
    if (btn) btn.addEventListener("click", () => {
      clearManageAccountUI();
      try { dlg.showModal(); } catch {}
    });

    // Create Active Account
    if (mCreate){
      mCreate.addEventListener("click", async ()=>{
        if (!pickedUser?.id) { out && (out.textContent = "Pick a user first."); return; }
        try {
          mCreate.disabled = true;
          await apiPost("/api/admin/loyalty/accounts", { userId: pickedUser.id });
          toast("Active account created", { type: "info" });
          out && (out.textContent = "Active account created.");
          try { loadAccounts({ resetPage:true }); } catch {}
          await hydrateForUser({ id: pickedUser.id });
        } catch (e) {
          out && (out.textContent = e.message || "Create failed");
          toast(e.message || "Create failed", { type: "error" });
        } finally {
          mCreate.disabled = false;
        }
      });
    }
  }

})();
