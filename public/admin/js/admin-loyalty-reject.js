/**
 * Admin — Withdrawals: Reject modal + binder (robust, SPA-safe)
 * - Opens a modal on .btn-reject (delegated at document level, capture phase)
 * - Submits PATCH /reject with { note }
 * - Emits loyalty:save-success / loyalty:save-error
 */
(function () {
  "use strict";

  // Prevent duplicate injection on SPA partial swaps / script re-includes
  if (document.getElementById("rejectModal")) return;

  // ---------- Minimal CSS so this works without Tailwind ----------
  if (!document.getElementById("ws-reject-css")) {
    const css = document.createElement("style");
    css.id = "ws-reject-css";
    css.textContent = `
      .hidden{display:none}
      .ws-modal{position:fixed;inset:0;z-index:10000}
      .ws-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.5)}
      .ws-dialog{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#fff;border-radius:12px;
        box-shadow:0 20px 50px rgba(0,0,0,.25);width:min(92vw,560px);overflow:hidden}
      .ws-header,.ws-footer{display:flex;align-items:center;justify-content:space-between;gap:.5rem;border-color:#eee}
      .ws-header{padding:12px 16px;border-bottom:1px solid #eee}
      .ws-footer{padding:12px 16px;border-top:1px solid #eee}
      .ws-body{padding:16px}
      .ws-input{border:1px solid #ccc;border-radius:8px;padding:8px 10px;width:100%}
      .ws-close{border:none;background:transparent;cursor:pointer}
      .ws-error{color:#b00020;margin-top:4px}
      .ws-btn{border-radius:8px;padding:8px 14px;font-weight:500;cursor:pointer}
      .ws-btn--ghost{background:#fff;border:1px solid #ccc;color:#444}
      .ws-btn--ghost:hover{border-color:#999;color:#000}
      .ws-btn--danger{background:#b00020;color:#fff;border:none}
      .ws-btn--danger:hover{background:#d32f2f}
    `;
    document.head.appendChild(css);
  }

  // ---------- Modal markup (injected once) ----------
  const modalHtml = `
    <div id="rejectModal" class="ws-modal hidden" role="dialog" aria-modal="true">
      <div class="ws-backdrop"></div>
      <div class="ws-dialog">
        <div class="ws-header">
          <h3 style="margin:0;font-size:16px;font-weight:600;">Reject Withdrawal</h3>
          <button type="button" class="ws-close" aria-label="Close">✕</button>
        </div>
        <form class="ws-form">
          <div class="ws-body">
            <input type="hidden" name="withdrawalId" />
            <div class="text-sm" style="color:#666;margin-bottom:8px;">
              Please enter a reason. The user will be notified.
            </div>
            <label class="block" style="display:block;margin-bottom:10px;">
              <span style="display:block;font-size:14px;font-weight:600;margin-bottom:6px;">Reason</span>
              <textarea name="note" rows="4" class="ws-input" placeholder="e.g. IBAN mismatch, failed KYC, etc."></textarea>
            </label>
            <div class="ws-error hidden"></div>
          </div>
          <div class="ws-footer" style="justify-content:flex-end;gap:8px;">
            <button type="button" class="ws-cancel ws-btn ws-btn--ghost">Cancel</button>
            <button type="submit" class="ws-submit ws-btn ws-btn--danger">Reject</button>
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

  // Open modal on any .btn-reject (delegated at document, capture phase)
  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".btn-reject");
    if (!btn) return;

    // IMPORTANT: prevent other reject handlers from firing (e.g., in admin-loyalty.js)
    ev.preventDefault();
    ev.stopPropagation();

    const id = getIdFrom(btn);
    if (!id) {
      window.dispatchEvent(new CustomEvent("loyalty:save-error", {
        detail: { action: "reject", message: "Missing withdrawal id" }
      }));
      return;
    }

    // If this came from a cloned floating menu, ensure data-id is present
    btn.dataset.id = id;
    show(id);
  }, true); // capture to run before bubble listeners

  // Submit -> PATCH /reject with note
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = (inputId.value || "").trim();
    const note = (inputNote.value || "").trim();

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
