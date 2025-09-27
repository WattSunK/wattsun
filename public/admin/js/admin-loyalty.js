// public/admin/js/admin-loyalty.js
// Loyalty Admin — SPA-safe attach, tabs + lists + actions
// Includes: New Withdrawal (admin-initiated) modal wiring + Increment 2 (user search) + Increment 3 (UX & validation polish)
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
    const res = await fetch(url, { method:"POST", headers:{"Content-Type":"application/json"}, credentials:"include", body: JSON.stringify(body||{}) });
    let data = null; try { data = await res.json(); } catch {}
    if (!res.ok || data?.success === false) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      const code = data?.error?.code || "ERROR";
      throw new Error(`${code}: ${msg}`);
    }
    return data;
  }

  // ---------- SPA-safe activation (robust to partial swaps) ----------
  let attached = false;
  let currentRoot = null; // track which #loyalty-root we’re wired to
  let els = {};

  function cacheEls() {
    els = {
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

  function scheduleAttach() {
    // microtask → next tick: ensure inner DOM finished rendering
    setTimeout(() => {
      const root = document.getElementById("loyalty-root");
      if (!root) return;
      if (currentRoot !== root) {
        currentRoot = root;
        attached = false;
      }
      if (attached) return;
      cacheEls();
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

  // Observe for partial swaps: whenever a new #loyalty-root appears, attach again.
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      // If the partial is replaced, we’ll see new nodes added under body
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

  // Also kick it once on initial load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryAttach);
  } else {
    tryAttach();
  }

  // ---------- state ----------
  const state = { activeTab:"Withdrawals", page:1, limit:10, total:null };

  // ---------- attach ----------
  function attach() {
    attached = true;
    wireTabs();
    wireFilters();
    wirePager();
    wireInlineActionsMenu();
    wireNewWithdrawalModal(); // Increment 2 + 3 wiring

    state.activeTab = "Withdrawals";
    showTab("Withdrawals");
    loadWithdrawals({ resetPage:true });

    // Optional global listeners so other tabs auto-refresh when we emit signals
    window.addEventListener("focus", () => { try { refreshActiveTab(); } catch {} });
    window.addEventListener("storage", (e) => {
      if (e.key === "loyaltyUpdatedAt") { try { refreshActiveTab(); } catch {} }
    });
    window.addEventListener("message", (e) => {
      if (e && e.data && e.data.type === "loyalty-updated") { try { refreshActiveTab(); } catch {} }
    });

    // Debug hook (can be removed)
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
    state.activeTab = name;
    setShown(els.tabWithdrawals, name==="Withdrawals");
    setShown(els.tabAccounts,    name==="Accounts");
    setShown(els.tabLedger,      name==="Ledger");
    setShown(els.tabNotifs,      name==="Notifications");

    // Show the "New Withdrawal" button only on Withdrawals tab
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
    const prev = els.pager?.querySelector(".pager-prev");
    const next = els.pager?.querySelector(".pager-next");
    if (prev) prev.disabled = state.page<=1;
    if (next) next.disabled = state.total!=null ? state.page >= Math.ceil(state.total/state.limit) : false;
  }

  function wirePager(){
    const prev = els.pager?.querySelector(".pager-prev");
    const next = els.pager?.querySelector(".pager-next");
    on(prev, "click", () => { if (state.page>1){ state.page--; refreshActiveTab(); } });
    on(next, "click", () => { state.page++; refreshActiveTab(); });
  }

  function refreshActiveTab(){
    if (state.activeTab === "Withdrawals") return loadWithdrawals();
    if (state.activeTab === "Accounts")    return loadAccounts();
    if (state.activeTab === "Ledger")      return loadLedger();
    if (state.activeTab === "Notifications")return loadNotifications();
  }

  // disable/enable the Refresh button while loading
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

    // Clear: only reset the visible select for the active tab + search
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

  // ---------- shared row helpers ----------
  function addLoading(tbody, on){ if (!tbody) return; if (on){ tbody.setAttribute("aria-busy","true"); } else tbody.removeAttribute("aria-busy"); }
  function emptyRow(cols){ const tr=document.createElement("tr"); tr.innerHTML=`<td colspan="${cols}">No data</td>`; return tr; }
  function showErrorRow(tbody, err, cols){ if (!tbody) return; tbody.innerHTML=""; const tr=document.createElement("tr"); tr.innerHTML = `<td colspan="${cols}">${esc(err.message||String(err))}</td>`; tbody.appendChild(tr); }

  // ---------- WITHDRAWALS ----------
  async function loadWithdrawals({resetPage=false}={}){
    if (resetPage) state.page=1; cacheEls(); const tbody = els.wdBody || $("#wdBody");
    addLoading(tbody,true); setRefreshDisabled(true);
    try{
      const data = await api(`/api/admin/loyalty/withdrawals${buildQuery()}`);
      const rows = Array.isArray(data)?data:(data.withdrawals||[]);
      state.total = (typeof data.total==="number")?data.total:null;
      renderWithdrawalsRows(tbody, rows);
      setMeta(rows.length, state.total);
      updatePager();
    }catch(err){
      showErrorRow(tbody, err, 9);
      setMeta(0); state.total=null; updatePager();
    }finally{ addLoading(tbody,false); setRefreshDisabled(false); }
  }

  function actionCellHtml(id, status){
    const canApprove = status === "Pending";
    const canReject  = status === "Pending";
    const canPay     = status === "Approved";
    if (!canApprove && !canReject && !canPay) {
      return `<span class="badge" style="display:inline-block;padding:2px 8px;border-radius:12px;background:#eee;color:#555;font-size:12px;">No actions</span>`;
    }
    return `
      <div class="ws-actions">
        <button class="btn btn-actions" aria-haspopup="menu">Actions ▾</button>
        <div class="actions-menu hidden" role="menu">
          <button class="btn btn-approve"   data-id="${esc(id)}" ${canApprove ? "" : "disabled"}>Approve</button>
          <button class="btn btn-reject"    data-id="${esc(id)}" ${canReject  ? "" : "disabled"}>Reject</button>
          <button class="btn btn-mark-paid" data-id="${esc(id)}" ${canPay     ? "" : "disabled"}>Mark Paid</button>
        </div>
      </div>`;
  }

  function bindWithdrawalActions(){
    // Approve (PATCH)
    on(document, "click", async (e)=>{
      const btn = e.target.closest(".btn-approve"); if (!btn) return;
      e.preventDefault();
      try{
        const id = btn.dataset.id;
        const res = await fetch(`/api/admin/loyalty/withdrawals/${encodeURIComponent(id)}/approve`, {
          method: "PATCH", credentials: "include"
        });
        const data = await res.json().catch(()=>({}));
        if (!res.ok || data?.success === false) throw new Error(data?.error?.message || `HTTP ${res.status}`);
        toast(`Withdrawal #${id} approved`, {type:"info"});
        refreshActiveTab();
      }catch(err){ toast(err.message||"Approve failed", {type:"error"}); }
    });

    // Reject (PATCH)
    on(document, "click", async (e)=>{
      const btn = e.target.closest(".btn-reject"); if (!btn) return;
      e.preventDefault();
      try{
        const id = btn.dataset.id;
        const res = await fetch(`/api/admin/loyalty/withdrawals/${encodeURIComponent(id)}/reject`, {
          method: "PATCH", credentials: "include"
        });
        const data = await res.json().catch(()=>({}));
        if (!res.ok || data?.success === false) throw new Error(data?.error?.message || `HTTP ${res.status}`);
        toast(`Withdrawal #${id} rejected`, {type:"info"});
        refreshActiveTab();
      }catch(err){ toast(err.message||"Reject failed", {type:"error"}); }
    });

    // Mark Paid (PATCH to /mark-paid)
    on(document, "click", async (e)=>{
      const btn = e.target.closest(".btn-mark-paid"); if (!btn) return;
      e.preventDefault();
      try{
        const id = btn.dataset.id;
        const res = await fetch(`/api/admin/loyalty/withdrawals/${encodeURIComponent(id)}/mark-paid`, {
          method: "PATCH", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payoutRef: "" })
        });
        const data = await res.json().catch(()=>({}));
        if (!res.ok || data?.success === false) throw new Error(data?.error?.message || `HTTP ${res.status}`);
        toast(`Withdrawal #${id} marked as paid`, {type:"info"});
        refreshActiveTab();
      }catch(err){ toast(err.message||"Mark Paid failed", {type:"error"}); }
    });

    // Close any menu after an item click
    document.addEventListener("click", (e) => {
      const item = e.target.closest(".actions-menu .btn-approve, .actions-menu .btn-reject, .actions-menu .btn-mark-paid");
      if (!item) return;
      setTimeout(() => { document.querySelectorAll(".actions-menu").forEach(m => m.classList.add("hidden")); }, 0);
    });
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
      const tr=document.createElement("tr"); tr.dataset.id = id;
      tr.innerHTML = `
        <td>${esc(id)}</td>
        <td>${esc(acct)}</td>
        <td>${esc(user)}</td>
        <td>${fmtInt(pts)}</td>
        <td>${esc(st)}</td>
        <td>${esc(req)}</td>
        <td>${esc(dec)}</td>
        <td>${esc(paid)}</td>
        <td>${actionCellHtml(id, st)}</td>`;
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
  }

  // Inline actions menu (open/close)
  function wireInlineActionsMenu() {
    // Toggle menu; close others
    on(document, "click", (e) => {
      const btn = e.target.closest(".btn-actions");
      if (!btn) return;
      const wrap = btn.closest(".ws-actions"); if (!wrap) return;
      e.preventDefault();
      $$(".actions-menu").forEach(m => { if (!wrap.contains(m)) m.classList.add("hidden"); });
      const menu = wrap.querySelector(".actions-menu");
      if (menu) menu.classList.toggle("hidden");
    });
    // Close on outside click
    on(document, "click", (e) => {
      if (e.target.closest(".ws-actions")) return;
      $$(".actions-menu").forEach(m => m.classList.add("hidden"));
    });
    // Close on ESC
    on(document, "keydown", (e) => { if (e.key === "Escape") $$(".actions-menu").forEach(m => m.classList.add("hidden")); });
  }

  bindWithdrawalActions();

  // ---------- Increment 2 + 3: NEW WITHDRAWAL modal wiring with search & UX polish ----------
  const SEARCH_URL = "/api/admin/users/search";
  const SEARCH_DEBOUNCE_MS = 250;

  // accepts multiple server shapes:
  // - { success:true, results:[...] }
  // - { success:true, users:[...] }   (legacy)
  // - [ ... ]                         (bare array legacy)
  async function searchUsers(term) {
    if (!term || term.trim().length < 2) return [];
    try {
      const r = await fetch(`${SEARCH_URL}?q=${encodeURIComponent(term)}`, { credentials: "same-origin" });
      const j = await r.json();

      const arr = Array.isArray(j) ? j : (j.results || j.users || []);
      if (!Array.isArray(arr)) return [];

      // Normalize fields we care about
      return arr.map(u => ({
        id: u.id,
        name: u.name || "",
        email: u.email || "",
        phone: u.phone || "",
        account_id: u.account_id ?? u.accountId ?? null,
        status: u.status || "",
        // Increment 3: program awareness + min/balance canonical
        program_name: u.program_name || u.programName || "",
        minWithdrawPoints: u.minWithdrawPoints ?? u.min_withdraw_points ?? 0,
        balancePoints: u.balancePoints ?? u.balance_points ?? u.balance ?? 0
      }));
    } catch (e) {
      // Mock fallback: keeps UI testable if backend not deployed yet
      return [
        { id: 1, name: "Demo User", email: "demo@example.com", phone: "+254700000001", account_id: 101, status: "Active", program_name: "WattSun Rewards", balancePoints: 900, minWithdrawPoints: 200 }
      ];
    }
  }

  function wireNewWithdrawalModal() {
    const dlg    = document.getElementById("wdNewDialog");
    const btn    = document.getElementById("wdNewBtn");
    const create = document.getElementById("wdCreateBtn"); // old ID; preserved
    const accId  = document.getElementById("wdAccId");     // old field (fallback)
    const pts    = document.getElementById("wdPoints");
    const note   = document.getElementById("wdNote");
    const out    = document.getElementById("wdOut");

    // Increment 2 fields:
    const sInput   = document.getElementById("wdUserSearch");   // <input type="text">
    const sResults = document.getElementById("wdUserResults");  // <select> or container
    const hidAcc   = document.getElementById("wdAccountId");    // hidden input

    // Increment 3 hint block (program + min + balance) and inline error
    const hintBlk  = document.getElementById("wdHintBlock");    // optional container
    const hintProg = document.getElementById("wdHintProgram");
    const hintMin  = document.getElementById("wdHintMin");
    const hintBal  = document.getElementById("wdHintBal");
    const inlineErr= document.getElementById("wdError");

    // Fallback: legacy single-line hint (kept for backward compatibility)
    const legacyHint = document.getElementById("wdBalanceHint");

    // Preferred Submit button id; fallback to old `create`
    const submitBtn= document.getElementById("wdSubmit") || create;

    if (!btn || !dlg) return;

    // Internal picked user (from search)
    let picked = null;

    const setOut = (msg) => { if (out) out.textContent = msg || ""; };

    const showInlineError = (msg) => {
      if (inlineErr) {
        inlineErr.textContent = msg || "";
        inlineErr.style.display = msg ? "block" : "none";
      } else {
        // fall back to legacy output line (non-blocking)
        setOut(msg || "");
      }
    };

    const setSubmitEnabled = (ok) => {
      if (!submitBtn) return;
      submitBtn.disabled = !ok;
    };

    const getRequestedPoints = () => {
      const raw = (pts?.value || "").toString();
      const num = parseInt(raw.replace(/[^\d\-]/g, ""), 10);
      return Number.isFinite(num) ? num : 0;
    };

    const renderHint = () => {
      // Prefer new structured hint if present; else legacy one-liner
      const min = picked?.minWithdrawPoints ?? 0;
      const bal = picked?.balancePoints ?? picked?.balance ?? 0;
      const prog= picked?.program_name || "";

      if (hintBlk || hintProg || hintMin || hintBal) {
        if (hintProg) hintProg.textContent = prog || "—";
        if (hintMin)  hintMin.textContent  = String(min);
        if (hintBal)  hintBal.textContent  = String(bal);
      } else if (legacyHint) {
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
      // prefer new flow if search fields exist
      const accountId = (hidAcc && hidAcc.value) ? parseInt(hidAcc.value, 10) : (accId ? parseInt(accId.value, 10) : NaN);
      const req = getRequestedPoints();
      const min = picked?.minWithdrawPoints ?? 0;
      const bal = picked?.balancePoints ?? picked?.balance ?? Infinity; // if unknown, don't block too hard
      renderHint();
      const res = validatePoints(req, min, bal);

      // show or clear inline error
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
      renderHint();
      updateValidity();
    };

    const renderResults = (users=[]) => {
      if (!sResults) return;
      if (!users.length) {
        renderNoResults();
        return;
      }
      // If it's a <select>, populate options. If it's a <div>, render buttons.
      if (sResults.tagName === "SELECT") {
        sResults.innerHTML = "";
        users.forEach(u => {
          const opt = document.createElement("option");
          opt.value = String(u.id);
          opt.textContent = `${u.name || u.email || u.phone || ('User#'+u.id)}${u.account_id ? "" : " (no active account)"}`;
          opt.dataset.payload = JSON.stringify(u);
          sResults.appendChild(opt);
        });
        // auto-pick first result
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
        // don't force "No results" for too-short input; just clear
        sResults && (sResults.innerHTML = "");
        picked = null;
        if (hidAcc) hidAcc.value = "";
        renderHint();
        updateValidity();
        return;
      }
      const users = await searchUsers(term);
      renderResults(users);
    }, SEARCH_DEBOUNCE_MS);

    // Open modal
    btn && btn.addEventListener("click", () => {
      if (accId) accId.value = "";      // legacy
      if (pts) pts.value = "";
      if (note) note.value = "";
      setOut("");
      showInlineError("");
      clearSearchUI();
      try { dlg.showModal(); } catch(_) {}
    });

    // Search listeners (new flow)
    if (sInput) sInput.addEventListener("input", doSearch);

    if (sResults && sResults.tagName === "SELECT") {
      sResults.addEventListener("change", () => {
        const opt = sResults.options[sResults.selectedIndex];
        picked = opt ? JSON.parse(opt.dataset.payload) : null;
        if (hidAcc) hidAcc.value = picked?.account_id || "";
        renderHint();
        updateValidity();
      });
    }

    if (pts) pts.addEventListener("input", updateValidity);

    // Submit
    if (submitBtn) {
      submitBtn.addEventListener("click", async () => {
        setOut("");
        showInlineError("");

        // Prefer new hidden accountId if present; else fallback to legacy accId input
        const accountIdVal = (hidAcc && hidAcc.value) ? hidAcc.value : (accId ? accId.value : "");
        const accountId = parseInt(accountIdVal, 10);
        const points = getRequestedPoints();
        const n = (note?.value || "").trim();

        // Validate according to new flow if available
        if ((sInput || sResults) && picked) {
          const min = picked?.minWithdrawPoints ?? 0;
          const bal = picked?.balancePoints ?? picked?.balance ?? Infinity;
          if (!accountId || isNaN(accountId)) {
            showInlineError("Select a user with an active loyalty account.");
            return;
          }
          const res = validatePoints(points, min, bal);
          if (!res.ok) {
            showInlineError(res.msg);
            return;
          }
        } else {
          // Legacy validation
          if (!Number.isInteger(accountId) || accountId < 1) {
            showInlineError("Please enter a valid Account ID.");
            return;
          }
          if (!Number.isInteger(points) || points < 1) {
            showInlineError("Please enter points ≥ 1.");
            return;
          }
        }

        try {
          submitBtn.disabled = true;
          const resp = await postJSON("/api/admin/loyalty/withdrawals", { accountId, points, note:n });
          const id = resp?.withdrawal?.id ?? "—";
          toast(`Created withdrawal #${id} (${points} pts)`, { type:"info" });

          // Close modal quickly
          try { dlg.close("close"); } catch(_){}

          // Increment 3: refresh BOTH Withdrawals and Accounts immediately
          try { loadWithdrawals(); } catch(_){}
          try { loadAccounts({ resetPage:true }); } catch(_){}

          // Cross-tab signals so other views react
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

    // Start disabled until valid (new flow)
    setSubmitEnabled(false);
    renderHint();
  }

  // ---------- ACCOUNTS ----------
  async function loadAccounts({resetPage=false}={}) {
    if (resetPage) state.page=1; cacheEls();
    const tbody = els.accountsBody || $("#loyaltyAccountsBody");
    addLoading(tbody,true); setRefreshDisabled(true);
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
    if (resetPage) state.page=1; cacheEls();
    const tbody = els.ledgerBody || $("#loyaltyLedgerBody");
    addLoading(tbody,true); setRefreshDisabled(true);
    try{
      const data = await api(`/api/admin/loyalty/ledger${buildQuery()}`);
      const rows = Array.isArray(data)
        ? data
        : (data.ledger || data.rows || data.items || []);
      state.total = (typeof data.total==="number")?data.total:null;
      renderLedgerRows(tbody, rows);
      setMeta(rows.length, state.total);
      updatePager();
    }catch(err){
      showErrorRow(tbody, err, 8);
      setMeta(0); state.total=null; updatePager();
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

  // ---------- NOTIFICATIONS ----------
  async function loadNotifications({resetPage=false}={}){
    if (resetPage) state.page=1; cacheEls();
    const tbody = els.notificationsBody || $("#loyaltyNotificationsBody");
    addLoading(tbody,true); setRefreshDisabled(true);
    try{
      const data = await api(`/api/admin/loyalty/notifications${buildQuery()}`);
      const rows = Array.isArray(data)?data:(data.notifications||[]);
      state.total = (typeof data.total==="number")?data.total:null;
      renderNotifRows(tbody, rows);
      setMeta(rows.length, state.total);
      updatePager();
    }catch(err){
      showErrorRow(tbody, err, 5);
      setMeta(0); state.total=null; updatePager();
    }finally{ addLoading(tbody,false); setRefreshDisabled(false); }
  }

  function renderNotifRows(tbody, rows){
    if (!tbody) return; 
    tbody.innerHTML = "";

    if (!rows?.length){
      tbody.appendChild(emptyRow(5)); // ID, Kind, Email, Status, Created
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

})();
