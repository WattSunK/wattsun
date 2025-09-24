// public/admin/js/loyalty-manage.js

// Minimal enhancer for Accounts Manage button + dialog
(function () {
  const $ = (s, r=document) => r.querySelector(s);

  // Show Manage button only when Accounts tab is active
  function toggleManageVisibility() {
    const btn = $("#accManageBtn");
    const accTabVisible = $("#loyaltyTabAccounts")?.style.display !== "none";
    if (btn) btn.style.display = accTabVisible ? "" : "none";
  }

  // Hook into your tab buttons (ids exist in admin-loyalty.html)
  function bindTabButtons() {
    ["tabWithdrawalsBtn","tabAccountsBtn","tabLedgerBtn","tabNotifsBtn"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("click", () => setTimeout(toggleManageVisibility, 0));
    });
    // First run
    toggleManageVisibility();
  }

  // Account ops → existing endpoints
  async function apiUpdateStatus({ accountId, status, note }) {
    const r = await fetch(`/api/admin/loyalty/accounts/${encodeURIComponent(accountId)}/status`, {
      method:"PATCH", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ status, note: note || "" })
    });
    return r.json();
  }
  async function apiExtend({ userId, months, note }) {
    const r = await fetch(`/api/admin/loyalty/extend`, {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ userId:Number(userId), months:Number(months), note: note || "" })
    });
    return r.json();
  }
  async function apiPenalize({ userId, points, note }) {
    const r = await fetch(`/api/admin/loyalty/penalize`, {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ userId:Number(userId), points:Number(points), note: note || "" })
    });
    return r.json();
  }

  function show(resp) {
    const out = $("#mOut");
    if (!out) return;
    out.textContent = JSON.stringify(resp, null, 2);
  }

  function bindDialog() {
    const dlg = $("#accManageDialog");
    const btn = $("#accManageBtn");
    if (!dlg || !btn) return;

    btn.addEventListener("click", () => dlg.showModal());

    $("#mUpdateStatus")?.addEventListener("click", async () => {
      const accountId = $("#mAccId").value.trim();
      const status = $("#mStatus").value;
      if (!accountId) return show({ success:false, error:{ message:"Account ID required" }});
      const resp = await apiUpdateStatus({ accountId, status });
      show(resp);
    });

    $("#mExtend")?.addEventListener("click", async () => {
      const userId = $("#mUserId").value.trim();
      const months = $("#mExtendMonths").value;
      const note = $("#mExtendNote").value.trim();
      if (!userId) return show({ success:false, error:{ message:"User ID required" }});
      const resp = await apiExtend({ userId, months, note });
      show(resp);
    });

    $("#mPenalize")?.addEventListener("click", async () => {
      const userId = $("#mUserId").value.trim();
      const points = $("#mPenaltyPoints").value;
      const note = $("#mPenaltyNote").value.trim();
      if (!userId) return show({ success:false, error:{ message:"User ID required" }});
      const resp = await apiPenalize({ userId, points, note });
      show(resp);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindTabButtons();
    bindDialog();
  });
})();
