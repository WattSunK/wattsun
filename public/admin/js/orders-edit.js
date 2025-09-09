// public/admin/js/orders-edit.js (surgically patched)
// Goal: keep your existing structure/IDs, add Drivers API wiring, proper diff-based PATCH,
//       and optional money overlay support without removing your code paths.

(function OrdersEditModule() {
  "use strict";

  // Keep in sync with backend-allowed statuses
  const ALLOWED_STATUSES = [
    "Pending",
    "Confirmed",
    "Dispatched",
    "Delivered",
    "Closed",
    "Cancelled"
  ];

  // --- Elements (preserve your original IDs; add safe fallbacks)
  const dlg  = document.getElementById("orderEditModal")
            || document.getElementById("ordersEditModal");
  const form = document.getElementById("orderEditForm")
            || document.getElementById("ordersEditForm")
            || (dlg && dlg.querySelector("form"));
  const btnSave   = document.getElementById("orderSaveBtn")   || document.getElementById("editSaveBtn");
  const btnCancel = document.getElementById("orderCancelBtn") || document.getElementById("cancelEditBtn");
  const lblId     = document.getElementById("oemOrderId")     || document.getElementById("orderEditId");

  const selStatus = document.getElementById("orderStatus")    || document.getElementById("editStatus");
  const selDriver = document.getElementById("orderDriver")    || document.getElementById("editDriver");
  const txtNotes  = document.getElementById("orderNotes")     || document.getElementById("editNotes");

  // Optional overlay inputs (only used if present in your modal)
  const inpTotalCents   = document.getElementById("editTotalCents")   || document.getElementById("totalCents")   || null;
  const inpDepositCents = document.getElementById("editDepositCents") || document.getElementById("depositCents") || null;
  const inpCurrency     = document.getElementById("editCurrency")     || document.getElementById("currency")     || null;

  if (!dlg || !form || !btnSave || !btnCancel || !selStatus || !selDriver || !txtNotes) {
    console.warn("[orders-edit] Modal elements missing; binder aborted.");
    return;
  }

  // --- Small helpers (kept lightweight to avoid changing your UX kit)
  const toast = (msg, type = "info") => (window.toast ? window.toast(msg, type) : alert(msg));
  const openDialog  = () => { try { dlg.showModal(); } catch { dlg.setAttribute("open", "true"); } };
  const closeDialog = () => { try { dlg.close(); }      catch { dlg.removeAttribute("open"); } };
  const setSaving   = (on) => { btnSave.disabled = !!on; btnSave.textContent = on ? "Saving…" : "Save"; };

  function buildStatusOptions(current) {
    selStatus.innerHTML = "";
    for (const s of ALLOWED_STATUSES) {
      const opt = document.createElement("option");
      opt.value = s; opt.textContent = s; selStatus.appendChild(opt);
    }
    selStatus.value = ALLOWED_STATUSES.includes(current) ? current : "Pending";
  }

  // --- Drivers cache (avoid repeat fetches while paging orders)
  let _driversCache = null; let _driversAt = 0;
  async function loadDrivers(selectedId) {
    if (!selDriver) return;
    selDriver.innerHTML = `<option value="">— Select driver —</option>`;

    const now = Date.now();
    if (_driversCache && (now - _driversAt) < 5 * 60 * 1000) {
      renderDrivers(_driversCache, selectedId); return;
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

  // --- API calls (unchanged endpoints)
  async function apiGetOrder(id) {
    const r = await fetch(`/api/admin/orders/${encodeURIComponent(id)}`, { credentials: "include" });
    if (!r.ok) throw new Error(`GET /orders/${id} failed: ${r.status}`);
    const j = await r.json();
    if (!j?.success || !j.order) throw new Error("Malformed order response");
    return j.order;
  }
  async function apiPatchOrder(id, payload) {
    const r = await fetch(`/api/admin/orders/${encodeURIComponent(id)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error(`PATCH /orders/${id} failed: ${r.status}`);
    const j = await r.json();
    if (!j?.success) throw new Error("Save failed");
    return j.order || payload;
  }

  // --- State (for change detection)
  let currentId = null;
  let initial = { status: "Pending", driverId: null, notes: "", totalCents: null, depositCents: null, currency: null };

  async function openFor(id) {
    if (!id) return;
    currentId = id;
    if (lblId) lblId.textContent = id;

    // default UI
    buildStatusOptions("Pending");
    selDriver.innerHTML = `<option value="">— Select driver —</option>`;
    txtNotes.value = "";
    if (inpTotalCents)   inpTotalCents.value = "";
    if (inpDepositCents) inpDepositCents.value = "";
    if (inpCurrency)     inpCurrency.value = "";

    openDialog();

    try {
      const o = await apiGetOrder(id);
      // accept various field names (overlay merged on backend)
      const status       = o.status || o.originalStatus || "Pending";
      const driverId     = (o.driverId ?? o.driver_id ?? null);
      const notes        = o.notes || "";
      const totalCents   = (o.totalCents   != null) ? Number(o.totalCents)   : "";
      const depositCents = (o.depositCents != null) ? Number(o.depositCents) : "";
      const currency     = o.currency || "";

      initial = { status, driverId, notes, totalCents, depositCents, currency };

      buildStatusOptions(status);
      txtNotes.value = notes;
      if (inpTotalCents)   inpTotalCents.value   = totalCents === "" ? "" : String(totalCents);
      if (inpDepositCents) inpDepositCents.value = depositCents === "" ? "" : String(depositCents);
      if (inpCurrency)     inpCurrency.value     = currency || "";

      await loadDrivers(driverId);
    } catch (e) {
      console.error("[orders-edit] load order failed", e);
      toast("Failed to load order.", "error");
      closeDialog();
    }
  }

  function buildPayloadFromChanges() {
    const status   = selStatus.value;
    const driverId = selDriver.value ? Number(selDriver.value) : null;
    const notes    = (txtNotes.value || "").trim();

    const payload = {};

    if (ALLOWED_STATUSES.includes(status) && status !== initial.status) payload.status = status;
    if (driverId !== (initial.driverId ?? null)) payload.driverId = driverId; // allow null to clear
    if (notes !== initial.notes) payload.notes = notes;

    // Optional money/currency overlay (only if inputs exist)
    if (inpTotalCents) {
      const totalRaw = inpTotalCents.value;
      const totalVal = totalRaw === "" ? null : Number.parseInt(totalRaw, 10);
      if (Number.isInteger(totalVal) && totalVal !== initial.totalCents) payload.totalCents = totalVal;
    }
    if (inpDepositCents) {
      const depRaw = inpDepositCents.value;
      const depVal = depRaw === "" ? null : Number.parseInt(depRaw, 10);
      if (Number.isInteger(depVal) && depVal !== initial.depositCents) payload.depositCents = depVal;
    }
    if (inpCurrency) {
      const curRaw = (inpCurrency.value || "").trim();
      const curVal = curRaw === "" ? null : curRaw.toUpperCase();
      if (curVal !== (initial.currency || null)) payload.currency = curVal;
    }

    return payload;
  }

  async function doSave() {
    if (!currentId) return;

    const payload = buildPayloadFromChanges();

    // nothing changed? just close
    if (!Object.keys(payload).length) { closeDialog(); return; }

    setSaving(true);
    try {
      await apiPatchOrder(currentId, payload);

      // optimistic row refresh with everything that changed
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

  // --- Bindings (preserve your triggers)
  btnCancel.addEventListener("click", (e) => { e.preventDefault(); closeDialog(); });
  form.addEventListener("submit", (e) => { e.preventDefault(); doSave(); });

  // Open via Edit button in table
  document.addEventListener("click", (e) => {
    const btn = e.target.closest('.btn-edit[data-oid], [data-action="edit-order"][data-oid]');
    if (!btn) return;
    e.preventDefault();
    const id = btn.getAttribute("data-oid");
    openFor(id);
  });

  // Programmatic open
  window.addEventListener("orders:edit", (e) => {
    const id = e?.detail?.id; if (id) openFor(id);
  });
})();
