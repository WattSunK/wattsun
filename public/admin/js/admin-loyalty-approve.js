/**
 * Admin — Withdrawals: Approve binder (robust delegation)
 * Listens at document level for clicks on .btn-approve and PATCHes the backend.
 * Emits loyalty:save-success / loyalty:save-error for global toasts + refresh.
 */
(function () {
  "use strict";

  // Resolve withdrawal id from various DOM shapes
  function getIdFrom(el) {
    if (!el) return null;
    if (el.dataset && el.dataset.id) return el.dataset.id;
    const wrap = el.closest(".ws-actions");
    if (wrap && wrap.dataset && wrap.dataset.id) return wrap.dataset.id;
    const tr = el.closest("tr");
    if (tr && tr.dataset && tr.dataset.id) return tr.dataset.id;
    return null;
  }

  async function approve(id) {
    const resp = await fetch(`/api/admin/loyalty/withdrawals/${encodeURIComponent(id)}/approve`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include"
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data?.success === false) {
      const msg = data?.error?.message || `HTTP ${resp.status}`;
      throw new Error(msg);
    }
    return data;
  }

  // Single, safe delegation
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".btn-approve");
    if (!btn) return;

    const id = getIdFrom(btn);
    if (!id) {
      window.dispatchEvent(new CustomEvent("loyalty:save-error", {
        detail: { action: "approve", message: "Missing withdrawal id" }
      }));
      return;
    }

    // Guard double-click
    if (btn.__busy) return;
    btn.__busy = true;
    btn.disabled = true;

    try {
      const data = await approve(id);
      window.dispatchEvent(new CustomEvent("loyalty:save-success", {
        detail: { action: "approve", id, data }
      }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent("loyalty:save-error", {
        detail: { action: "approve", id, message: err?.message || "Approve failed" }
      }));
    } finally {
      btn.__busy = false;
      btn.disabled = false;
    }
  }, true); // capture phase so we run before dropdown auto-close
})();
