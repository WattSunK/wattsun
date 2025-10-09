/**
 * public/admin/js/admin-loyalty-reject.js
 *
 * Admin — Withdrawals: Reject modal (robust, SPA-safe)
 * - Opens a modal when any `.btn-reject` is clicked (delegated @ document, capture phase).
 * - Submits PATCH /reject with { note } and emits refresh signals.
 * - Auto-closes the floating Actions popover (if open) before showing the modal.
 * - Guarded against duplicate injection on SPA partial swaps.
 */
(function () {
  "use strict";

  // Prevent duplicate injection on SPA partial swaps / script re-includes
  if (document.getElementById("rejectModal")) return;

  // ---------- Minimal CSS so this works without Tailwind / external styles ----------
  if (!document.getElementById("ws-reject-css")) {
    const css = document.createElement("style");
    css.id = "ws-reject-css";
    css.textContent = `
  .hidden{display:none}
  .ws-modal{position:fixed;inset:0;z-index:11000}
  .ws-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.45)}
  .ws-dialog{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#fff;border-radius:12px;
    box-shadow:0 20px 50px rgba(0,0,0,.25);width:min(92vw,640px);overflow:hidden}
  /* NEW: ensure children include padding/border in width calc */
  .ws-dialog, .ws-dialog * { box-sizing: border-box; }  /* <-- add this */

  .ws-header,.ws-footer{display:flex;align-items:center;justify-content:space-between;gap:.5rem;border-color:#eee}
  .ws-header{padding:12px 16px;border-bottom:1px solid #eee}
  .ws-footer{padding:12px 16px;border-top:1px solid #eee}
  .ws-body{padding:16px}
  .ws-title{margin:0;font-size:16px;font-weight:600}
  .ws-input{border:1px solid #cfd4dc;border-radius:8px;padding:10px 12px;width:100%;font:inherit;line-height:1.4}
  .ws-input:focus{outline:2px solid #6aa2ff; outline-offset:0}
  .ws-close{border:none;background:transparent;cursor:pointer;font-size:18px;line-height:1}
  .ws-label{display:block;font-size:14px;font-weight:600;margin:12px 0 6px}
  .ws-hint{color:#666; font-size:14px; margin:0 0 8px}
  .ws-error{color:#b00020;margin-top:6px}
  .ws-btn{border-radius:8px;padding:8px 14px;font-weight:500;cursor:pointer}
  .ws-btn--ghost{background:#fff;border:1px solid #ccc;color:#444}
  .ws-btn--ghost:hover{border-color:#999;color:#000}
  .ws-btn--danger{background:#b00020;color:#fff;border:none}
  .ws-btn--danger:hover{background:#d32f2f}
  @media (prefers-reduced-motion:no-preference){
    .ws-dialog{animation:ws-pop .12s ease-out}
    @keyframes ws-pop{from{transform:translate(-50%,-48%) scale(.98);opacity:.4}to{transform:translate(-50%,-50%) scale(1);opacity:1}}
  }
`;

    document.head.appendChild(css);
  }

  // ---------- Modal markup (injected once) ----------
  const modalHtml = `
    <div id="rejectModal" class="ws-modal hidden" role="dialog" aria-modal="true" aria-labelledby="rejectTitle">
      <div class="ws-backdrop" data-close="1"></div>
      <div class="ws-dialog">
        <div class="ws-header">
          <h3 id="rejectTitle" class="ws-title">Reject Withdrawal</h3>
          <button type="button" class="ws-close" aria-label="Close" data-close="1">✕</button>
        </div>
        <form class="ws-form">
          <div class="ws-body">
            <input type="hidden" name="withdrawalId" />
            <p class="ws-hint">Please enter a reason. The user will be notified.</p>

            <label class="ws-label" for="rejectNote">Reason</label>
            <textarea id="rejectNote" name="note" rows="4" class="ws-input"
              placeholder="e.g. IBAN mismatch, failed KYC, etc."></textarea>

            <div class="ws-error hidden" aria-live="polite"></div>
          </div>
          <div class="ws-footer" style="justify-content:flex-end;gap:8px;">
            <button type="button" class="ws-cancel ws-btn ws-btn--ghost" data-close="1">Cancel</button>
            <button type="submit" class="ws-submit ws-btn ws-btn--danger">Reject</button>
          </div>
        </form>
      </div>
    </div>
  `.trim();

  const host = document.createElement("div");
  host.innerHTML = modalHtml;
  document.body.appendChild(host);

  // ---------- Elements ----------
  const modal     = document.getElementById("rejectModal");
  const form      = modal.querySelector(".ws-form");
  const inputId   = modal.querySelector('input[name="withdrawalId"]');
  const inputNote = modal.querySelector('textarea[name="note"]');
  const errBox    = modal.querySelector(".ws-error");

// ─────────────────────────────────────────────
// admin-loyalty-reject.js
// ─────────────────────────────────────────────
async function rejectWithdrawal(id) {
const note = `Withdrawal #${id} rejected`;
try {
const res = await fetch(`/api/admin/loyalty/withdrawals/${id}/reject`, {
method: "PATCH",
headers: { "Content-Type": "application/json" },
credentials: "include",
body: JSON.stringify({ note, notification: note })
});
const data = await res.json();
if (data.success) {
alert(`❌ ${note}`);
localStorage.setItem("loyaltyUpdatedAt", Date.now());
window.dispatchEvent(new CustomEvent("loyalty:save-success", {
detail: { action: "reject", id }
}));
} else {
console.error(data);
alert("Error rejecting withdrawal");
}
} catch (err) {
console.error(err);
alert("Network error");
}
}

  // ---------- Modal controls ----------
  function escHandler(e) { if (e.key === "Escape") { e.preventDefault(); hide(); } }

  function show(id) {
    inputId.value = id || "";
    inputNote.value = "";
    errBox.textContent = "";
    errBox.classList.add("hidden");
    modal.classList.remove("hidden");
    // focus text area on next microtask
    setTimeout(() => inputNote.focus(), 0);
    document.addEventListener("keydown", escHandler, true);
  }

  function hide() {
    modal.classList.add("hidden");
    document.removeEventListener("keydown", escHandler, true);
  }

  // close with backdrop, Cancel, header X
  modal.addEventListener("click", (e) => {
    if (e.target && e.target.dataset && e.target.dataset.close === "1") {
      hide();
    }
  });

  // ---------- Helpers ----------
  function getIdFrom(el) {
    if (!el) return null;
    if (el.dataset && el.dataset.id) return el.dataset.id;
    const wrap = el.closest(".ws-actions");
    if (wrap && wrap.dataset && wrap.dataset.id) return wrap.dataset.id;
    const tr = el.closest("tr");
    if (tr && tr.dataset && tr.dataset.id) return tr.dataset.id;
    return null;
  }

  function emitRefreshSignals() {
    try {
      // trigger other tabs / windows to refresh
      localStorage.setItem("loyaltyUpdatedAt", String(Date.now()));
      window.postMessage({ type: "loyalty-updated" }, "*");
      // also try a custom event consumers may listen for
      window.dispatchEvent(new CustomEvent("loyalty:save-success", {
        detail: { action: "reject" }
      }));
    } catch (_) {}
  }

  function showError(msg) {
    errBox.textContent = msg || "An error occurred.";
    errBox.classList.remove("hidden");
    window.dispatchEvent(new CustomEvent("loyalty:save-error", {
      detail: { action: "reject", message: msg || "Unknown error" }
    }));
  }

  // ---------- Open modal on any .btn-reject (delegated, capture to beat other listeners) ----------
  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".btn-reject");
    if (!btn) return;

    // prevent other reject handlers (e.g., an immediate PATCH in admin-loyalty.js)
    ev.preventDefault();
    ev.stopPropagation();

    // Hide the floating Actions popover if open
    if (window.wsCloseActionsMenu) {
      try { window.wsCloseActionsMenu(); } catch(_) {}
    } else {
      // best-effort fallback
      document.querySelectorAll(".actions-menu").forEach(el => el.classList.add("hidden"));
    }

    const id = getIdFrom(btn);
    if (!id) {
      showError("Missing withdrawal id.");
      return;
    }

    // ensure dataset.id present even if coming from cloned menu
    btn.dataset.id = id;

    show(id);
  }, true);

  // ---------- Submit form ----------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = (inputId.value || "").trim();
    const note = (inputNote.value || "").trim();

    const submitBtn = form.querySelector(".ws-submit");
    submitBtn.disabled = true;
    errBox.classList.add("hidden");
    errBox.textContent = "";

    try {
      await patchReject(id, note);
      hide();
      emitRefreshSignals();
    } catch (err) {
      showError(err?.message || "Failed to reject withdrawal.");
    } finally {
      submitBtn.disabled = false;
    }
  });

})();
