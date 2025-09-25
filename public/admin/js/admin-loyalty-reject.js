/**
 * Admin — Withdrawals: Reject modal + binder (Phase 5.4, Increment 2)
 * - Adds a lightweight modal (inserted at runtime) to capture a rejection reason
 * - Binds clicks on `.btn-reject` inside `#withdrawalsTable`
 * - Calls PATCH /api/admin/loyalty/withdrawals/:id/reject with { note }
 * - Emits `loyalty:save-success` / `loyalty:save-error` for your existing toasts + auto-refresh
 *
 * Zero dependencies. Safe to include alongside admin-loyalty.js and admin-loyalty-approve.js
 */

(function () {
  const table = document.querySelector("#withdrawalsTable");
  if (!table) return;

  // ---------- Modal markup ----------
  const modalHtml = `
    <div id="rejectModal" class="ws-modal hidden fixed inset-0 z-50">
      <div class="ws-backdrop absolute inset-0 bg-black/50"></div>
      <div class="ws-dialog absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl w-[min(92vw,560px)]">
        <div class="ws-header px-4 py-3 border-b flex items-center justify-between">
          <h3 class="text-base font-semibold">Reject Withdrawal</h3>
          <button type="button" class="ws-close px-2 py-1 text-gray-500 hover:text-gray-800" aria-label="Close">✕</button>
        </div>
        <form class="ws-form">
          <div class="ws-body p-4 space-y-3">
            <input type="hidden" name="withdrawalId" />
            <div class="text-sm text-gray-600">
              Please enter a reason. The user will be notified.
            </div>
            <label class="block">
              <span class="block text-sm font-medium mb-1">Reason</span>
              <textarea name="note" rows="4" class="ws-input block w-full border rounded-md px-3 py-2 focus:outline-none focus:ring" placeholder="e.g. IBAN mismatch, failed KYC, etc."></textarea>
            </label>
            <div class="ws-error text-sm text-red-600 hidden"></div>
          </div>
          <div class="ws-footer px-4 py-3 border-t flex justify-end gap-2">
            <button type="button" class="ws-cancel px-4 py-2 rounded-md border bg-white hover:bg-gray-50">Cancel</button>
            <button type="submit" class="ws-submit px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60">Reject</button>
          </div>
        </form>
      </div>
    </div>
  `.trim();

  // ---------- Modal injection ----------
  const container = document.createElement("div");
  container.innerHTML = modalHtml;
  document.body.appendChild(container);

  const modal     = document.getElementById("rejectModal");
  const form      = modal.querySelector(".ws-form");
  const inputId   = modal.querySelector('input[name="withdrawalId"]');
  const inputNote = modal.querySelector('textarea[name="note"]');
  const btnClose  = modal.querySelector(".ws-close");
  const btnCancel = modal.querySelector(".ws-cancel");
  const btnSubmit = modal.querySelector(".ws-submit");
  const errBox    = modal.querySelector(".ws-error");
  const backdrop  = modal.querySelector(".ws-backdrop");

  function show(id) {
    inputId.value = id || "";
    inputNote.value = "";
    errBox.textContent = "";
    errBox.classList.add("hidden");
    modal.classList.remove("hidden");
    // focus textarea on next frame
    setTimeout(() => inputNote.focus(), 0);
    document.addEventListener("keydown", escHandler, true);
  }
  function hide() {
    modal.classList.add("hidden");
    document.removeEventListener("keydown", escHandler, true);
  }
  function escHandler(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      hide();
    }
  }

  // ---------- Binder: open modal on .btn-reject ----------
  table.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".btn-reject");
    if (!btn) return;
    const row = btn.closest("tr");
    const id = row?.dataset?.id;
    if (!id) return;
    show(id);
  });

  // ---------- Modal controls ----------
  [btnClose, btnCancel, backdrop].forEach(el => el && el.addEventListener("click", hide));

  // ---------- Submit handler ----------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = inputId.value.trim();
    const note = inputNote.value.trim();

    // Basic UX guard
    btnSubmit.disabled = true;
    errBox.classList.add("hidden");
    errBox.textContent = "";

    try {
      const resp = await fetch(`/api/admin/loyalty/withdrawals/${encodeURIComponent(id)}/reject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ note })
      });
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || !data?.success) {
        const msg = data?.error?.message || `HTTP ${resp.status}`;
        throw new Error(msg);
      }

      // Success: emit existing app events (toasts + refresh already wired)
      window.dispatchEvent(new CustomEvent("loyalty:save-success", {
        detail: { action: "reject", id, data }
      }));

      try {
        localStorage.setItem("loyaltyUpdatedAt", String(Date.now()));
        window.postMessage({ type: "loyalty-updated" }, "*");
      } catch (_) {}

      hide();
    } catch (err) {
      // Error: show inline + emit error event for global toast
      const message = err?.message || "Unknown error";
      errBox.textContent = message;
      errBox.classList.remove("hidden");

      window.dispatchEvent(new CustomEvent("loyalty:save-error", {
        detail: { action: "reject", id, message }
      }));
    } finally {
      btnSubmit.disabled = false;
    }
  });

})();
