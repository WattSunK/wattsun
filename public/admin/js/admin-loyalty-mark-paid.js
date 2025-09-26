/**
 * Admin — Withdrawals: Mark Paid modal + binder (robust, with hard refresh)
 */
(function () {
  "use strict";

  // ---------- Modal markup ----------
  const html = `
    <div id="paidModal" class="ws-modal hidden fixed inset-0 z-50">
      <div class="ws-backdrop absolute inset-0 bg-black/50"></div>
      <div class="ws-dialog absolute left-50% top-50% -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl w-[min(92vw,560px)]">
        <div class="ws-header px-4 py-3 border-b flex items-center justify-between">
          <h3 class="text-base font-semibold">Mark Withdrawal as Paid</h3>
          <button type="button" class="ws-close px-2 py-1 text-gray-500 hover:text-gray-800" aria-label="Close">✕</button>
        </div>
        <form class="ws-form">
          <div class="ws-body p-4 space-y-3">
            <input type="hidden" name="withdrawalId" />
            <label class="block">
              <span class="block text-sm font-medium mb-1">Payment reference</span>
              <input name="payoutRef" type="text" class="ws-input block w-full border rounded-md px-3 py-2 focus:outline-none focus:ring" placeholder="e.g. TX-ABC-123" />
            </label>
            <label class="block">
              <span class="block text-sm font-medium mb-1">Paid date</span>
              <input name="paidAt" type="datetime-local" class="ws-input block w-full border rounded-md px-3 py-2 focus:outline-none focus:ring" />
            </label>
            <div class="ws-error text-sm text-red-600 hidden"></div>
          </div>
          <div class="ws-footer px-4 py-3 border-t flex justify-end gap-2">
            <button type="button" class="ws-cancel px-4 py-2 rounded-md border bg-white hover:bg-gray-50">Cancel</button>
            <button type="submit" class="ws-submit px-4 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60">Mark Paid</button>
          </div>
        </form>
      </div>
    </div>
  `.trim();

  const mount = document.createElement("div");
  mount.innerHTML = html;
  document.body.appendChild(mount);

  const modal   = document.getElementById("paidModal");
  const form    = modal.querySelector(".ws-form");
  const idInp   = modal.querySelector('input[name="withdrawalId"]');
  const refInp  = modal.querySelector('input[name="payoutRef"]');
  const dateInp = modal.querySelector('input[name="paidAt"]');
  const errBox  = modal.querySelector(".ws-error");
  const btnSub  = modal.querySelector(".ws-submit");
  const btnCls  = modal.querySelector(".ws-close");
  const btnCan  = modal.querySelector(".ws-cancel");
  const back    = modal.querySelector(".ws-backdrop");

  function nowLocalISO() {
    const d = new Date();
    d.setSeconds(0,0);
    const p = (n)=> String(n).padStart(2,"0");
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function show(id) {
    idInp.value = id || "";
    refInp.value = "";
    dateInp.value = nowLocalISO();
    errBox.textContent = ""; errBox.classList.add("hidden");
    modal.classList.remove("hidden");
    setTimeout(()=> refInp.focus(), 0);
    document.addEventListener("keydown", esc, true);
  }
  function hide(){ modal.classList.add("hidden"); document.removeEventListener("keydown", esc, true); }
  function esc(e){ if (e.key==="Escape") { e.preventDefault(); hide(); } }
  [btnCls, btnCan, back].forEach(el => el && el.addEventListener("click", hide));

  function getIdFrom(el){
    if (!el) return null;
    if (el.dataset?.id) return el.dataset.id;
    const wrap = el.closest(".ws-actions"); if (wrap?.dataset?.id) return wrap.dataset.id;
    const tr = el.closest("tr"); if (tr?.dataset?.id) return tr.dataset.id;
    return null;
  }

  // Open modal on any .btn-mark-paid (delegated; capture to beat menu auto-close)
  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".btn-mark-paid");
    if (!btn) return;
    const id = getIdFrom(btn);
    if (!id) {
      window.dispatchEvent(new CustomEvent("loyalty:save-error", { detail:{ action:"mark-paid", message:"Missing withdrawal id" } }));
      return;
    }
    btn.dataset.id = id;
    show(id);
  }, true);

  async function patchMarkPaid(id, payload){
    const resp = await fetch(`/api/admin/loyalty/withdrawals/${encodeURIComponent(id)}/mark-paid`, {
      method:"PATCH",
      headers:{ "Content-Type":"application/json" },
      credentials:"include",
      body: JSON.stringify(payload)
    });
    const data = await resp.json().catch(()=> ({}));
    if (!resp.ok || data?.success === false) {
      const msg = data?.error?.message || `HTTP ${resp.status}`;
      throw new Error(msg);
    }
    return data;
  }

  // Submit -> PATCH /mark-paid + hard refreshes
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = idInp.value.trim();
    const payoutRef = refInp.value.trim() || null;
    const paidAt = dateInp.value ? new Date(dateInp.value).toISOString() : new Date().toISOString();

    btnSub.disabled = true;
    errBox.classList.add("hidden"); errBox.textContent = "";

    try{
      const data = await patchMarkPaid(id, { payoutRef, paidAt });

      // emit global success (your admin-loyalty.js already refreshes active tab)
      window.dispatchEvent(new CustomEvent("loyalty:save-success", {
        detail: { action:"mark-paid", id, data }
      }));

      // force background refreshes for safety (even if some listener is missing)
      try {
        const api = window.loyaltyAdmin || {};
        // Always reload current list (Withdrawals)
        api.loadWithdrawals && api.loadWithdrawals({ resetPage:false });

        // Respect server hint, else refresh all three
        const r = data?.refresh || {};
        if (r.accounts && api.loadAccounts)      api.loadAccounts({ resetPage:false });
        if (r.ledger   && api.loadLedger)        api.loadLedger();
        if (r.notifications && api.loadNotifications) api.loadNotifications();

        // If no hints present, refresh all anyway
        if (!("refresh" in data)) {
          api.loadAccounts && api.loadAccounts({ resetPage:false });
          api.loadLedger && api.loadLedger();
          api.loadNotifications && api.loadNotifications();
        }
      } catch {}

      hide();
    }catch(err){
      errBox.textContent = err?.message || "Unknown error";
      errBox.classList.remove("hidden");
      window.dispatchEvent(new CustomEvent("loyalty:save-error", {
        detail: { action:"mark-paid", id: idInp.value.trim(), message: err?.message || "Mark Paid failed" }
      }));
    }finally{
      btnSub.disabled = false;
    }
  });
})();
