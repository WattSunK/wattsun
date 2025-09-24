// public/admin/js/loyalty-manage.js
(function () {
  const $ = (s, r = document) => r.querySelector(s);

  // ----- utils -----
  function waitForElement(selector, { timeout = 10000, root = document } = {}) {
    return new Promise((resolve, reject) => {
      const existing = root.querySelector(selector);
      if (existing) return resolve(existing);
      const mo = new MutationObserver(() => {
        const el = root.querySelector(selector);
        if (el) { mo.disconnect(); resolve(el); }
      });
      mo.observe(root, { childList: true, subtree: true });
      if (timeout > 0) setTimeout(() => { mo.disconnect(); reject(new Error(`waitForElement timeout: ${selector}`)); }, timeout);
    });
  }

  function csrfHeaders(h = {}) {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta?.content) h["X-CSRF-Token"] = meta.content;
    return h;
  }

  async function jfetch(url, opts = {}) {
    const res = await fetch(url, {
      credentials: "same-origin",
      ...opts,
      headers: { "Content-Type": "application/json", ...(opts.headers || {}), ...csrfHeaders() },
    });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; }
    catch { data = { success: false, error: { code: "HTTP_" + res.status, message: text || res.statusText } }; }
    if (!res.ok) {
      if (!data || data.success !== false) {
        data = { success: false, error: { code: "HTTP_" + res.status, message: (data && data.message) || text || res.statusText } };
      }
    }
    return data;
  }

  function isAccountsActive() {
    const tab = document.getElementById("loyaltyTabAccounts");
    if (tab) return getComputedStyle(tab).display !== "none";
    const fa = document.getElementById("filterAccounts");
    if (fa) return getComputedStyle(fa).display !== "none";
    return false;
  }
  function toggleManageVisibility() {
    const btn = $("#accManageBtn"); if (btn) btn.style.display = isAccountsActive() ? "" : "none";
  }

  // ----- API -----
  const api = {
    updateStatus({ accountId, status, note }) {
      return jfetch(`/api/admin/loyalty/accounts/${encodeURIComponent(accountId)}/status`, {
        method: "PATCH", body: JSON.stringify({ status, note: note || "" }),
      });
    },
    extend({ userId, months, note }) {
      return jfetch(`/api/admin/loyalty/extend`, {
        method: "POST", body: JSON.stringify({ userId: Number(userId), months: Number(months), note: note || "" }),
      });
    },
    penalize({ userId, points, note }) {
      return jfetch(`/api/admin/loyalty/penalize`, {
        method: "POST", body: JSON.stringify({ userId: Number(userId), points: Number(points), note: note || "" }),
      });
    },
  };

  // ----- UI helpers -----
  function show(resp) {
    const out = $("#mOut"); if (!out) return;
    out.textContent = JSON.stringify(resp, null, 2);
  }

  function toast(msg, ok = true) {
    let t = $("#loyToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "loyToast";
      t.style.cssText = "position:fixed;right:16px;bottom:16px;padding:.5rem .75rem;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.12);z-index:9999;";
      document.body.appendChild(t);
    }
    t.style.background = ok ? "#e6f6ea" : "#fdecea";
    t.style.border = ok ? "1px solid #38a16933" : "1px solid #e53e3e33";
    t.style.color = ok ? "#22543d" : "#742a2a";
    t.textContent = msg;
    clearTimeout(toast._h); toast._h = setTimeout(() => (t.style.display = "none"), 2500);
    t.style.display = "block";
  }

  function refreshTables() {
    // preferred: call a global refresh if available
    if (window.AdminLoyalty?.refreshActiveTab) {
      window.AdminLoyalty.refreshActiveTab(); return;
    }
    // fallback: click the main Refresh button
    $("#loyaltyRefreshBtn")?.click();
  }

  // Snapshot current dialog values when it opens, so Apply only sends changes
  function captureSnapshot() {
    const dlg = document.getElementById("accManageDialog");
    if (!dlg) return;
    dlg.dataset.baseStatus       = document.getElementById("mStatus")?.value ?? "";
    dlg.dataset.baseMonths       = document.getElementById("mExtendMonths")?.value ?? "";
    dlg.dataset.baseExtendNote   = document.getElementById("mExtendNote")?.value ?? "";
    dlg.dataset.basePoints       = document.getElementById("mPenaltyPoints")?.value ?? "";
    dlg.dataset.basePenaltyNote  = document.getElementById("mPenaltyNote")?.value ?? "";
  }

  // ----- binders -----
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

  function bindRowOpenDialogOnce() {
    const tbody = document.getElementById("loyaltyAccountsBody");
    const dlg = document.getElementById("accManageDialog");
    if (!tbody || !dlg || tbody.dataset.bound === "1") return;
    tbody.dataset.bound = "1";
    tbody.addEventListener("click", (e) => {
      const tr = e.target.closest("tr"); if (!tr) return;
      const cells = tr.querySelectorAll("td");
      const accId = cells[0]?.textContent?.trim();
      const userId = cells[1]?.textContent?.trim();
      if (accId) $("#mAccId").value = accId;
      if (userId) $("#mUserId").value = userId;
      captureSnapshot();  // <— snapshot baseline when opened via row
      dlg.showModal();
    }, { passive: true });
  }

  function bindApplyOnce() {
    const dlg = $("#accManageDialog"); if (!dlg) return;
    const btn = $("#mApplyAll"); if (!btn || btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";

    // Also bind the main Manage button to snapshot on open (if present)
    const manageBtn = $("#accManageBtn");
    if (manageBtn && !manageBtn.dataset.snapBound) {
      manageBtn.dataset.snapBound = "1";
      manageBtn.addEventListener("click", () => { captureSnapshot(); dlg.showModal(); });
    }

    btn.onclick = async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      const out = $("#mOut"); if (out) out.textContent = "";

      const accountId = $("#mAccId")?.value?.trim();
      const userId    = $("#mUserId")?.value?.trim();
      const status    = $("#mStatus")?.value;
      const months       = $("#mExtendMonths")?.value;
      const extendNote   = $("#mExtendNote")?.value?.trim();
      const points       = $("#mPenaltyPoints")?.value;
      const penaltyNote  = $("#mPenaltyNote")?.value?.trim();

      // Compare with snapshot (only send changed sections)
      const baseStatus      = dlg.dataset.baseStatus || "";
      const baseMonths      = dlg.dataset.baseMonths || "";
      const baseExtendNote  = dlg.dataset.baseExtendNote || "";
      const basePoints      = dlg.dataset.basePoints || "";
      const basePenaltyNote = dlg.dataset.basePenaltyNote || "";

      const changedStatus  = accountId && status &&
                             (status !== baseStatus);
      const changedExtend  = userId && months && Number(months) > 0 &&
                             (months !== baseMonths || (extendNote || "") !== baseExtendNote);
      const changedPenalty = userId && points && Number(points) > 0 &&
                             (points !== basePoints || (penaltyNote || "") !== basePenaltyNote);

      const results = [];
      try {
        if (changedStatus)  results.push(await api.updateStatus({ accountId, status, note: "" }));
        if (changedExtend)  results.push(await api.extend({ userId, months, note: extendNote }));
        if (changedPenalty) results.push(await api.penalize({ userId, points, note: penaltyNote || "Admin penalty" }));
      } catch (e) {
        results.push({ success: false, error: { code: "NETWORK", message: String(e?.message || e) } });
      } finally {
        btn.disabled = false;
      }

      if (!changedStatus && !changedExtend && !changedPenalty) {
        show({ success: true, message: "No changes to apply." });
        return;
      }

      if (results.length) show(results[results.length - 1]);

      const ok = results.every(r => r && r.success !== false);
      if (ok) {
  // Clear optional inputs so they don't get treated as new edits next time
  const m = (id) => document.getElementById(id);
  if (m("mExtendMonths")) m("mExtendMonths").value = "";   // blank => not submitted
  if (m("mExtendNote"))   m("mExtendNote").value   = "";
  if (m("mPenaltyPoints"))m("mPenaltyPoints").value= "";
  if (m("mPenaltyNote"))  m("mPenaltyNote").value  = "";

  // Re-snapshot the baseline to the cleared/current values
  captureSnapshot();

  // Refresh → close → toast
  refreshTables();
  dlg.close();
  toast("Changes applied", true);
} else {
  toast("Some actions failed — see Response", false);
}

    };
  }

  async function initWhenReady() {
    await waitForElement("#accManageBtn", { timeout: 0 });
    bindTabButtonsOnce();
    bindRowOpenDialogOnce();
    bindApplyOnce();
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
// public/admin/js/loyalty-manage.js
