/**
 * Admin — Loyalty Withdrawals: Mark Paid modal + binder
 * - Opens a small modal to collect payout ref + paid date
 * - PATCH /api/admin/loyalty/withdrawals/:id/mark-paid
 * - On success:
 *    • dispatches `loyalty:save-success` (existing toast + refresh listeners)
 *    • hard-refreshes Withdrawals list
 *    • background refresh: Accounts, Ledger, Notifications (when available)
 *
 * Requires:
 *  - Action cell contains a button with class `.btn-mark-paid` and data-id on a parent `.ws-actions`
 *  - `window.loyaltyAdmin` object exposes: loadWithdrawals, loadAccounts, loadLedger, loadNotifications
 */

(function () {
  "use strict";

  /* ---------------------------- Modal markup ---------------------------- */

  const modalHtml = `
  <div id="ws-paid-modal" class="fixed inset-0 z-[1000] hidden">
    <div class="absolute inset-0 bg-black/40 ws-paid-backdrop"></div>
    <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl w-[min(92vw,520px)]">
      <div class="px-4 py-3 border-b flex items-center justify-between">
        <h3 class="text-base font-semibold">Mark Withdrawal as Paid</h3>
        <button type="button" class="ws-paid-close text-gray-500 hover:text-gray-800 px-2" aria-label="Close">✕</button>
      </div>
      <form class="ws-paid-form">
        <div class="p-4 space-y-4">
          <input type="hidden" name="withdrawalId" />
          <label class="block">
            <span class="block text-sm font-medium mb-1">Payment reference</span>
            <input type="text" name="payoutRef" class="block w-full border rounded-md px-3 py-2 focus:outline-none focus:ring" placeholder="e.g. TX-ABC-123" />
          </label>
          <label class="block">
            <span class="block text-sm font-medium mb-1">Paid date</span>
            <input type="datetime-local" name="paidAt" class="block w-full border rounded-md px-3 py-2 focus:outline-none focus:ring" />
          </label>
          <p class="ws-paid-error text-sm text-red-600 hidden"></p>
        </div>
        <div class="px-4 py-3 border-t flex justify-end gap-2">
          <button type="button" class="ws-paid-cancel px-4 py-2 rounded-md border bg-white hover:bg-gray-50">Cancel</button>
          <button type="submit" class="ws-paid-submit px-4 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60">Mark Paid</button>
        </div>
      </form>
    </div>
  </div>
  `.trim();

  const mount = document.createElement("div");
  mount.innerHTML = modalHtml;
  document.body.appendChild(mount);

  const modal   = document.getElementById("ws-paid-modal");
  const back    = modal.querySelector(".ws-paid-backdrop");
  const btnX    = modal.querySelector(".ws-paid-close");
  const btnCan  = modal.querySelector(".ws-paid-cancel");
  const form    = modal.querySelector(".ws-paid-form");
  const errBox  = modal.querySelector(".ws-paid-error");
  const btnSub  = modal.querySelector(".ws-paid-submit");
  const idInp   = modal.querySelector('input[name="withdrawalId"]');
  const refInp  = modal.querySelector('input[name="payoutRef"]');
  const dateInp = modal.querySelector('input[name="paidAt"]');

  function nowLocalISO() {
    const d = new Date();
    d.setSeconds(0,0);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function openModal(id) {
    idInp.value = id || "";
    refInp.value = "";
    dateInp.value = nowLocalISO();
    errBox.textContent = ""; errBox.classList.add("hidden");
    modal.classList.remove("hidden");
    setTimeout(() => refInp.focus(), 0);
    document.addEventListener("keydown", onEsc, true);
  }
  function closeModal() {
    modal.classList.add("hidden");
    document.removeEventListener("keydown", onEsc, true);
  }
  function onEsc(e) { if (e.key === "Escape") { e.preventDefault(); closeModal(); } }
  [back, btnX, btnCan].forEach(el => el && el.addEventListener("click", closeModal));

  /* --------------------------- Event delegation -------------------------- */

  function getRowIdFrom(el) {
    if (!el) return null;
    if (el.dataset?.id) return el.dataset.id;
    const wrap = el.closest(".ws-actions"); if (wrap?.dataset?.id) return wrap.dataset.id;
    const tr = el.closest("tr"); if (tr?.dataset?.id) return tr.dataset.id;
    return null;
  }

  // Open modal when clicking "Mark Paid…" option
  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".btn-mark-paid");
    if (!btn) return;
    const id = getRowIdFrom(btn);
    if (!id) {
      window.dispatchEvent(new CustomEvent("loyalty:save-error", { detail: { action:"mark-paid", message:"Missing withdrawal id" } }));
      return;
    }
    openModal(id);
  }, true);

  /* ------------------------------ API call ------------------------------- */

  async function patchMarkPaid(id, payload) {
    const resp = await fetch(`/api/admin/loyalty/withdrawals/${encodeURIComponent(id)}/mark-paid`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data?.success === false) {
      const msg = data?.error?.message || `HTTP ${resp.status}`;
      throw new Error(msg);
    }
    return data;
  }

  /* ------------------------------- Submit -------------------------------- */

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = idInp.value.trim();
    const payoutRef = refInp.value.trim() || null;
    const paidAt = dateInp.value ? new Date(dateInp.value).toISOString() : new Date().toISOString();

    errBox.textContent = ""; errBox.classList.add("hidden");
    btnSub.disabled = true;

    try {
      const data = await patchMarkPaid(id, { payoutRef, paidAt });

      // Global success: existing listeners show toasts + reload current tab
      window.dispatchEvent(new CustomEvent("loyalty:save-success", {
        detail: { action: "mark-paid", id, data }
      }));

      // Force a withdrawals refresh immediately (defensive)
      const admin = window.loyaltyAdmin || {};
      admin.loadWithdrawals && admin.loadWithdrawals({ resetPage: false });

      // Background refresh other tabs per server hint (or refresh all if absent)
      const r = data?.refresh || {};
      if (r.accounts && admin.loadAccounts) admin.loadAccounts({ resetPage: false });
      if (r.ledger && admin.loadLedger) admin.loadLedger();
      if (r.notifications && admin.loadNotifications) admin.loadNotifications();
      if (!("refresh" in data)) {
        admin.loadAccounts && admin.loadAccounts({ resetPage:false });
        admin.loadLedger && admin.loadLedger();
        admin.loadNotifications && admin.loadNotifications();
      }

      closeModal();
    } catch (err) {
      errBox.textContent = err?.message || "Mark Paid failed";
      errBox.classList.remove("hidden");
      window.dispatchEvent(new CustomEvent("loyalty:save-error", {
        detail: { action: "mark-paid", id, message: err?.message || "Mark Paid failed" }
      }));
    } finally {
      btnSub.disabled = false;
    }
  });
})();
