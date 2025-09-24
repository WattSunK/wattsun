// public/admin/js/loyalty-manage.js
// Enhancer for Accounts -> Manage dialog. Works with injected partials.
// - Sends cookies/CSRF with fetch
// - Binds once, debounces clicks, and refreshes the table on success
// - Prefills Account/User from clicked row

(function () {
  // ---------- small utils ----------
  const $ = (s, r = document) => r.querySelector(s);

  function waitForElement(selector, { timeout = 10000, root = document } = {}) {
    return new Promise((resolve, reject) => {
      const existing = root.querySelector(selector);
      if (existing) return resolve(existing);
      const mo = new MutationObserver(() => {
        const el = root.querySelector(selector);
        if (el) {
          mo.disconnect();
          resolve(el);
        }
      });
      mo.observe(root, { childList: true, subtree: true });
      if (timeout > 0) {
        setTimeout(() => {
          mo.disconnect();
          reject(new Error(`waitForElement timeout: ${selector}`));
        }, timeout);
      }
    });
  }

  // Fetch wrapper: same-origin cookies + optional CSRF, readable errors
  function csrfHeaders(h = {}) {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta && meta.content) {
      h["X-CSRF-Token"] = meta.content;
    }
    return h;
  }
  async function jfetch(url, opts = {}) {
    const res = await fetch(url, {
      credentials: "same-origin",
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(opts.headers || {}),
        ...csrfHeaders(),
      },
    });
    const text = await res.text(); // read once
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { success: false, error: { code: "HTTP_" + res.status, message: text || res.statusText } };
    }
    if (!res.ok) {
      // normalize error shape
      if (!data || data.success !== false) {
        data = { success: false, error: { code: "HTTP_" + res.status, message: (data && data.message) || text || res.statusText } };
      }
    }
    return data;
  }

  // Detect Accounts tab visibility
  function isAccountsActive() {
    const tab = document.getElementById("loyaltyTabAccounts");
    if (tab) return getComputedStyle(tab).display !== "none";
    const fa = document.getElementById("filterAccounts");
    if (fa) return getComputedStyle(fa).display !== "none";
    return false;
  }
  function toggleManageVisibility() {
    const btn = document.getElementById("accManageBtn");
    if (btn) btn.style.display = isAccountsActive() ? "" : "none";
  }

  // ---------- API ----------
  const api = {
    updateStatus({ accountId, status, note }) {
      return jfetch(`/api/admin/loyalty/accounts/${encodeURIComponent(accountId)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, note: note || "" }),
      });
    },
    extend({ userId, months, note }) {
      return jfetch(`/api/admin/loyalty/extend`, {
        method: "POST",
        body: JSON.stringify({ userId: Number(userId), months: Number(months), note: note || "" }),
      });
    },
    penalize({ userId, points, note }) {
      return jfetch(`/api/admin/loyalty/penalize`, {
        method: "POST",
        body: JSON.stringify({ userId: Number(userId), points: Number(points), note: note || "" }),
      });
    },
  };

  // ---------- binders ----------
  function bindTabButtonsOnce() {
    if (bindTabButtonsOnce._done) return;
    ["tabWithdrawalsBtn", "tabAccountsBtn", "tabLedgerBtn", "tabNotifsBtn"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("click", () => setTimeout(toggleManageVisibility, 0), { passive: true });
    });
    const root = document.getElementById("loyalty-root") || document.body;
    if (window.MutationObserver) {
      const mo = new MutationObserver(() => toggleManageVisibility());
      mo.observe(root, { attributes: true, attributeFilter: ["style", "class"], subtree: true });
    }
    bindTabButtonsOnce._done = true;
    toggleManageVisibility();
  }

  function show(resp) {
    const out = document.getElementById("mOut");
    if (!out) return;
    out.textContent = JSON.stringify(resp, null, 2);
  }

  function disableWhilePending(btn, fn) {
    return async () => {
      if (!btn || btn.disabled) return;
      btn.disabled = true;
      try {
        await fn();
      } finally {
        btn.disabled = false;
      }
    };
  }

  function refreshTables() {
    // Reuse your existing UX: click the main Refresh button
    const ref = document.getElementById("loyaltyRefreshBtn");
    ref && ref.click();
  }

  function bindDialogOnce() {
    const dlg = document.getElementById("accManageDialog");
    const btn = document.getElementById("accManageBtn");
    if (!dlg || !btn) return;

    // Open modal
    if (!bindDialogOnce._openBound) {
      btn.addEventListener("click", () => dlg.showModal());
      bindDialogOnce._openBound = true;
    }

    // Overwrite handlers (prevents duplicate API calls on partial reloads)
    const upd = document.getElementById("mUpdateStatus");
    const ext = document.getElementById("mExtend");
    const pen = document.getElementById("mPenalize");

    if (upd) {
      upd.onclick = disableWhilePending(upd, async () => {
        const accountId = document.getElementById("mAccId").value.trim();
        const status = document.getElementById("mStatus").value;
        if (!accountId) return show({ success: false, error: { message: "Account ID required" } });
        const resp = await api.updateStatus({ accountId, status });
        show(resp);
        if (resp && resp.success) refreshTables();
      });
    }

    if (ext) {
      ext.onclick = disableWhilePending(ext, async () => {
        const userId = document.getElementById("mUserId").value.trim();
        const months = document.getElementById("mExtendMonths").value;
        const note = document.getElementById("mExtendNote").value.trim();
        if (!userId) return show({ success: false, error: { message: "User ID required" } });
        const resp = await api.extend({ userId, months, note });
        show(resp);
        if (resp && resp.success) refreshTables();
      });
    }

    if (pen) {
      pen.onclick = disableWhilePending(pen, async () => {
        const userId = document.getElementById("mUserId").value.trim();
        const points = document.getElementById("mPenaltyPoints").value;
        const note = document.getElementById("mPenaltyNote").value.trim();
        if (!userId) return show({ success: false, error: { message: "User ID required" } });
        const resp = await api.penalize({ userId, points, note });
        show(resp);
        if (resp && resp.success) refreshTables();
      });
    }
  }

  function bindRowOpenDialogOnce() {
    const tbody = document.getElementById("loyaltyAccountsBody");
    const dlg = document.getElementById("accManageDialog");
    if (!tbody || !dlg || tbody.dataset.bound === "1") return;
    tbody.dataset.bound = "1";
    tbody.addEventListener(
      "click",
      (e) => {
        const tr = e.target.closest("tr");
        if (!tr) return;
        const cells = tr.querySelectorAll("td");
        const accId = cells[0]?.textContent?.trim();
        const userId = cells[1]?.textContent?.trim();
        if (accId) document.getElementById("mAccId").value = accId;
        if (userId) document.getElementById("mUserId").value = userId;
        dlg.showModal();
      },
      { passive: true }
    );
  }

  // ---------- init flow ----------
  async function initWhenReady() {
    // Wait until the Manage button exists (partial loaded)
    await waitForElement("#accManageBtn", { timeout: 0 });
    bindTabButtonsOnce();
    bindDialogOnce();
    bindRowOpenDialogOnce();
    toggleManageVisibility();
  }

  document.addEventListener("DOMContentLoaded", () => {
    initWhenReady();
    if (window.MutationObserver) {
      const root = document.getElementById("content") || document.body;
      const mo = new MutationObserver(() => {
        if (document.getElementById("accManageBtn")) initWhenReady();
      });
      mo.observe(root, { childList: true, subtree: true });
    }
  });
})();
