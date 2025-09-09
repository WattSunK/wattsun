// public/admin/js/orders-edit.js
// Overlay-aware Orders Edit script

(function OrdersEditModule() {
  "use strict";

  const ALLOWED_STATUSES = ["Pending", "Confirmed", "Dispatched", "Delivered", "Closed", "Cancelled"];

const dlg       = document.getElementById("orderEditModal") || document.getElementById("orderEditDialog");
const btnSave   = document.getElementById("orderSaveBtn")   || document.getElementById("editSaveBtn");
const btnCancel = document.getElementById("orderCancelBtn") || document.getElementById("cancelEditBtn");
const selStatus = document.getElementById("orderStatus")    || document.getElementById("editStatus");
const selDriver = document.getElementById("orderDriver")    || document.getElementById("editDriver");
const txtNotes  = document.getElementById("orderNotes")     || document.getElementById("editNotes");


  if (!dlg || !btnSave || !btnCancel || !selStatus || !selDriver || !txtNotes) {
    console.warn("[orders-edit] Missing expected modal elements; skipping binder.");
    return;
  }

  let currentId = null;
  let initial = { status: "Pending", driverId: null, notes: "" };

  const toast = (msg, type="info") => (window.toast ? window.toast(msg, type) : alert(msg));

  function setSaving(on) {
    btnSave.disabled = !!on;
    btnSave.textContent = on ? "Saving…" : "Save";
  }

  function openDialog() { try { dlg.showModal(); } catch { dlg.setAttribute("open","true"); } }
  function closeDialog(){ try { dlg.close(); } catch { dlg.removeAttribute("open"); } }

  function buildStatusOptions(current) {
    selStatus.innerHTML = "";
    for (const s of ALLOWED_STATUSES) {
      const opt = document.createElement("option");
      opt.value = s; opt.textContent = s;
      selStatus.appendChild(opt);
    }
    selStatus.value = ALLOWED_STATUSES.includes(current) ? current : "Pending";
  }

    async function apiGetOrder(id) {
    const r = await fetch(`/api/admin/orders/${encodeURIComponent(id)}`, { credentials: "include" });
    if (!r.ok) throw new Error(`GET failed: ${r.status}`);
    const j = await r.json();
    if (!j?.success || !j.order) throw new Error("Malformed response");
    return j.order;
  }

  async function apiPatchOrder(id, payload) {
    const r = await fetch(`/api/admin/orders/${encodeURIComponent(id)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error(`PATCH failed: ${r.status}`);
    const j = await r.json();
    if (!j?.success) throw new Error("Save failed");
    return j.order || payload;
  }
// --- Drivers cache + loader (5 min cache)
let _driversCache = null, _driversAt = 0;

async function loadDrivers(selectedId) {
  if (!selDriver) return;
  selDriver.innerHTML = `<option value="">— Select driver —</option>`;
  const now = Date.now();
  if (_driversCache && (now - _driversAt) < 5 * 60 * 1000) {
    return renderDrivers(_driversCache, selectedId);
  }
  try {
    const r = await fetch(`/api/admin/users?type=Driver&page=1&per=1000`, { credentials: "include" });
    if (!r.ok) throw new Error(`Drivers fetch failed: ${r.status}`);
    const j = await r.json();
    const users = Array.isArray(j?.users) ? j.users : [];
    _driversCache = users; _driversAt = now;
    renderDrivers(users, selectedId);
  } catch (e) {
    console.error("[orders-edit] loadDrivers", e);
    selDriver.innerHTML = `<option value="">(No drivers found)</option>`;
  }
}
function renderDrivers(users, selectedId) {
  selDriver.innerHTML = `<option value="">— Select driver —</option>` +
    users.map(u => `<option value="${u.id}" ${Number(u.id)===Number(selectedId)?"selected":""}>${u.name || u.email || `Driver #${u.id}`} ${u.phone?`(${u.phone})`:""}</option>`).join("");
}

  async function openFor(id) {
    if (!id) return;
    currentId = id;
    buildStatusOptions("Pending");
    txtNotes.value = "";
    selDriver.value = "";
    openDialog();
    try {
      const o = await apiGetOrder(id);
      initial = {
  status: o.status || o.originalStatus || "Pending",
  driverId: (o.driverId ?? o.driver_id ?? null),
  notes: o.notes || ""
};

      buildStatusOptions(initial.status);
      txtNotes.value = initial.notes;
      await loadDrivers(initial.driverId);
    } catch (e) {
      console.error("[orders-edit] load failed", e);
      toast("Failed to load order.", "error");
      closeDialog();
    }
  }

  async function doSave() {
  if (!currentId) return;

  const status   = selStatus.value;
  const notes    = (txtNotes.value || "").trim();
  const selected = selDriver.value;
  const driverId = selected ? Number.parseInt(selected, 10) : null;

  // build minimal PATCH from diffs
  const payload = {};

  if (ALLOWED_STATUSES.includes(status) && status !== initial.status) {
    payload.status = status;
  }

  // send driverId whenever it changed (including clearing to null)
  if (driverId !== (initial.driverId ?? null)) {
    if (driverId !== null && !Number.isInteger(driverId)) {
      return toast("Invalid driver selection.", "error");
    }
    payload.driverId = driverId; // allow null to clear
  }

  if (notes !== initial.notes) {
    payload.notes = notes;
  }

  // nothing changed? just close
  if (!Object.keys(payload).length) { closeDialog(); return; }

  setSaving(true);
  try {
    await apiPatchOrder(currentId, payload);

    // refresh row with everything that changed (not just status)
    if (typeof window.refreshOrderRow === "function") {
      window.refreshOrderRow(currentId, payload);
    }

    // lightweight cross-tab/update signal
    try { localStorage.setItem("ordersUpdatedAt", new Date().toISOString()); } catch {}
    try { window.postMessage({ type: "orders-updated", id: currentId }, window.origin || "*"); } catch {}

    toast("Order updated.", "success");
    closeDialog();
  } catch (e) {
    console.error("[orders-edit] save failed", e);
    toast("Failed to save changes.", "error");
  } finally {
    setSaving(false);
  }
}
  btnCancel.addEventListener("click", (e) => { e.preventDefault(); closeDialog(); });
  btnSave.addEventListener("click",   (e) => { e.preventDefault(); doSave(); });

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-edit[data-oid], [data-action='edit-order'][data-oid]");
    if (!btn) return;
    e.preventDefault();
    const id = btn.getAttribute("data-oid");
    openFor(id);
  });

  window.addEventListener("orders:edit", (e) => {
    const id = e?.detail?.id;
    if (id) openFor(id);
  });
})();
