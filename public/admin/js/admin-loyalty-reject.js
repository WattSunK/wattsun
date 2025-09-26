/**
 * Admin — Withdrawals: Reject modal + binder (robust delegation)
 * - Opens a modal on .btn-reject (delegated at document level)
 * - Submits PATCH /reject with { note }
 * - Emits loyalty:save-success / loyalty:save-error
 */
(function () {
  "use strict";

  // ---------- Modal markup (injected once) ----------
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
    setTimeout(() => inputNote.focus(), 0);
    document.addEventListener("keydown", escHandler, true);
  }
  function hide() {
    modal.classList.add("hidden");
    document.removeEventListener("keydown", escHandler, true);
  }
  function escHandler(e) { if (e.key === "Escape") { e.preventDefault(); hide(); } }

  [btnClose, btnCancel, backdrop].forEach(el => el && el.addEventListener("click", hide));

  // Robust id resolver
  function getIdFrom(el) {
    if (!el) return null;
    if (el.dataset && el.dataset.id) return el.dataset.id;
    const wrap = el.closest(".ws-actions");
    if (wrap && wrap.dataset && wrap.dataset.id) return wrap.dataset.id;
    const tr = el.closest("tr");
    if (tr && tr.dataset && tr.dataset.id) return tr.dataset.id;
    return null;
  }

  // Open modal on any .btn-reject (delegated at document)
  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".btn-reject");
    if (!btn) return;

    const id = getIdFrom(btn);
    if (!id) {
      window.dispatchEvent(new CustomEvent("loyalty:save-error", {
        detail: { action: "reject", message: "Missing withdrawal id" }
      }));
      return;
    }

    // If this came from the floating dropdown, ensure data-id is present
    btn.dataset.id = id;
    show(id);
  }, true); // capture to run before menu auto-close

  // Submit -> PATCH /reject
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = inputId.value.trim();
    const note = inputNote.value.trim();

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
      if (!resp.ok || data?.success === false) {
        const msg = data?.error?.message || `HTTP ${resp.status}`;
        throw new Error(msg);
      }

      window.dispatchEvent(new CustomEvent("loyalty:save-success", {
        detail: { action: "reject", id, data }
      }));

      try {
        localStorage.setItem("loyaltyUpdatedAt", String(Date.now()));
        window.postMessage({ type: "loyalty-updated" }, "*");
      } catch (_) {}

      hide();
    } catch (err) {
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
