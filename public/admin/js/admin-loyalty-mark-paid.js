/**
 * public/admin/js/admin-loyalty-mark-paid.js
 * ✅ Updated Oct 2025 – Fixes patchMarkPaid undefined, adds ledger + notification logic
 * Behavior:
 *   - Marks withdrawal as Paid
 *   - Adds ledger note "Withdrawal #<id> paid"
 *   - Queues notification "Withdrawal #<id> paid"
 */

(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ─────────────────────────────────────────────
  // API helper – mark withdrawal paid
  // ─────────────────────────────────────────────
  async function markWithdrawalPaid(id, { payoutRef, paidAt }) {
    const note = `Withdrawal #${id} paid`;
    const notification = note;
    try {
      const res = await fetch(`/api/admin/loyalty/withdrawals/${id}/mark-paid`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          note,
          notification,
          payoutRef: payoutRef || null,
          paidAt: paidAt || new Date().toISOString()
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data?.error?.message || "Mark Paid failed");
      return data;
    } catch (err) {
      console.error("[markWithdrawalPaid] failed:", err);
      throw err;
    }
  }

  // ─────────────────────────────────────────────
  // Modal & Event Handlers
  // ─────────────────────────────────────────────
  const modal = $("#modalMarkPaid");
  const form = modal?.querySelector("form");
  const btnClose = modal?.querySelector(".btn-close");

  function openModal(id) {
    if (!modal) return;
    modal.dataset.id = id;
    modal.classList.add("open");
    $("#markPaidId", modal).textContent = id;
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove("open");
    delete modal.dataset.id;
    form?.reset();
  }

  // Close on cancel button
  btnClose?.addEventListener("click", (ev) => {
    ev.preventDefault();
    closeModal();
  });

  // ─────────────────────────────────────────────
  // Form submission
  // ─────────────────────────────────────────────
  form?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const id = modal?.dataset.id;
    if (!id) return alert("Missing withdrawal ID");

    const payoutRef = $("#markPaidPayoutRef", form)?.value?.trim() || null;
    const paidAt = $("#markPaidDate", form)?.value || new Date().toISOString();

    try {
      const data = await markWithdrawalPaid(id, { payoutRef, paidAt });

      if (data.success) {
        alert(`💰 Withdrawal #${id} marked as paid.`);
        closeModal();
        localStorage.setItem("loyaltyUpdatedAt", Date.now());
        window.dispatchEvent(new CustomEvent("loyalty:save-success", {
          detail: { action: "mark-paid", id }
        }));
      } else {
        console.error("Mark Paid failed:", data.error);
        alert("Error marking withdrawal as paid.");
      }
    } catch (err) {
      console.error(err);
      alert("Network error while marking paid.");
    }
  });

  // ─────────────────────────────────────────────
  // Event listener for action buttons
  // ─────────────────────────────────────────────
  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".btn-mark-paid");
    if (!btn) return;
    const id = btn.dataset.id;
    openModal(id);
  });

  // ESC key closes modal
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && modal?.classList.contains("open")) {
      closeModal();
    }
  });

})();
