// public/admin/js/loyalty-manage.js
// Minimal enhancer for Accounts Manage button + dialog
// Works even when the Loyalty partial is injected after DOMContentLoaded.

(function () {
  const $ = (s, r = document) => r.querySelector(s);

  // ---------- utilities ----------
  function waitForElement(selector, { timeout = 10000, root = document } = {}) {
    return new Promise((resolve, reject) => {
      const el = root.querySelector(selector);
      if (el) return resolve(el);

      const obs = new MutationObserver(() => {
        const found = root.querySelector(selector);
        if (found) {
          obs.disconnect();
          resolve(found);
        }
      });
      obs.observe(root, { childList: true, subtree: true });

      if (timeout > 0) {
        setTimeout(() => {
          obs.disconnect();
          reject(new Error(`waitForElement timeout: ${selector}`));
        }, timeout);
      }
    });
  }

  // Robustly detect if Accounts tab is active
  function isAccountsActive() {
    const tab = document.getElementById("loyaltyTabAccounts");
    if (tab) return window.getComputedStyle(tab).display !== "none";
    const fa = document.getElementById("filterAccounts");
    if (fa) return window.getComputedStyle(fa).display !== "none";
    return false;
  }

  // Show Manage button only when Accounts tab is active
  function toggleManageVisibility() {
    const btn = document.getElementById("accManageBtn");
    if (!btn) return;
    btn.style.display = isAccountsActive() ? "" : "none";
  }

  // ---------- API ----------
  async function apiUpdateStatus({ accountId, status, note }) {
    const r = await fetch(`/api/admin/loyalty/accounts/${encodeURIComponent(accountId)}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, note: note || "" }),
    });
    return r.json();
  }

  async function apiExtend({ userId, months, note }) {
    const r = await fetch(`/api/admin/loyalty/extend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: Number(userId), months: Number(months), note: note || "" }),
    });
    return r.json();
  }

  async function apiPenalize({ userId, points, note }) {
    const r = await fetch(`/api/admin/loyalty/penalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: Number(userId), points: Number(points), note: note || "" }),
    });
    return r.json();
  }

  // ---------- UI helpers ----------
  function show(resp) {
    const out = document.getElementById("mOut");
    if (!out) return;
    out.textContent = JSON.stringify(resp, null, 2);
  }

  function bindTabButtons() {
    ["tabWithdrawalsBtn", "tabAccountsBtn", "tabLedgerBtn", "tabNotifsBtn"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("click", () => setTimeout(toggleManageVisibility, 0));
    });

    // Observe loyalty-root for class/style changes that might hide/show tabs
    const observeEl = document.getElementById("loyalty-root") || document;
    if (observeEl && window.MutationObserver) {
      const mo = new MutationObserver(() => toggleManageVisibility());
      mo.observe(observeEl, { attributes: true, attributeFilter: ["style", "class"], subtree: true });
    }

    toggleManageVisibility();
  }

  function bindDialog() {
    const dlg = document.getElementById("accManageDialog");
    const btn = document.getElementById("accManageBtn");
    if (!dlg || !btn) return;

    btn.addEventListener("click", () => dlg.showModal());

    const upd = document.getElementById("mUpdateStatus");
    const ext = document.getElementById("mExtend");
    const pen = document.getElementById("mPenalize");

    upd?.addEventListener("click", async () => {
      const accountId = document.getElementById("mAccId").value.trim();
      const status = document.getElementById("mStatus").value;
      if (!accountId) return show({ success: false, error: { message: "Account ID required" } });
      try {
        const resp = await apiUpdateStatus({ accountId, status });
        show(resp);
      } catch (e) {
        show({ success: false, error: { code: "NETWORK", message: String(e.message || e) } });
      }
    });

    ext?.addEventListener("click", async () => {
      const userId = document.getElementById("mUserId").value.trim();
      const months = document.getElementById("mExtendMonths").value;
      const note = document.getElementById("mExtendNote").value.trim();
      if (!userId) return show({ success: false, error: { message: "User ID required" } });
      try {
        const resp = await apiExtend({ userId, months, note });
        show(resp);
      } catch (e) {
        show({ success: false, error: { code: "NETWORK", message: String(e.message || e) } });
      }
    });

    pen?.addEventListener("click", async () => {
      const userId = document.getElementById("mUserId").value.trim();
      const points = document.getElementById("mPenaltyPoints").value;
      const note = document.getElementById("mPenaltyNote").value.trim();
      if (!userId) return show({ success: false, error: { message: "User ID required" } });
      try {
        const resp = await apiPenalize({ userId, points, note });
        show(resp);
      } catch (e) {
        show({ success: false, error: { code: "NETWORK", message: String(e.message || e) } });
      }
    });

    // Optional: clicking a row pre-fills Account ID + User ID and opens the dialog
    const accTbody = document.getElementById("loyaltyAccountsBody");
    if (accTbody) {
      accTbody.addEventListener("click", (e) => {
        const tr = e.target.closest("tr");
        if (!tr) return;
        const cells = tr.querySelectorAll("td");
        const id = cells[0]?.textContent?.trim();
        const uid = cells[1]?.textContent?.trim();
        if (id) document.getElementById("mAccId").value = id;
        if (uid) document.getElementById("mUserId").value = uid;
        dlg.showModal();
      });
    }
  }

  // Initialize after the Loyalty partial is injected
  let boundOnce = false;
  async function initWhenReady() {
    try {
      await waitForElement("#accManageBtn", { timeout: 0 }); // wait until partial is present
      bindTabButtons();
      bindDialog();
      toggleManageVisibility();
      boundOnce = true;
    } catch (_) {
      /* ignore */
    }
  }

  // Detect partial insertions/reloads
  document.addEventListener("DOMContentLoaded", () => {
    initWhenReady(); // try immediately

    if (window.MutationObserver) {
      const root = document.getElementById("content") || document.body;
      const mo = new MutationObserver(() => {
        if (!boundOnce || document.getElementById("accManageBtn")) {
          initWhenReady();
        }
      });
      mo.observe(root, { childList: true, subtree: true });
    }
  });
})();
