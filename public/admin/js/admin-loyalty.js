// public/admin/js/admin-loyalty.js
// Loyalty Admin Visibility — Phase 1 (ACCOUNTS ONLY, SPA-safe attach)

(function () {
  "use strict";

  // ---------- tiny helpers ----------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);
  const fmtInt = (n) => (n === 0 || n ? Number(n).toLocaleString() : "—");
  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

  async function api(path) {
    const res = await fetch(path, { credentials: "include" });
    let data;
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok || data?.success === false) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  // ---------- SPA-safe activation ----------
  let attached = false;         // guards duplicate wiring
  let rootEl   = null;          // #loyalty-root
  let els      = {};            // resolved handles (rebuilt on attach)

  // Rebuild all element handles whenever the partial is (re)attached
  function cacheEls() {
    rootEl = $("#loyalty-root");
    els = {
      // Tabs (buttons)
      tabWithdrawalsBtn: $("#tabWithdrawalsBtn", rootEl?.ownerDocument || document),
      tabAccountsBtn:    $("#tabAccountsBtn",    rootEl?.ownerDocument || document),
      tabLedgerBtn:      $("#tabLedgerBtn",      rootEl?.ownerDocument || document),
      tabNotifsBtn:      $("#tabNotifsBtn",      rootEl?.ownerDocument || document),

      // Tab panes
      tabWithdrawals: $("#loyaltyTabWithdrawals", rootEl || document),
      tabAccounts:    $("#loyaltyTabAccounts",    rootEl || document),
      tabLedger:      $("#loyaltyTabLedger",      rootEl || document),
      tabNotifs:      $("#loyaltyTabNotifs",      rootEl || document),

      // Filters
      statusSel:   $("#statusSel",       rootEl || document),
      searchInput: $("#loyaltySearch",   rootEl || document),
      clearBtn:    $("#loyaltyClearBtn", rootEl || document),
      refreshBtn:  $("#loyaltyRefreshBtn", rootEl || document),

      // Tables
      accountsBody: $("#loyaltyAccountsBody", rootEl || document),

      // Meta + pager
      meta:  $("#loyaltyMeta",  rootEl || document),
      pager: $("#loyaltyPager", rootEl || document),
    };
  }

  // Observe DOM for the partial being inserted/removed
  const mo = new MutationObserver(() => tryAttach());
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // Also do a quick retry loop (covers fast SPA swaps without mutations touching <html>)
  let tries = 0;
  function tryAttach() {
    const found = $("#loyalty-root");
    if (!found) { attached = false; return; }
    if (attached) return;

    cacheEls();
    if (!els.tabAccountsBtn || !els.tabAccounts) {
      if (++tries < 20) setTimeout(tryAttach, 50);
      return;
    }
    attach();
  }

  // ---------- state ----------
  const state = {
    activeTab: "Withdrawals", // shell shows Withdrawals first
    page: 1,
    limit: 10,
    total: null,
  };

  // ---------- attach once the partial exists ----------
  function attach() {
    attached = true;
    tries = 0;

    wireTabs();
    wireFilters();
    wirePager();

    // If Accounts pane is already visible (style toggled), load it
    if (isShown(els.tabAccounts)) {
      state.activeTab = "Accounts";
      loadAccounts({ resetPage: true });
    }
    // Make debug handle available after attach
    window.loyaltyAdmin = { state, refreshActiveTab, loadAccounts };
  }

  // ---------- tabs ----------
  function wireTabs() {
    // Use event delegation on the root; survives hot-swaps
    on(document, "click", (e) => {
      const btn = e.target.closest("#tabWithdrawalsBtn, #tabAccountsBtn, #tabLedgerBtn, #tabNotifsBtn");
      if (!btn) return;

      e.preventDefault();
      if (btn.id === "tabWithdrawalsBtn") showTab("Withdrawals");
      if (btn.id === "tabAccountsBtn")    { showTab("Accounts"); loadAccounts({ resetPage: true }); }
      if (btn.id === "tabLedgerBtn")      showTab("Ledger");
      if (btn.id === "tabNotifsBtn")      showTab("Notifications");
    });
  }

  function showTab(name) {
    state.activeTab = name;
    setShown(els.tabWithdrawals, name === "Withdrawals");
    setShown(els.tabAccounts,    name === "Accounts");
    setShown(els.tabLedger,      name === "Ledger");
    setShown(els.tabNotifs,      name === "Notifications");

    toggleGhost(els.tabWithdrawalsBtn, name !== "Withdrawals");
    toggleGhost(els.tabAccountsBtn,    name !== "Accounts");
    toggleGhost(els.tabLedgerBtn,      name !== "Ledger");
    toggleGhost(els.tabNotifsBtn,      name !== "Notifications");
  }

  function toggleGhost(btn, ghostOn) { btn && btn.classList.toggle("btn--ghost", ghostOn); }
  function isShown(el){ return !!el && el.style.display !== "none"; }
  function setShown(el,on){ if (el) el.style.display = on ? "" : "none"; }

  // ---------- filters & refresh (delegated) ----------
  function wireFilters() {
    // Status change
    on(document, "change", (e) => {
      if (!e.target || e.target.id !== "statusSel") return;
      state.page = 1;
      refreshActiveTab();
    });

    // Search enter
    on(document, "keydown", (e) => {
      if (e.key !== "Enter") return;
      const t = e.target;
      if (!t || t.id !== "loyaltySearch") return;
      state.page = 1;
      refreshActiveTab();
    });

    // Clear
    on(document, "click", (e) => {
      const btn = e.target.closest("#loyaltyClearBtn");
      if (!btn) return;
      if (els.statusSel) els.statusSel.value = "";
      if (els.searchInput) els.searchInput.value = "";
      state.page = 1;
      refreshActiveTab();
    });

    // Refresh
    on(document, "click", (e) => {
      const btn = e.target.closest("#loyaltyRefreshBtn");
      if (!btn) return;
      refreshActiveTab();
    });
  }

  function refreshActiveTab() {
    cacheEls(); // recapture handles in case the partial was re-rendered
    if (state.activeTab === "Accounts") {
      loadAccounts({ resetPage: false });
    } else {
      setMeta(0);
    }
  }

  // ---------- pager (delegated) ----------
  function wirePager() {
    on(document, "click", (e) => {
      const btn = e.target.closest("#loyaltyPager button");
      if (!btn) return;

      const label = btn.textContent.trim().toLowerCase();
      const { page, limit, total } = state;

      if (label.startsWith("first"))       state.page = 1;
      else if (label.includes("prev"))     state.page = Math.max(1, page - 1);
      else if (label.includes("next"))     state.page = page + 1;
      else if (label.startsWith("last") && typeof total === "number") {
        state.page = Math.max(1, Math.ceil(total / limit));
      }
      refreshActiveTab();
    });
  }

  function updatePager() {
    const pager = els.pager || $("#loyaltyPager");
    if (!pager) return;

    const btns = $$("button", pager);
    const first = btns[0], prev = btns[1], current = btns[2], next = btns[3], last = btns[4];

    const { page, limit, total } = state;
    const hasPrev = page > 1;

    let hasNext = true;
    let maxPage = null;
    if (typeof total === "number") {
      maxPage = Math.max(1, Math.ceil(total / limit));
      hasNext = page < maxPage;
    }

    setDisabled(first, !hasPrev);
    setDisabled(prev,  !hasPrev);
    setDisabled(next,  !hasNext);
    setDisabled(last,  !(hasNext && maxPage !== null));

    if (current) current.textContent = String(page);
  }

  function setDisabled(btn, on) { if (btn) { btn.disabled = !!on; btn.classList.toggle("is-disabled", !!on); } }

  // ---------- ACCOUNTS ----------
  function buildQuery() {
    const statusSel = $("#statusSel") || els.statusSel;
    const searchInp = $("#loyaltySearch") || els.searchInput;

    const params = new URLSearchParams();
    const status = (statusSel?.value || "").trim();
    const q      = (searchInp?.value || "").trim();

    if (status) params.set("status", status);
    if (q)      params.set("q", q);
    params.set("page",  String(state.page));
    params.set("limit", String(state.limit));
    return `?${params.toString()}`;
  }

  async function loadAccounts({ resetPage = false } = {}) {
    if (resetPage) state.page = 1;

    cacheEls(); // ensure accountsBody/meta/pager are current nodes
    const tbody = els.accountsBody || $("#loyaltyAccountsBody");
    addLoading(tbody, true);

    try {
      // Expected prior contract: { accounts: [...] }
      const url  = `/api/admin/loyalty/accounts${buildQuery()}`;
      const data = await api(url);

      const rows = Array.isArray(data) ? data : (data.accounts || []);
      state.total = (typeof data.total === "number") ? data.total : null;

      const count = renderAccountsRows(tbody, rows);
      setMeta(count, state.total);
      updatePager();
    } catch (err) {
      showErrorRow(tbody, err);
      setMeta(0);
      state.total = null;
      updatePager();
    } finally {
      addLoading(tbody, false);
    }
  }

  function renderAccountsRows(tbody, rows) {
    if (!tbody) return 0;
    tbody.innerHTML = "";

    if (!rows || rows.length === 0) {
      tbody.appendChild(emptyRow(11));
      return 0;
    }

    const frag = document.createDocumentFragment();
    for (const a of rows) {
      // Fields per earlier working version: id, user_id, email, status,
      // start_date, end_date, duration_months, points_balance, total_earned, total_penalty, total_paid
      const tr = document.createElement("tr");
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
        <td>${fmtInt(a.total_paid)}</td>
      `;
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
    return rows.length;
  }

  // ---------- render helpers ----------
  function emptyRow(colspan, text="(No data yet)") {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = colspan;
    td.className = "muted";
    td.textContent = text;
    tr.appendChild(td);
    return tr;
  }

  function showErrorRow(tbody, err) {
    if (!tbody) return;
    tbody.innerHTML = "";
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 11;
    td.innerHTML = `<span style="color:#a00;">Error:</span> ${esc(err?.message || String(err))}`;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  function addLoading(tbody, on) {
    const table = tbody?.closest("table");
    if (!table) return;
    table.classList.toggle("is-loading", !!on);
  }

  // ---------- kick off ----------
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryAttach);
  } else {
    tryAttach();
  }
})();
