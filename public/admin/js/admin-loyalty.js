// public/admin/js/admin-loyalty.js
// Loyalty Admin Visibility — SPA-safe attach
// Phase 1: Read-only wiring for Accounts + Ledger + Notifications
(function () {
  "use strict";

  // ---------- tiny helpers ----------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);
  const fmtInt = (n) => (n === 0 || n ? Number(n).toLocaleString() : "—");
  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const debounce = (fn, ms=400) => {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  async function api(path) {
    const res = await fetch(path, { credentials: "include" });
    let data; try { data = await res.json(); } catch { data = {}; }
    if (!res.ok || data?.success === false) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  // ---------- SPA-safe activation ----------
  let attached = false;
  let rootEl = null;
  let els = {};

  function cacheEls() {
    rootEl = $("#loyalty-root");
    els = {
      // tab buttons
      tabWithdrawalsBtn: $("#tabWithdrawalsBtn"),
      tabAccountsBtn:    $("#tabAccountsBtn"),
      tabLedgerBtn:      $("#tabLedgerBtn"),
      tabNotifsBtn:      $("#tabNotifsBtn"),
      // tab panes
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
      accountsBody:      $("#loyaltyAccountsBody"),
      ledgerBody:        $("#loyaltyLedgerBody"),
      notificationsBody: $("#loyaltyNotificationsBody"),
      // meta + pager
      meta:  $("#loyaltyMeta"),
      pager: $("#loyaltyPager"),
    };
  }

  const mo = new MutationObserver(() => tryAttach());
  mo.observe(document.documentElement, { childList: true, subtree: true });

  let tries = 0;
  function tryAttach() {
    const found = $("#loyalty-root");
    if (!found) { attached = false; return; }
    if (attached) return;
    cacheEls();
    if (!els.tabAccounts || !els.tabAccountsBtn) {
      if (++tries < 20) setTimeout(tryAttach, 50);
      return;
    }
    attach();
  }

  // ---------- state ----------
  const state = {
    activeTab: "Withdrawals",
    page: 1,
    limit: 10,
    total: null, // only used by Accounts currently
  };

  // ---------- attach ----------
  function attach() {
    attached = true; tries = 0;
    wireTabs();
    wireFilters();
    wirePager();
    if (isShown(els.tabAccounts)) {
      state.activeTab = "Accounts";
      loadAccounts({ resetPage: true });
    }
    // expose minimal debug
    window.loyaltyAdmin = { state, refreshActiveTab, loadAccounts, loadLedger, loadNotifications };
  }

  // ---------- tabs ----------
  function wireTabs() {
    on(document, "click", (e) => {
      const btn = e.target.closest("#tabWithdrawalsBtn, #tabAccountsBtn, #tabLedgerBtn, #tabNotifsBtn");
      if (!btn) return; e.preventDefault();
      if (btn.id === "tabWithdrawalsBtn") showTab("Withdrawals");
      if (btn.id === "tabAccountsBtn")    { showTab("Accounts");      loadAccounts({ resetPage: true }); }
      if (btn.id === "tabLedgerBtn")      { showTab("Ledger");        loadLedger(); }
      if (btn.id === "tabNotifsBtn")      { showTab("Notifications"); loadNotifications(); }
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

  function toggleGhost(btn, on) { btn && btn.classList.toggle("btn--ghost", !!on); }
  function isShown(el){ return !!el && el.style.display !== "none"; }
  function setShown(el,on){ if (el) el.style.display = on ? "" : "none"; }

  // ---------- filters & refresh ----------
  function wireFilters() {
    // Status (effective only on Withdrawals for now)
    on(document, "change", (e) => {
      if (e.target?.id !== "statusSel") return;
      state.page = 1;
      refreshActiveTab();
    });

    // Search — Enter
    on(document, "keydown", (e) => {
      if (e.key !== "Enter" || e.target?.id !== "loyaltySearch") return;
      state.page = 1;
      refreshActiveTab();
    });

    // Search — auto (debounced)
    const handleAutoSearch = debounce(() => {
      state.page = 1;
      refreshActiveTab();
    }, 400);
    on(document, "input", (e) => {
      if (e.target?.id !== "loyaltySearch") return;
      handleAutoSearch();
    });

    // Clear + Refresh
    on(document, "click", (e) => {
      const clr = e.target.closest("#loyaltyClearBtn");
      if (clr) {
        if (els.statusSel) els.statusSel.value = "";
        if (els.searchInput) els.searchInput.value = "";
        state.page = 1;
        refreshActiveTab();
        return;
      }
      const ref = e.target.closest("#loyaltyRefreshBtn");
      if (ref) refreshActiveTab();
    });
  }

  function refreshActiveTab() {
    cacheEls();
    if (state.activeTab === "Accounts") {
      loadAccounts({ resetPage: false });
    } else if (state.activeTab === "Ledger") {
      loadLedger();
    } else if (state.activeTab === "Notifications") {
      loadNotifications();
    } else {
      setMeta(0);
    }
  }

  // ---------- pager (Accounts only for now) ----------
  function wirePager() {
    on(document, "click", (e) => {
      const btn = e.target.closest("#loyaltyPager button"); if (!btn) return;
      const label = btn.textContent.trim().toLowerCase();
      const { page, limit, total } = state;
      if (label.startsWith("first"))       state.page = 1;
      else if (label.includes("prev"))     state.page = Math.max(1, page - 1);
      else if (label.includes("next"))     state.page = page + 1;
      else if (label.startsWith("last") && typeof total === "number")
        state.page = Math.max(1, Math.ceil(total / limit));
      refreshActiveTab();
    });
  }

  function updatePager() {
    const pager = els.pager || $("#loyaltyPager"); if (!pager) return;
    const btns = $$("button", pager);
    const first = btns[0], prev = btns[1], current = btns[2], next = btns[3], last = btns[4];
    const { page, limit, total } = state;
    const hasPrev = page > 1;
    let hasNext = true, maxPage = null;
    if (typeof total === "number") { maxPage = Math.max(1, Math.ceil(total / limit)); hasNext = page < maxPage; }
    setDisabled(first, !hasPrev); setDisabled(prev, !hasPrev);
    setDisabled(next, !hasNext); setDisabled(last, !(hasNext && maxPage !== null));
    if (current) current.textContent = String(page);
  }
  function setDisabled(btn, on) { if (btn) { btn.disabled = !!on; btn.classList.toggle("is-disabled", !!on); } }

  // ---------- ACCOUNTS ----------
  function buildQuery() {
    const statusSel = $("#statusSel") || els.statusSel;
    const searchInp = $("#loyaltySearch") || els.searchInput;
    const params = new URLSearchParams();
    const status = (statusSel?.value || "").trim();
    const q = (searchInp?.value || "").trim();
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    params.set("page", String(state.page));
    params.set("limit", String(state.limit));
    return `?${params.toString()}`;
  }

  async function loadAccounts({ resetPage = false } = {}) {
    if (resetPage) state.page = 1;
    cacheEls();
    const tbody = els.accountsBody || $("#loyaltyAccountsBody");
    addLoading(tbody, true);
    try {
      const url = `/api/admin/loyalty/accounts${buildQuery()}`;
      const data = await api(url);
      const rows = Array.isArray(data) ? data : (data.accounts || []);
      state.total = (typeof data.total === "number") ? data.total : null;
      const count = renderAccountsRows(tbody, rows);
      setMeta(count, state.total);
      updatePager();
    } catch (err) {
      showErrorRow(tbody, err, 11); setMeta(0); state.total = null; updatePager();
    } finally { addLoading(tbody, false); }
  }

  function renderAccountsRows(tbody, rows) {
    if (!tbody) return 0; tbody.innerHTML = "";
    if (!rows || rows.length === 0) { tbody.appendChild(emptyRow(11)); return 0; }
    const frag = document.createDocumentFragment();
    for (const a of rows) {
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
        <td>${fmtInt(a.total_paid)}</td>`;
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
    return rows.length;
  }

  // ---------- LEDGER (read-only) ----------
  async function loadLedger() {
    cacheEls();
    const tbody = els.ledgerBody || $("#loyaltyLedgerBody"); if (!tbody) return;
    addLoading(tbody, true);
    try {
      const data = await api(`/api/admin/loyalty/ledger`);
      const rows = Array.isArray(data) ? data : (data.ledger || []);
      tbody.innerHTML = "";
      if (!rows.length) tbody.appendChild(emptyRow(6));
      else {
        const frag = document.createDocumentFragment();
        for (const l of rows) {
          const tr = document.createElement("tr");
          tr.innerHTML = `
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
    } catch (err) { showErrorRow(tbody, err, 6); setMeta(0); }
    finally { addLoading(tbody, false); }
  }

  // ---------- NOTIFICATIONS (read-only) ----------
  async function loadNotifications() {
    cacheEls();
    const tbody = els.notificationsBody || $("#loyaltyNotificationsBody"); if (!tbody) return;
    addLoading(tbody, true);
    try {
      const data = await api(`/api/admin/loyalty/notifications`);
      const rows = Array.isArray(data) ? data : (data.notifications || []);
      tbody.innerHTML = "";
      if (!rows.length) tbody.appendChild(emptyRow(5));
      else {
        const frag = document.createDocumentFragment();
        for (const n of rows) {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${esc(n.id)}</td>
            <td>${esc(n.kind)}</td>
            <td>${esc(n.email ?? "—")}</td>
            <td>${esc(n.status)}</td>
            <td>${esc(n.created_at)}</td>`;
          frag.appendChild(tr);
        }
        tbody.appendChild(frag);
      }
      setMeta(rows.length);
    } catch (err) { showErrorRow(tbody, err, 5); setMeta(0); }
    finally { addLoading(tbody, false); }
  }

  // ---------- render helpers ----------
  function emptyRow(colspan, text="(No data yet)") {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = colspan; td.className = "muted"; td.textContent = text;
    tr.appendChild(td); return tr;
  }
  function showErrorRow(tbody, err, colspan) {
    if (!tbody) return; tbody.innerHTML = "";
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = colspan;
    td.innerHTML = `<span style="color:#a00;">Error:</span> ${esc(err?.message || String(err))}`;
    tr.appendChild(td); tbody.appendChild(tr);
  }
  function addLoading(tbody, on) {
    const table = tbody?.closest("table"); if (!table) return;
    table.classList.toggle("is-loading", !!on);
  }
  function setMeta(count, total) {
    const meta = els.meta || $("#loyaltyMeta"); if (!meta) return;
    meta.textContent = (typeof total === "number") ? `${count} / ${total} results` : `${count} results`;
  }

  // ---------- kick off ----------
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryAttach);
  } else {
    tryAttach();
  }
})();
