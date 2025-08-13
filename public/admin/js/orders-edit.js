/* public/admin/js/orders-edit.js — full drop‑in (6.4 drawer restored + 6.5 hardening)
   - Exposes window.openEditOrder(order)
   - GET /api/admin/users?type=Driver&q=...  (credentials: include)
   - PATCH /api/admin/orders/:id             (credentials: include)
   - After save: dispatch 'orders:updated' + optional inline row refresh
*/
(() => {
  const ALLOWED = ["Pending","Confirmed","Dispatched","Delivered","Closed","Cancelled"];

  // --- Drawer DOM (auto-create if missing) ---
  let drawer, frm, selStatus, inpDriver, hidDriverId, taNotes, btnSave, btnCancel, listBox;
  function ensureDrawer() {
    if (drawer) return;

    const html = `
      <div id="ws-edit-drawer" class="ws-edit fixed inset-0 z-50 hidden">
        <div class="ws-edit__backdrop absolute inset-0" style="background:rgba(0,0,0,0.45)"></div>
        <div class="ws-edit__panel absolute right-0 top-0 h-full w-[420px] bg-white shadow-xl p-4 overflow-y-auto">
          <h3 class="text-lg font-semibold mb-3">Edit Order</h3>
          <form class="space-y-3" autocomplete="off">
            <div>
              <label class="block text-sm mb-1">Status</label>
              <select class="w-full border rounded px-2 py-1" name="status"></select>
            </div>
            <div>
              <label class="block text-sm mb-1">Driver</label>
              <input class="w-full border rounded px-2 py-1" name="driverName" placeholder="Type to search driver…" />
              <input type="hidden" name="driverId" />
              <div class="mt-1 border rounded hidden" data-driver-list></div>
            </div>
            <div>
              <label class="block text-sm mb-1">Notes</label>
              <textarea class="w-full border rounded px-2 py-1" name="notes" rows="3" placeholder="Optional"></textarea>
            </div>
            <div class="flex gap-2 pt-2">
              <button type="button" class="btn-cancel border px-3 py-1 rounded">Cancel</button>
              <button type="submit" class="btn-save bg-black text-white px-3 py-1 rounded disabled:opacity-50" disabled>Save</button>
            </div>
          </form>
        </div>
      </div>
    `;
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    document.body.appendChild(wrap);

    drawer     = document.getElementById("ws-edit-drawer");
    frm        = drawer.querySelector("form");
    selStatus  = frm.querySelector('select[name="status"]');
    inpDriver  = frm.querySelector('input[name="driverName"]');
    hidDriverId= frm.querySelector('input[name="driverId"]');
    taNotes    = frm.querySelector('textarea[name="notes"]');
    btnSave    = frm.querySelector(".btn-save");
    btnCancel  = frm.querySelector(".btn-cancel");
    listBox    = frm.querySelector('[data-driver-list]');

    // Build statuses
    selStatus.innerHTML = ALLOWED.map(s => `<option value="${s}">${s}</option>`).join("");

    // Events
    drawer.querySelector(".ws-edit__backdrop").addEventListener("click", close);
    btnCancel.addEventListener("click", (e) => { e.preventDefault(); close(); });
    frm.addEventListener("submit", onSave);

    // Driver live search
    let t = null, lastQ = "";
    inpDriver.addEventListener("input", () => {
      const q = (inpDriver.value || "").trim();
      if (q === lastQ) return;
      lastQ = q;
      hidDriverId.value = "";      // clear id if user started typing again
      btnSave.disabled = false;    // allow save even without driver
      if (t) clearTimeout(t);
      if (!q) { listBox.classList.add("hidden"); listBox.innerHTML = ""; return; }
      t = setTimeout(() => searchDrivers(q), 220);
    });
  }

  function open()  { ensureDrawer(); drawer.classList.remove("hidden"); }
  function close() { drawer.classList.add("hidden"); listBox.classList.add("hidden"); listBox.innerHTML = ""; }

  // --- State for edit session ---
  const EditState = { orderId: null };

  // Public API
  window.openEditOrder = function(order) {
    ensureDrawer();
    EditState.orderId = order.id ?? order.orderNumber ?? String(order._id || "");
    // Prefill
    selStatus.value = ALLOWED.includes(order.status) ? order.status : "Pending";
    taNotes.value = order.notes || "";
    // Driver fields (fallbacks)
    const dn = order.driverName || order.driver || "";
    const did = order.driverId || order.driver_id || "";
    inpDriver.value = dn;
    hidDriverId.value = did;
    btnSave.disabled = false;
    open();
  };

  // --- Driver live query ---
  async function searchDrivers(q) {
    try {
      listBox.innerHTML = `<div class="px-2 py-1 text-sm opacity-70">Searching…</div>`;
      listBox.classList.remove("hidden");
      const res = await fetch(`/api/admin/users?type=Driver&q=${encodeURIComponent(q)}`, {
        credentials: "include"
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const rows = (json.users || json.data || json || []).slice(0, 10);

      if (!rows.length) {
        listBox.innerHTML = `<div class="px-2 py-1 text-sm opacity-70">No drivers found</div>`;
        return;
      }

      listBox.innerHTML = rows.map(u => `
        <button type="button" data-id="${u.id}" data-name="${u.name || u.fullName || u.email || u.phone || "Driver"}"
          class="w-full text-left px-2 py-1 hover:bg-gray-100">
          ${(u.name || u.fullName || "Driver")} <span class="opacity-60 text-xs">${u.email || ""} ${u.phone || ""}</span>
        </button>
      `).join("");

      // pick
      listBox.querySelectorAll("button").forEach(b => {
        b.addEventListener("click", () => {
          hidDriverId.value = b.getAttribute("data-id");
          inpDriver.value = b.getAttribute("data-name");
          listBox.classList.add("hidden");
          listBox.innerHTML = "";
        });
      });
    } catch (err) {
      listBox.innerHTML = `<div class="px-2 py-1 text-sm text-red-600">Driver lookup failed</div>`;
      console.warn("[orders-edit] driver search error", err);
    }
  }

  // --- Save ---
  async function onSave(e) {
    e.preventDefault();
    if (!EditState.orderId) return;

    const out = {
      status: selStatus.value,
      driverId: hidDriverId.value || null,
      notes: (taNotes.value || "").trim()
    };

    // Basic validation: block invalid statuses
    if (!ALLOWED.includes(out.status)) {
      alert("Invalid status");
      return;
    }

    btnSave.disabled = true;

    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(EditState.orderId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(out)
      });

      if (res.status === 403) {
        alert("Admin only");
        btnSave.disabled = false;
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Notify other modules + tabs
      window.dispatchEvent(new CustomEvent("orders:updated", {
        detail: { id: EditState.orderId, patch: out }
      }));
      try { localStorage.setItem("ordersUpdatedAt", String(Date.now())); } catch {}

      // Inline row refresh if helper exists
      try {
        if (window.AdminOrders?.updateRowInline) {
          window.AdminOrders.updateRowInline(EditState.orderId, out);
        }
      } catch (err) { console.warn("updateRowInline failed:", err); }

      close();
    } catch (err) {
      console.error("[orders-edit] save error:", err);
      alert("Save failed");
      btnSave.disabled = false;
    }
  }
})();
