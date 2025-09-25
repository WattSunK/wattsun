// public/admin/js/admin-loyalty.js
// Loyalty Admin Visibility — SPA-safe attach
// Phase 1: Read-only wiring for Withdrawals + Accounts + Ledger + Notifications
// Phase 5.4 add: Withdrawals row "Action" menu => Approve / Reject buttons
(function () {
  "use strict";

  // ---------- tiny helpers ----------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);
  const fmtInt = (n) => (n === 0 || n ? Number(n).toLocaleString() : "—");
  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const debounce = (fn, ms=400) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
  const pick = (o, keys, d="—") => { for (const k of keys) if (o && o[k]!=null) return o[k]; return d; };

  // NEW: toast helper for success/error feedback
  function toast(msg, { type="info", ms=2200 } = {}) {
    const t = document.createElement("div");
    t.textContent = msg;
    t.className = `toast toast--${type}`;
    Object.assign(t.style, {
      position:"fixed", right:"16px", bottom:"16px",
      background: type==="error" ? "#b00020" : "#0f766e",
      color:"#fff", padding:"10px 14px", borderRadius:"10px",
      boxShadow:"0 6px 18px rgba(0,0,0,.18)", zIndex:9999,
      fontSize:"14px"
    });
    document.body.appendChild(t);
    setTimeout(()=> t.remove(), ms);
  }

  // API helper
  async function api(path) {
    const res = await fetch(path, { credentials: "include" });
    let data; try { data = await res.json(); } catch { data = {}; }
    if (!res.ok || data?.success === false) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    return data;
  }

  // ---------- SPA-safe activation ----------
  let attached = false;
  let els = {};

  function cacheEls() {
    els = {
      // tab buttons
      tabWithdrawalsBtn: $("#tabWithdrawalsBtn"),
      tabAccountsBtn:    $("#tabAccountsBtn"),
      tabLedgerBtn:      $("#tabLedgerBtn"),
      tabNotifsBtn:      $("#tabNotifsBtn"),
      // panes
      tabWithdrawals: $("#loyaltyTabWithdrawals"),
      tabAccounts:    $("#loyaltyTabAccounts"),
      tabLedger:      $("#loyaltyTabLedger"),
      tabNotifs:      $("#loyaltyTabNotifs"),
      // filters
      statusSel:   $("#statusSel"),
      searchInput: $("#loyaltySearch"),
      clearBtn:    $("#loyaltyClearBtn"),
      refreshBtn:  $("#loyaltyRefreshBtn"),
      // table bodies
      wdBody:            $("#wdBody"),
      accountsBody:      $("#loyaltyAccountsBody"),
      ledgerBody:        $("#loyaltyLedgerBody"),
      notificationsBody: $("#loyaltyNotificationsBody"),
      // meta + pager
      meta:  $("#loyaltyMeta"),
      pager: $("#loyaltyPager"),
    };
  }

  const mo = new MutationObserver(() => tryAttach());
  mo.observe(document.documentElement, { childList:true, subtree:true });

  let tries=0;
  function tryAttach() {
    if (!$("#loyalty-root")) { attached=false; return; }
    if (attached) return;
    cacheEls();
    if (!els.tabAccounts || !els.tabAccountsBtn) { if (++tries<20) setTimeout(tryAttach,50); return; }
    attach();
  }

  // ---------- state ----------
  const state = { activeTab:"Withdrawals", page:1, limit:10, total:null };

  // ---------- attach ----------
  function attach() {
    attached = true; tries=0;
    wireTabs(); wireFilters(); wirePager(); wireGlobalSaveListeners(); wireActionMenus();

    // Default to Withdrawals on load
    state.activeTab = "Withdrawals";
    showTab("Withdrawals");
    loadWithdrawals({ resetPage:true });

    window.loyaltyAdmin = { state, refreshActiveTab, loadWithdrawals, loadAccounts, loadLedger, loadNotifications };
  }

  // ---------- helpers for visibility ----------
  function isShown(el){ return !!el && el.style.display !== "none"; }
  function setShown(el,on){ if (el) el.style.display = on ? "" : "none"; }
  function toggleGhost(btn, on){ btn && btn.classList.toggle("btn--ghost", !!on); }

  // ---------- tabs ----------
  function wireTabs() {
    on(document, "click", (e) => {
      const btn = e.target.closest("#tabWithdrawalsBtn, #tabAccountsBtn, #tabLedgerBtn, #tabNotifsBtn");
      if (!btn) return; e.preventDefault();
      if (btn.id==="tabWithdrawalsBtn"){ showTab("Withdrawals"); loadWithdrawals({ resetPage:true }); }
      if (btn.id==="tabAccountsBtn")   { showTab("Accounts");      loadAccounts({ resetPage:true }); }
      if (btn.id==="tabLedgerBtn")     { showTab("Ledger");        loadLedger(); }
      if (btn.id==="tabNotifsBtn")     { showTab("Notifications"); loadNotifications(); }
    });
  }

  function showTab(name) {
    state.activeTab = name;
    setShown(els.tabWithdrawals, name==="Withdrawals");
    setShown(els.tabAccounts,    name==="Accounts");
    setShown(els.tabLedger,      name==="Ledger");
    setShown(els.tabNotifs,      name==="Notifications");

    // reset classes
    [els.tabWithdrawalsBtn, els.tabAccountsBtn, els.tabLedgerBtn, els.tabNotifsBtn]
      .forEach(btn => btn && btn.classList.remove("btn--active"));

    // ghost style for inactive
    toggleGhost(els.tabWithdrawalsBtn, name!=="Withdrawals");
    toggleGhost(els.tabAccountsBtn,    name!=="Accounts");
    toggleGhost(els.tabLedgerBtn,      name!=="Ledger");
    toggleGhost(els.tabNotifsBtn,      name!=="Notifications");

    // add active class for the current tab
    const activeBtn = {
      "Withdrawals": els.tabWithdrawalsBtn,
      "Accounts": els.tabAccountsBtn,
      "Ledger": els.tabLedgerBtn,
      "Notifications": els.tabNotifsBtn,
    }[name];
    if (activeBtn) activeBtn.classList.add("btn--active");

    // toggle filter groups and reset to All
    ["filterWithdrawals","filterAccounts","filterLedger","filterNotifs"]
      .forEach(id => { const el = document.getElementById(id); if (el) el.style.display="none"; });

    if (name==="Withdrawals") {
      $("#filterWithdrawals").style.display="";
      const sel=document.getElementById("statusSel"); if (sel) sel.value="";
    }
    if (name==="Accounts") {
      $("#filterAccounts").style.display="";
      const sel=document.getElementById("accStatusSel"); if (sel) sel.value="";
    }
    if (name==="Ledger") {
      $("#filterLedger").style.display="";
      const sel=document.getElementById("ledgerKindSel"); if (sel) sel.value="";
    }
    if (name==="Notifications") {
      $("#filterNotifs").style.display="";
      const sel=document.getElementById("notifStatusSel"); if (sel) sel.value="";
    }

    // always clear search on tab switch
    const search = document.getElementById("loyaltySearch");
    if (search) search.value = "";
  }

  // ---------- filters & refresh ----------
  function wireFilters() {
    on(document, "change", (e) => {
      if (["statusSel","accStatusSel","ledgerKindSel","notifStatusSel"].includes(e.target?.id)) {
        state.page=1; refreshActiveTab();
      }
    });

    on(document, "keydown", (e) => {
      if (e.key!=="Enter" || e.target?.id!=="loyaltySearch") return;
      state.page=1; refreshActiveTab();
    });

    const handleAutoSearch = debounce(()=>{ state.page=1; refreshActiveTab(); }, 400);
    on(document, "input", (e) => {
      if (e.target?.id !== "loyaltySearch") return;
      handleAutoSearch();
    });

    on(document, "click", (e) => {
      const clr = e.target.closest("#loyaltyClearBtn");
      if (clr) {
        if(els.statusSel) els.statusSel.value="";
        const accSel=$("#accStatusSel"); if (accSel) accSel.value="";
        const ledSel=$("#ledgerKindSel"); if (ledSel) ledSel.value="";
        const notSel=$("#notifStatusSel"); if (notSel) notSel.value="";
        if(els.searchInput) els.searchInput.value="";
        state.page=1; refreshActiveTab(); return;
      }
      const ref = e.target.closest("#loyaltyRefreshBtn");
      if (ref) refreshActiveTab();
    });
  }

  function refreshActiveTab() {
    cacheEls();
    if (state.activeTab==="Withdrawals") loadWithdrawals({resetPage:false});
    else if (state.activeTab==="Accounts") loadAccounts({resetPage:false});
    else if (state.activeTab==="Ledger") loadLedger();
    else if (state.activeTab==="Notifications") loadNotifications();
    else setMeta(0);
  }

  // ---------- pager (Accounts only for now) ----------
  function wirePager() {
    on(document, "click", (e) => {
      const btn = e.target.closest("#loyaltyPager button"); if (!btn) return;
      const label = btn.textContent.trim().toLowerCase();
      const {page,limit,total}=state;
      if (label.startsWith("first")) state.page=1;
      else if (label.includes("prev")) state.page=Math.max(1,page-1);
      else if (label.includes("next")) state.page=page+1;
      else if (label.startsWith("last") && typeof total==="number") state.page=Math.max(1, Math.ceil(total/limit));
      refreshActiveTab();
    });
  }

  function updatePager() {
    const pager = els.pager || $("#loyaltyPager"); if (!pager) return;
    const btns = $$("button", pager);
    const first=btns[0], prev=btns[1], current=btns[2], next=btns[3], last=btns[4];
    const {page,limit,total}=state;
    const hasPrev = page>1; let hasNext=true, maxPage=null;
    if (typeof total==="number"){ maxPage=Math.max(1,Math.ceil(total/limit)); hasNext=page<maxPage; }
    setDisabled(first,!hasPrev); setDisabled(prev,!hasPrev);
    setDisabled(next,!hasNext); setDisabled(last,!(hasNext && maxPage!==null));
    if (current) current.textContent=String(page);
  }
  function setDisabled(btn,on){ if(btn){ btn.disabled=!!on; btn.classList.toggle("is-disabled", !!on); } }

  // ---------- QUERY ----------
  function buildQuery() {
    const p = new URLSearchParams();
    const q=($("#loyaltySearch")?.value||"").trim();

    if (state.activeTab==="Withdrawals") {
      const s=($("#statusSel")?.value||"").trim();
      if (s) p.set("status", s);
    }
    if (state.activeTab==="Accounts") {
      const s=($("#accStatusSel")?.value||"").trim();
      if (s) p.set("status", s);
    }
    if (state.activeTab==="Ledger") {
      const k=($("#ledgerKindSel")?.value||"").trim();
      if (k) p.set("kind", k);
    }
    if (state.activeTab==="Notifications") {
      const s=($("#notifStatusSel")?.value||"").trim();
      if (s) p.set("status", s);
    }

    if (q) p.set("q", q);
    p.set("page", String(state.page));
    p.set("limit", String(state.limit));
    return `?${p.toString()}`;
  }

  // ---------- WITHDRAWALS ----------
  async function loadWithdrawals({ resetPage=false } = {}) {
    if (resetPage) state.page = 1;
    cacheEls();
    const tbody = els.wdBody || $("#wdBody");
    addLoading(tbody, true);
    try {
      const resp = await fetch(`/api/admin/loyalty/withdrawals${buildQuery()}`, { credentials: "include" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const rows = Array.isArray(data) ? data : (data.withdrawals || []);
      state.total = null;
      renderWithdrawalsRows(tbody, rows);
      setMeta(rows.length);
    } catch (err) {
      showErrorRow(tbody, err, 9);
      setMeta(0);
    } finally {
      addLoading(tbody, false);
    }
  }

  function actionCellHtml(id, status) {
    const disabled = status !== "Pending"; // only Pending can be actioned right now
    if (disabled) {
      return `<div class="muted">—</div>`;
    }
    // Small inline menu; approve/reject buttons are picked up by external binders
    return `
      <div class="ws-actions relative" data-id="${esc(id)}">
        <button type="button" class="btn-actions px-2 py-1 rounded border bg-white hover:bg-gray-50">
          Action ▾
        </button>
        <div class="actions-menu hidden absolute right-0 mt-1 w-36 rounded-md border bg-white shadow-lg">
          <button type="button"
            class="w-full text-left px-3 py-2 hover:bg-green-50 btn-approve"
            data-id="${esc(id)}">Approve</button>
          <button type="button"
            class="w-full text-left px-3 py-2 hover:bg-red-50 btn-reject"
            data-id="${esc(id)}">Reject…</button>
        </div>
      </div>
    `;
  }

  function renderWithdrawalsRows(tbody, rows) {
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!rows || rows.length === 0) {
      tbody.appendChild(emptyRow(9));
      return;
    }
    const frag = document.createDocumentFragment();
    for (const r of rows) {
      const id   = pick(r, ["id","withdrawal_id"]);
      const user = pick(r, ["email","user_email","user_id"]);
      const pts  = pick(r, ["points","requested_pts"], 0);
      const eur  = pick(r, ["eur","requested_eur"], 0);
      const st   = pick(r, ["status"]);
      const req  = pick(r, ["requested_at","created_at"]);
      const dec  = pick(r, ["decided_at"]);
      const paid = pick(r, ["paid_at"]);
      const tr = document.createElement("tr");
      tr.dataset.id = id; // used by approve/reject binders
      tr.innerHTML = `
        <td>${esc(id)}</td>
        <td>${esc(user)}</td>
        <td>${fmtInt(pts)}</td>
        <td>${fmtInt(eur)}</td>
        <td>${esc(st)}</td>
        <td>${esc(req)}</td>
        <td>${esc(dec)}</td>
        <td>${esc(paid)}</td>
        <td>${actionCellHtml(id, st)}</td>
      `;
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
  }

  // ---------- Actions menu wiring ----------
  function wireActionMenus() {
    // Toggle menu
    on(document, "click", (e) => {
      const btn = e.target.closest(".btn-actions");
      if (!btn) return;
      const wrap = btn.closest(".ws-actions");
      if (!wrap) return;
      e.preventDefault();

      // close all others
      $$(".actions-menu").forEach(m => m.classList.add("hidden"));

      // toggle this one
      const menu = wrap.querySelector(".actions-menu");
      if (menu) menu.classList.toggle("hidden");
    });

    // Close on outside click
    on(document, "click", (e) => {
      if (e.target.closest(".ws-actions")) return; // clicks inside keep open (Approve/Reject handlers will close)
      $$(".actions-menu").forEach(m => m.classList.add("hidden"));
    });

    // Close after any menu item click (lets other binders run)
    on(document, "click", (e) => {
      const inMenu = e.target.closest(".actions-menu");
      if (!inMenu) return;
      $$(".actions-menu").forEach(m => m.classList.add("hidden"));
    });

    // Close on ESC
    on(document, "keydown", (e) => {
      if (e.key === "Escape") $$(".actions-menu").forEach(m => m.classList.add("hidden"));
    });
  }

  // ---------- ACCOUNTS ----------
  async function loadAccounts({resetPage=false}={}) {
    if (resetPage) state.page=1;
    cacheEls();
    const tbody = els.accountsBody || $("#loyaltyAccountsBody");
    addLoading(tbody,true);
    try{
      const data = await api(`/api/admin/loyalty/accounts${buildQuery()}`);
      const rows = Array.isArray(data)?data:(data.accounts||[]);
      state.total = (typeof data.total==="number")?data.total:null;
      const count = renderAccountsRows(tbody, rows);
      setMeta(count, state.total);
      updatePager();
    }catch(err){
      showErrorRow(tbody, err, 11);
      setMeta(0); state.total=null; updatePager();
    }finally{ addLoading(tbody,false); }
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
  async function loadLedger(){
    cacheEls(); const tbody=els.ledgerBody||$("#loyaltyLedgerBody"); if (!tbody) return;
    addLoading(tbody,true);
    try{
      const data = await api(`/api/admin/loyalty/ledger${buildQuery()}`);
      const rows = Array.isArray(data)?data:(data.ledger||[]);
      tbody.innerHTML="";
      if (!rows.length) tbody.appendChild(emptyRow(6));
      else {
        const frag=document.createDocumentFragment();
        for (const l of rows){
          const tr=document.createElement("tr");
          tr.innerHTML=`
            <td>${esc(l.id)}</td>
            <td>${esc(l.account_id)}</td>
            <td>${esc(l.kind)}</td>
            <td>${fmtInt(l.delta_points)}</td>
            <td>${esc(l.note ?? "—")}</td>
            <td>${esc(l.created_at)}</td>`;
          frag.appendChild(tr);
        }
        tbody.appendChild(frag);
      }
      setMeta(rows.length);
    }catch(err){ showErrorRow(tbody,err,6); setMeta(0); }
    finally{ addLoading(tbody,false); }
  }

  // ---------- NOTIFICATIONS ----------
  // NEW: helpers for recipient + note rendering
  function renderRecipient(n) {
    const email = (n?.email || "").trim();
    if (email) return email;
    const acct = n?.account_id ?? n?.accountId ?? null;
    const user = n?.user_id ?? n?.userId ?? null;
    if (acct) return `acct: ${acct}`;
    if (user) return `user: ${user}`;
    try {
      const p = typeof n?.payload === "string" ? JSON.parse(n.payload) : (n?.payload || {});
      if (p.accountId) return `acct: ${p.accountId}`;
      if (p.userId)    return `user: ${p.userId}`;
    } catch {}
    return "—";
  }
  function renderNote(n) {
    if (n?.note && String(n.note).trim()) return String(n.note).trim();
    try {
      const p = typeof n?.payload === "string" ? JSON.parse(n.payload) : (n?.payload || {});
      return p?.note ? String(p.note).trim() : "";
    } catch { return ""; }
  }

  async function loadNotifications(){
    cacheEls(); const tbody=els.notificationsBody||$("#loyaltyNotificationsBody"); if (!tbody) return;
    addLoading(tbody,true);
    try{
      const data = await api(`/api/admin/loyalty/notifications${buildQuery()}`);
      const rows = Array.isArray(data)?data:(data.notifications||[]);
      tbody.innerHTML="";
      if (!rows.length) tbody.appendChild(emptyRow(5));
      else {
        const frag=document.createDocumentFragment();
        for (const n of rows){
          const tr=document.createElement("tr");
          const recipient = renderRecipient(n);
          const note = renderNote(n);
          tr.innerHTML=`
            <td>${esc(n.id)}</td>
            <td>${esc(n.kind)}</td>
            <td>
              ${esc(recipient)}
              ${note ? `<div class="muted" style="font-size:.85em; line-height:1.2;">${esc(note)}</div>` : ""}
            </td>
            <td>${esc(n.status)}</td>
            <td>${esc(n.created_at)}</td>`;
          frag.appendChild(tr);
        }
        tbody.appendChild(frag);
      }
      setMeta(rows.length);
    }catch(err){ showErrorRow(tbody,err,5); setMeta(0); }
    finally{ addLoading(tbody,false); }
  }

  // ---------- render helpers ----------
  function emptyRow(colspan, text="(No data yet)"){
    const tr=document.createElement("tr"); const td=document.createElement("td");
    td.colSpan=colspan; td.className="muted"; td.textContent=text; tr.appendChild(td); return tr;
  }
  function showErrorRow(tbody, err, colspan){
    if (!tbody) return; tbody.innerHTML="";
    const tr=document.createElement("tr"); const td=document.createElement("td");
    td.colSpan=colspan; td.innerHTML=`<span style="color:#a00;">Error:</span> ${esc(err?.message||String(err))}`;
    tr.appendChild(td); tbody.appendChild(tr);
  }
  function addLoading(tbody,on){ const table=tbody?.closest("table"); if(!table) return; table.classList.toggle("is-loading", !!on); }
  function setMeta(count, total){
    const meta=els.meta||$("#loyaltyMeta"); if(!meta) return;
    meta.textContent = (typeof total==="number") ? `${count} / ${total} results` : `${count} results`;
  }

  // ---------- global save hooks (NEW) ----------
  function wireGlobalSaveListeners() {
    // Anywhere in the app, after a successful save:
    //   window.dispatchEvent(new CustomEvent('loyalty:save-success'));
    // On error:
    //   window.dispatchEvent(new CustomEvent('loyalty:save-error', { detail:{ message:'...' } }));
    window.addEventListener("loyalty:save-success", () => {
      toast("Saved ✅", { type:"info" });
      refreshActiveTab();
    });
    window.addEventListener("loyalty:save-error", (e) => {
      const msg = e?.detail?.message || "Save failed";
      toast(`Error: ${msg}`, { type:"error" });
    });
  }

  // ---------- kick off ----------
  if (document.readyState==="loading") document.addEventListener("DOMContentLoaded", tryAttach);
  else tryAttach();
})();
// EOF
