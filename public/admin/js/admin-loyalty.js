// public/admin/js/admin-loyalty.js
// Loyalty Admin Visibility — Phase 1: ACCOUNTS ONLY
// - Renders Accounts table from /api/admin/loyalty/accounts
// - Hooks Status + Search + Clear + Refresh
// - Updates #loyaltyMeta ("X results" or "X / total")
// - Pager buttons are wired (First/Prev/Next/Last) but remain basic stubs
// - Tabs: only Accounts loads data; others are left as-is for future phases

(function () {
  "use strict";

  // ---------------- DOM helpers ----------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);

  // ---------------- Elements ----------------
  const els = {
    // Tabs (buttons)
    tabWithdrawalsBtn: $("#tabWithdrawalsBtn"),
    tabAccountsBtn: $("#tabAccountsBtn"),
    tabLedgerBtn: $("#tabLedgerBtn"),
    tabNotifsBtn: $("#tabNotifsBtn"),

    // Tab containers
    tabWithdrawals: $("#loyaltyTabWithdrawals"),
    tabAccounts: $("#loyaltyTabAccounts"),
    tabLedger: $("#loyaltyTabLedger"),
    tabNotifs: $("#loyaltyTabNotifs"),

    // Shared filters
    statusSel: $("#statusSel"),
    searchInput: $("#loyaltySearch"),
    clearBtn: $("#loyaltyClearBtn"),
    refreshBtn: $("#loyaltyRefreshBtn"),

    // Table bodies
    wdBody: $("#wdBody"),
    accountsBody: $("#loyaltyAccountsBody"),
    ledgerBody: $("#loyaltyLedgerBody"),
    notifsBody: $("#loyaltyNotificationsBody"),

    // Meta + pager
    meta: $("#loyaltyMeta"),
    pager: $("#loyaltyPager"),
  };

  // ---------------- State ----------------
  const state = {
    activeTab: "Withdrawals", // matches initial HTML default
    page: 1,
    limit: 10,
    total: null, // when API provides total
  };

  // ---------------- Boot ----------------
  function boot() {
    wireTabs();
    wireFilters();
    wirePager();

    // If user switches to Accounts, we'll load it then.
    // If the page loads with Accounts already visible (custom CSS), detect and load:
    if (isShown(els.tabAccounts)) {
      state.activeTab = "Accounts";
      loadAccounts({ resetPage: true });
    }
  }

  // ---------------- Tabs ----------------
  function wireTabs() {
    on(els.tabWithdrawalsBtn, "click", (e) => {
      e.preventDefault();
      showTab("Withdrawals");
    });
    on(els.tabAccountsBtn, "click", (e) => {
      e.preventDefault();
      showTab("Accounts");
      loadAccounts({ resetPage: true });
    });
    on(els.tabLedgerBtn, "click", (e) => {
      e.preventDefault();
      showTab("Ledger");
      // future: loadLedger()
    });
    on(els.tabNotifsBtn, "click", (e) => {
      e.preventDefault();
      showTab("Notifications");
      // future: loadNotifications()
    });
  }

  function showTab(name) {
    state.activeTab = name;

    // show/hide containers
    setShown(els.tabWithdrawals, name === "Withdrawals");
    setShown(els.tabAccounts, name === "Accounts");
    setShown(els.tabLedger, name === "Ledger");
    setShown(els.tabNotifs, name === "Notifications");

    // (Optional) visual active state on buttons
    toggleActiveBtn(els.tabWithdrawalsBtn, name === "Withdrawals");
    toggleActiveBtn(els.tabAccountsBtn, name === "Accounts");
    toggleActiveBtn(els.tabLedgerBtn, name === "Ledger");
    toggleActiveBtn(els.tabNotifsBtn, name === "Notifications");
  }

  function toggleActiveBtn(btn, on) {
    if (!btn) return;
    btn.classList.toggle("is-active", !!on);
  }

  function isShown(el) {
    if (!el) return false;
    // treat hidden if display: none inline
    if (el.style && el.style.display === "none") return false;
    // if not in DOM or no size, still consider visible if not explicitly hidden
    return true;
  }

  function setShown(el, on) {
    if (!el) return;
    el.style.display = on ? "" : "none";
  }

  // ---------------- Filters + Refresh ----------------
  function wireFilters() {
    on(els.statusSel, "change", () => {
      state.page = 1;
      refreshActiveTab();
    });

    // Search on Enter
    on(els.searchInput, "keydown", (e) => {
      if (e.key === "Enter") {
        state.page = 1;
        refreshActiveTab();
      }
    });

    // Clear
    on(els.clearBtn, "click", () => {
      if (els.statusSel) els.statusSel.value = "";
      if (els.searchInput) els.searchInput.value = "";
      state.page = 1;
      refreshActiveTab();
    });

    // Refresh
    on(els.refreshBtn, "click", () => {
      refreshActiveTab();
    });
  }

  function refreshActiveTab() {
    if (state.activeTab === "Accounts") {
      loadAccounts({ resetPage: false });
    } else {
      // Not implemented yet; keep meta coherent
      setMeta(0);
    }
  }

  // ---------------- Pager ----------------
  // Map the four pager buttons in order: First, Prev, Next, Last
  function wirePager() {
    if (!els.pager) return;
    const btns = $$("button", els.pager);
    const map = {
      first: btns[0],
      prev: btns[1],
      next: btns[2],
      last: btns[3],
    };

    on(map.first, "click", () => goPage("first"));
    on(map.prev, "click", () => goPage("prev"));
    on(map.next, "click", () => goPage("next"));
    on(map.last, "click", () => goPage("last"));
  }

  function goPage(where) {
    const { page, limit, total } = state;

    if (where === "first") state.page = 1;
    else if (where === "prev") state.page = Math.max(1, page - 1);
    else if (where === "next") state.page = page + 1;
    else if (where === "last" && typeof total === "number") {
      state.page = Math.max(1, Math.ceil(total / limit));
    }

    refreshActiveTab();
  }

  function updatePager() {
    if (!els.pager) return;
    const btns = $$("button", els.pager);
    const first = btns[0], prev = btns[1], next = btns[2], last = btns[3];

    const page = state.page;
    const limit = state.limit;
    const total = state.total;

    const hasPrev = page > 1;
    let hasNext = true;
    let maxPage = null;

    if (typeof total === "number") {
      maxPage = Math.max(1, Math.ceil(total / limit));
      hasNext = page < maxPage;
    }

    setDisabled(first, !hasPrev);
    setDisabled(prev, !hasPrev);
    setDisabled(next, !hasNext);
    setDisabled(last, !(hasNext && maxPage !== null));
  }

  function setDisabled(btn, on) {
    if (!btn) return;
    btn.disabled = !!on;
    btn.classList.toggle("is-disabled", !!on);
  }

  // ---------------- Accounts Loader ----------------
  async function loadAccounts({ resetPage = false } = {}) {
    if (resetPage) state.page = 1;

    const query = buildQuery();
    const url = `/api/admin/loyalty/accounts${query}`;

    addLoading(els.accountsBody, true);
    try {
      const data = await getJSON(url);

      // Accept either {rows, total} or plain array
      const rows = Array.isArray(data) ? data : (data.rows || []);
      state.total = (typeof data.total === "number") ? data.total : null;

      const count = renderAccountsRows(rows);
      setMeta(count, state.total);
      updatePager();
    } catch (err) {
      console.error("[Loyalty/Accounts] load failed:", err);
      showErrorRow(els.accountsBody, err);
      setMeta(0);
      state.total = null;
      updatePager();
    } finally {
      addLoading(els.accountsBody, false);
    }
  }

  function buildQuery() {
    const params = new URLSearchParams();
    const status = (els.statusSel?.value || "").trim();
    const q = (els.searchInput?.value || "").trim();

    if (status) params.set("status", status);
    if (q) params.set("q", q);
    params.set("page", String(state.page));
    params.set("limit", String(state.limit));

    return `?${params.toString()}`;
  }

  // ---------------- Render (Accounts) ----------------
  function renderAccountsRows(rows) {
    const tb = els.accountsBody;
    if (!tb) return 0;
    tb.innerHTML = "";

    if (!rows || rows.length === 0) {
      tb.appendChild(emptyRow(11));
      return 0;
    }

    const frag = document.createDocumentFragment();
    for (const a of rows) {
      const tr = document.createElement("tr");

      const id         = pick(a, ["id", "account_id", "acct_id"], "—");
      const userId     = pick(a, ["user_id", "userId"], "—");
      const email      = pick(a, ["email"], "—");
      const status     = pick(a, ["status"], "—");
      const start      = pick(a, ["start", "start_date", "started_at", "startAt", "created_at"], "—");
      const end        = pick(a, ["end", "end_date", "ended_at", "endAt"], "—");
      const durationMo = deriveMonths(a, start, end);
      const balance    = pick(a, ["balance", "points_balance", "points", "current_points"], 0);
      const earned     = pick(a, ["earned", "points_earned", "total_earned"], 0);
      const penalty    = pick(a, ["penalty", "points_penalty"], 0);
      const paid       = pick(a, ["paid", "points_paid", "redeemed"], 0);

      tr.innerHTML = [
        td(id),
        td(userId),
        td(email),
        td(status),
        td(start),
        td(end),
        td(durationMo),
        td(num(balance)),
        td(num(earned)),
        td(num(penalty)),
        td(num(paid)),
      ].join("");

      frag.appendChild(tr);
    }
    tb.appendChild(frag);
    return rows.length;
  }

  // ---------------- Utilities ----------------
  async function getJSON(url) {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function emptyRow(colspan, text = "(No data yet)") {
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
    td.innerHTML = `<span style="color:#a00;">Error:</span> ${escapeHtml(err?.message || String(err))}`;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  function addLoading(tbody, on) {
    const table = tbody?.closest("table");
    if (!table) return;
    table.classList.toggle("is-loading", !!on);
  }

  function setMeta(count, total) {
    if (!els.meta) return;
    if (typeof total === "number") {
      els.meta.textContent = `${count} / ${total} results`;
    } else {
      els.meta.textContent = `${count} results`;
    }
  }

  function pick(obj, keys, fallback = "—") {
    for (const k of keys) {
      if (obj && obj[k] != null) return obj[k];
    }
    return fallback;
  }

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
    // Keep raw integers for points; no currency formatting needed here.
  }

  function deriveMonths(_row, start, end) {
    // If backend provides duration, prefer it:
    const direct = pick(_row, ["duration_months", "months", "duration"], null);
    if (direct !== null && direct !== "—") return direct;

    // Else compute rough months from start/end if parseable
    const s = Date.parse(start);
    const e = Date.parse(end);
    if (!Number.isFinite(s) || !Number.isFinite(e)) return "—";
    const diffMs = Math.max(0, e - s);
    const months = Math.round(diffMs / (1000 * 60 * 60 * 24 * 30));
    return months;
  }

  function td(content) {
    return `<td>${escapeHtml(content)}</td>`;
  }

  function escapeHtml(v) {
    const s = String(v == null ? "" : v);
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ---------------- Expose minimal debug handle ----------------
  window.loyaltyAdmin = {
    refreshActiveTab,
    loadAccounts, // for console testing
    state,
  };

  // ---------------- Init ----------------
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
