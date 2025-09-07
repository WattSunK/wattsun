// public/admin/js/orders-edit.js
// Overlay-aware Orders Edit script

(function OrdersEditModule() {
  "use strict";

  const ALLOWED_STATUSES = ["Pending", "Confirmed", "Dispatched", "Delivered", "Closed", "Cancelled"];

  const dlg      = document.getElementById("orderEditDialog");
  const btnSave  = document.getElementById("editSaveBtn");
  const btnCancel= document.getElementById("cancelEditBtn");
  const selStatus= document.getElementById("editStatus");
  const selDriver= document.getElementById("editDriver");
  const txtNotes = document.getElementById("editNotes");

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

  async function loadDrivers(selectedId) {
    selDriver.innerHTML = `<option value="">— None —</option>`;
    try {
      const r = await fetch(`/api/admin/users?type=Driver`, { credentials: "include" });
      const j = await r.json().catch(() => ({}));
      const users = Array.isArray(j?.users) ? j.users : [];
      for (const u of users) {
        const opt = document.createElement("option");
        opt.value = String(u.id);
        opt.textContent = u.name || u.fullName || u.email || `Driver #${u.id}`;
        selDriver.appendChild(opt);
      }
      if (selectedId != null && selectedId !== "") selDriver.value = String(selectedId);
    } catch (e) { console.warn("[orders-edit] failed to load drivers", e); }
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

  async function openFor(id) {
    if (!id) return;
    currentId = id;
    buildStatusOptions("Pending");
    txtNotes.value = "";
    selDriver.value = "";
    openDialog();
    try {
      const o = await apiGetOrder(id);
      initial = { status: o.status || o.originalStatus || "Pending", driverId: o.driverId ?? "", notes: o.notes || "" };
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
    const driverId = selDriver.value ? parseInt(selDriver.value, 10) : null;
    const notes    = (txtNotes.value || "").trim();
    if (!ALLOWED_STATUSES.includes(status)) return toast("Please select a valid status.", "error");
    const payload = { status };
    if (driverId !== null && Number.isInteger(driverId)) payload.driverId = driverId;
    if (notes !== initial.notes) payload.notes = notes;
    if (Object.keys(payload).length === 1 && status === initial.status) { closeDialog(); return; }
    setSaving(true);
    try {
      await apiPatchOrder(currentId, payload);
      if (typeof window.refreshOrderRow === "function") window.refreshOrderRow(currentId, { status });
      closeDialog();
      toast("Order updated.", "success");
    } catch (e) {
      console.error("[orders-edit] save failed", e);
      toast("Failed to save changes.", "error");
    } finally { setSaving(false); }
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
