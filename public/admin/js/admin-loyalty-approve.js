/**
 * Minimal, additive binder for Approve action.
 * - Expects a table with rows containing data-id for withdrawal ID
 * - Buttons with class .btn-approve inside each row
 * - Emits loyalty:save-success / loyalty:save-error (your toasts + auto-refresh already listen)
 */
(function () {
  const table = document.querySelector("#withdrawalsTable");
  if (!table) return;

  async function approve(withdrawalId) {
    try {
      const r = await fetch(`/api/admin/loyalty/withdrawals/${withdrawalId}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" }
      });
      const data = await r.json();
      if (!r.ok || !data.success) {
        const msg = data?.error?.message || `HTTP ${r.status}`;
        window.dispatchEvent(new CustomEvent("loyalty:save-error", { detail: { action: "approve", id: withdrawalId, message: msg } }));
        return;
      }
      // success: toast + auto-refresh hooks already wired in your app
      window.dispatchEvent(new CustomEvent("loyalty:save-success", { detail: { action: "approve", id: withdrawalId, data } }));

      // also trigger your existing refresh signal (if present in your codebase)
      try {
        localStorage.setItem("loyaltyUpdatedAt", String(Date.now()));
        window.postMessage({ type: "loyalty-updated" }, "*");
      } catch (_) {}
    } catch (e) {
      window.dispatchEvent(new CustomEvent("loyalty:save-error", { detail: { action: "approve", id: withdrawalId, message: e.message } }));
    }
  }

  table.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".btn-approve");
    if (!btn) return;
    const row = btn.closest("tr");
    const id = row?.dataset?.id;
    if (!id) return;
    approve(id);
  });
})();
