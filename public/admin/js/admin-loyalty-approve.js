/**
 * public/admin/js/admin-loyalty-approve.js
 * ✅ Updated Oct 2025 – Adds ledger + notification logic
 * Behavior:
 *   - Approves withdrawal
 *   - Adds ledger note "Withdrawal #<id> approved"
 *   - Queues notification "Withdrawal #<id> approved"
 */

(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ─────────────────────────────────────────────
  // API helper – approve withdrawal
  // ─────────────────────────────────────────────
  async function approveWithdrawal(id, noteText) {
    const note = noteText || `Withdrawal #${id} approved`;
    const notification = note;
    try {
      const res = await fetch(`/api/admin/loyalty/withdrawals/${id}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ note, notification })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data?.error?.message || "Approve failed");
      return data;
    } catch (err) {
      console.error("[approveWithdrawal] failed:", err);
      throw err;
    }
  }

  // ─────────────────────────────────────────────
  // Modal & Event Handlers
  // ─────────────────────────────────────────────
  const modal = $("#modalApprove");
  const form = modal?.querySelector("form");
  const btnClose = modal?.querySelector(".btn-close");

  function openModal(id) {
    if (!modal) return;
    modal.dataset.id = id;
    modal.classList.add("open");
    $("#approveId", modal).textContent = id;
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

    const noteInput = $("#approveNote", form)?.value?.trim();
    const noteText = noteInput || `Withdrawal #${id} approved`;

    try {
      const data = await approveWithdrawal(id, noteText);
      if (data.success) {
        alert(`✅ Withdrawal #${id} approved.`);
        closeModal();
        localStorage.setItem("loyaltyUpdatedAt", Date.now());
        window.dispatchEvent(new CustomEvent("loyalty:save-success", {
          detail: { action: "approve", id }
        }));
      } else {
        console.error("Approve failed:", data.error);
        alert("Error approving withdrawal.");
      }
    } catch (err) {
      console.error(err);
      alert("Network error while approving.");
    }
  });

  // ─────────────────────────────────────────────
  // Event listener for Approve buttons
  // ─────────────────────────────────────────────
  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".btn-approve");
    if (!btn) return;
    const id = btn.dataset.id;
    openModal(id);
  });

  // ESC key closes modal
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && modal?.classList.contains("open")) closeModal();
  });
})();
