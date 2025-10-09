/**
 * public/admin/js/admin-loyalty-reject.js
 * ✅ Updated Oct 2025 – Adds ledger + notification logic
 * Behavior:
 *   - Rejects withdrawal
 *   - Adds ledger note "Withdrawal #<id> rejected"
 *   - Queues notification "Withdrawal #<id> rejected"
 */

(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ─────────────────────────────────────────────
  // API helper – reject withdrawal
  // ─────────────────────────────────────────────
  async function rejectWithdrawal(id, noteText) {
    const note = noteText || `Withdrawal #${id} rejected`;
    const notification = note;
    try {
      const res = await fetch(`/api/admin/loyalty/withdrawals/${id}/reject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ note, notification })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data?.error?.message || "Reject failed");
      return data;
    } catch (err) {
      console.error("[rejectWithdrawal] failed:", err);
      throw err;
    }
  }

  // ─────────────────────────────────────────────
  // Modal & Event Handlers
  // ─────────────────────────────────────────────
  const modal = $("#modalReject");
  const form = modal?.querySelector("form");
  const btnClose = modal?.querySelector(".btn-close");

  function openModal(id) {
    if (!modal) return;
    modal.dataset.id = id;
    modal.classList.add("open");
    $("#rejectId", modal).textContent = id;
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove("open");
    delete modal.dataset.id;
    form?.reset();
  }

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

    const noteInput = $("#rejectNote", form)?.value?.trim();
    const noteText = noteInput || `Withdrawal #${id} rejected`;

    try {
      const data = await rejectWithdrawal(id, noteText);
      if (data.success) {
        alert(`❌ Withdrawal #${id} rejected.`);
        closeModal();
        localStorage.setItem("loyaltyUpdatedAt", Date.now());
        window.dispatchEvent(new CustomEvent("loyalty:save-success", {
          detail: { action: "reject", id }
        }));
      } else {
        console.error("Reject failed:", data.error);
        alert("Error rejecting withdrawal.");
      }
    } catch (err) {
      console.error(err);
      alert("Network error while rejecting.");
    }
  });

  // ─────────────────────────────────────────────
  // Event listener for Reject buttons
  // ─────────────────────────────────────────────
  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".btn-reject");
    if (!btn) return;
    const id = btn.dataset.id;
    openModal(id);
  });

  // ESC key closes modal
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && modal?.classList.contains("open")) closeModal();
  });
})();
