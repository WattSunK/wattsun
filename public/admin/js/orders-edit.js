// public/admin/js/orders-edit.js
// Incremental upgrade: make sure the legacy Edit dialog cannot win.
// - Capture-phase click handler blocks legacy openers
// - Proactive upgrade on partial load
// - MutationObserver upgrades if a legacy modal is injected later
//
// + Non-invasive polish (20250915-06p):
//   * View modal: format money + items list (uses existing elements only)
//   * Edit modal: hover tooltips preview currency units while inputs remain in cents
//   * Lightweight orders:view handler that fetches when only an id is provided

(function OrdersEditModule() {
  "use strict";

  const BUILD_TAG = "v20250915-06p";
  console.debug(`[orders-edit] loader active ${BUILD_TAG}`);

  const ALLOWED_STATUSES = ["Pending","Confirmed","Dispatched","Delivered","Closed","Cancelled"];

  // ------------------------------------------------------------------
  // Non-invasive helpers for money formatting (UI only; save stays cents)
  // ------------------------------------------------------------------
  const DEFAULT_CURRENCY = "KES";
  const DEFAULT_LOCALE = "en-KE";

  const money = (units, currency = DEFAULT_CURRENCY, locale = DEFAULT_LOCALE) => {
    if (units == null || units === "") return "—";
    const n = Number(units);
    if (!Number.isFinite(n)) return String(units);
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  };

  const fromCents = (cents) => (cents == null || cents === "" ? null : Number(cents) / 100);

  // ---------- modal loader (upgrade legacy -> new) ----------
  async function ensureOrdersModalLoadedOnce() {
    const existing = document.getElementById("orderEditModal");

    // If modal exists, check if it's the new one (has history or is tagged)
    if (existing) {
      const hasHistory = !!existing.querySelector("#order-history");
      const isTagged   = existing.getAttribute("data-osh") === "5.7";
      if (hasHistory || isTagged) return; // already upgraded
      console.debug("[orders-edit] legacy modal detected — replacing with new modal…");
    } else {
      console.debug("[orders-edit] no modal present — injecting new modal…");
    }

    const res = await fetch("/partials/orders-modal.html?v=20250915-01", { credentials: "include" });
    if (!res.ok) throw new Error(`Failed to load orders-modal.html: ${res.status}`);
    const html = await res.text();

    const tmp = document.createElement("div");
    tmp.innerHTML = html;

    const fetchedEdit = tmp.querySelector("#orderEditModal");
    if (!fetchedEdit) throw new Error("orders-modal.html missing #orderEditModal");
    fetchedEdit.setAttribute("data-osh", "5.7");

    const fetchedView = tmp.querySelector("#orderViewModal");

    if (existing) {
      existing.replaceWith(fetchedEdit);
    } else {
      document.body.appendChild(fetchedEdit);
    }
    if (fetchedView) {
      const alreadyV = document.getElementById("orderViewModal");
      if (alreadyV) alreadyV.replaceWith(fetchedView);
      else document.body.appendChild(fetchedView);
    }

    console.debug("[orders-edit] modal injected from /partials/orders-modal.html");
  }

  // Guard: if someone injects a legacy #orderEditModal later, auto-upgrade it.
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (!(n instanceof Element)) continue;
        const edit = n.id === "orderEditModal" ? n : n.querySelector?.("#orderEditModal");
        if (edit && (!edit.querySelector("#order-history") || edit.getAttribute("data-osh") !== "5.7")) {
          ensureOrdersModalLoadedOnce().catch(console.error);
        }
      }
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // Lazily refreshed references after we inject/replace the modal
  let dlg, form, btnSave, btnCancel, lblId, selStatus, selDriver, txtNotes;
  let inpTotalCents, inpDepositCents, inpCurrency;

  function refreshRefs() {
    dlg  = document.getElementById("orderEditModal") || document.getElementById("ordersEditModal");
    form = document.getElementById("orderEditForm")
        || document.getElementById("ordersEditForm")
        || (dlg && dlg.querySelector("form"));

    btnSave   = document.getElementById("oemSave")        || document.getElementById("orderSaveBtn")   || document.getElementById("editSaveBtn");
    btnCancel = document.getElementById("oemCancel")      || document.getElementById("orderCancelBtn") || document.getElementById("cancelEditBtn");
    lblId     = document.getElementById("oemOrderId")     || document.getElementById("orderEditId");

    selStatus = document.getElementById("orderStatus")    || document.getElementById("editStatus");
    selDriver = document.getElementById("orderDriver")    || document.getElementById("editDriver");
    txtNotes  = document.getElementById("orderNotes")     || document.getElementById("editNotes");

    inpTotalCents   = document.getElementById("orderTotal")    || document.getElementById("editTotalCents")   || document.getElementById("totalCents")   || null;
    inpDepositCents = document.getElementById("orderDeposit")  || document.getElementById("editDepositCents") || document.getElementById("depositCents") || null;
    inpCurrency     = document.getElementById("orderCurrency") || document.getElementById("editCurrency")     || document.getElementById("currency")     || null;
  }

  const toast = (msg, type = "info") => (window.toast ? window.toast(msg, type) : alert(msg));
  const openDialog  = () => { try { dlg.showModal(); } catch { dlg.setAttribute("open", "true"); } };
  const closeDialog = () => { try { dlg.close(); }      catch { dlg.removeAttribute("open"); } };
  const setSaving   = (on) => { if (btnSave) { btnSave.disabled = !!on; btnSave.textContent = on ? "Saving…" : "Save"; } };

  function buildStatusOptions(current) {
    if (!selStatus) return;
    selStatus.innerHTML = "";
    for (const s of ALLOWED_STATUSES) {
      const opt = document.createElement("option");
      opt.value = s; opt.textContent = s; selStatus.appendChild(opt);
    }
    selStatus.value = ALLOWED_STATUSES.includes(current) ? current : "Pending";
  }

  // --- Drivers cache
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

  // --- API calls
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

  // --- State
  let currentId = null;
  let initial = { status: "Pending", driverId: null, notes: "", totalCents: null, depositCents: null, currency: null };

  async function openFor(id) {
    if (!id) return;

    await ensureOrdersModalLoadedOnce(); // make sure we have the new modal
    refreshRefs();

    if (!dlg || !form || !selStatus || !selDriver || !txtNotes) {
      console.warn("[orders-edit] Modal elements missing; binder aborted.");
      return;
    }

    currentId = id;
    if (lblId) lblId.textContent = id;

    buildStatusOptions("Pending");
    selDriver.innerHTML = `<option value="">— Select driver —</option>`;
    txtNotes.value = "";
    if (inpTotalCents)   inpTotalCents.value = "";
    if (inpDepositCents) inpDepositCents.value = "";
    if (inpCurrency)     inpCurrency.value = "";

    openDialog();

    try {
      const o = await apiGetOrder(id);
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

      // --- NEW: set up and refresh preview tooltips (non-invasive)
      attachEditPreviewsOnce();
      updateMoneyPreviewTitles();
    } catch (e) {
      console.error("[orders-edit] load order failed", e);
      toast("Failed to load order.", "error");
      closeDialog();
    }
  }

  function buildPayloadFromChanges() {
    const status   = selStatus ? selStatus.value : "Pending";
    const driverId = selDriver?.value ? Number(selDriver.value) : null;
    const notes    = (txtNotes?.value || "").trim();

    const payload = {};
    if (ALLOWED_STATUSES.includes(status) && status !== initial.status) payload.status = status;
    if (driverId !== (initial.driverId ?? null)) payload.driverId = driverId;
    if (notes !== initial.notes) payload.notes = notes;

    if (inpTotalCents) {
      const totalRaw = inpTotalCents.value;
      const totalVal = totalRaw === "" ? null : Number.parseInt(totalRaw, 10);
      if ((totalVal === null) || Number.isInteger(totalVal)) {
        if (totalVal !== initial.totalCents) payload.totalCents = totalVal;
      }
    }
    if (inpDepositCents) {
      const depRaw = inpDepositCents.value;
      const depVal = depRaw === "" ? null : Number.parseInt(depRaw, 10);
      if ((depVal === null) || Number.isInteger(depVal)) {
        if (depVal !== initial.depositCents) payload.depositCents = depVal;
      }
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
    if (!Object.keys(payload).length) { closeDialog(); return; }

    setSaving(true);
    try {
      await apiPatchOrder(currentId, payload);
      if (typeof window.refreshOrderRow === "function") {
        window.refreshOrderRow(currentId, payload);
      }
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

  // Ensure Save works even if the button is outside the <form> or is type="button"
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.id === "oemSave") {
      e.preventDefault();
      e.stopPropagation();
      doSave();
    }
  }, true);

  // ----------------------------------------------------
  // NEW: View modal filler (no DOM/CSS changes required)
  // ----------------------------------------------------
  function fillViewModal(order) {
    const get = (id) => document.getElementById(id);

    (get('ov_orderNumber') || {}).textContent = order.number || order.orderNo || order.id || "—";
    (get('ov_status')      || {}).textContent = order.status || "—";
    (get('ov_createdAt')   || {}).textContent = order.createdAt || order.created || "—";

    (get('ov_fullName') || {}).textContent = order.customerName || order.customer || "—";
    (get('ov_phone')    || {}).textContent = order.phone || "—";
    (get('ov_email')    || {}).textContent = order.email || "—";
    (get('ov_address')  || {}).textContent = order.address || order.deliveryAddress || "—";

    const curr = order.currency || DEFAULT_CURRENCY;
    (get('ov_currency') || {}).textContent = curr;
    (get('ov_total')    || {}).textContent = money(fromCents(order.totalCents ?? order.total), curr);
    (get('ov_deposit')  || {}).textContent = money(fromCents(order.depositCents ?? order.deposit), curr);

    // --- switched from <li> to table rows in <tbody id="ov_items"> ---
    const body = get('ov_items'); // tbody inside the Items table
    if (body) {
      body.innerHTML = "";
      const items = Array.isArray(order.items) ? order.items : [];
      for (const it of items) {
        const tr = document.createElement('tr');
        const qty = Number(it.qty ?? it.quantity ?? 0);
        const priceUnits = fromCents(it.priceCents ?? it.price);
        const lineUnits = (Number(priceUnits) || 0) * qty;
        tr.innerHTML = `
          <td class="num">${qty}</td>
          <td>${it.name ?? it.sku ?? "Item"}</td>
          <td class="num">${money(lineUnits, curr)}</td>
        `;
        body.appendChild(tr);
      }
    }
  }

  // -------------------------------------------------------------------
  // NEW: Non-invasive tooltips for Edit money fields (remain in cents)
  // -------------------------------------------------------------------
  function updateMoneyPreviewTitles() {
    const curr = (inpCurrency?.value || DEFAULT_CURRENCY).toUpperCase();

    if (inpTotalCents) {
      const u = fromCents(inpTotalCents.value);
      inpTotalCents.title = u == null ? "" : money(u, curr);
    }
    if (inpDepositCents) {
      const u = fromCents(inpDepositCents.value);
      inpDepositCents.title = u == null ? "" : money(u, curr);
    }
  }

  function attachEditPreviewsOnce() {
    if (attachEditPreviewsOnce._done) return;
    attachEditPreviewsOnce._done = true;

    const onInput = () => updateMoneyPreviewTitles();
    inpTotalCents?.addEventListener("input", onInput);
    inpDepositCents?.addEventListener("input", onInput);
    inpCurrency?.addEventListener("input", onInput);
    inpCurrency?.addEventListener("change", onInput);
  }

  // --------- EVENT BINDINGS ---------

  // (A) Capture-phase interception so legacy handlers cannot open the old modal
  document.addEventListener("click", (e) => {
    const btn = e.target.closest('.btn-edit[data-oid], [data-action="edit-order"][data-oid]');
    if (!btn) return;
    // capture listener; stop others from handling this click
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const id = btn.getAttribute("data-oid");
    openFor(id);
  }, true); // <-- capture = true

  // Back-compat: programmatic event path (orders:edit)
  window.addEventListener("orders:edit", (e) => {
    const id = e?.detail?.id; if (id) openFor(id);
  });

  // NEW: programmatic path (orders:view) for the read-only dialog
  window.addEventListener("orders:view", async (e) => {
    try {
      await ensureOrdersModalLoadedOnce();
      let payload = e?.detail?.order || e?.detail || {};
      if (!payload.items && (payload.id || payload.orderId || payload.number)) {
        const id = payload.id || payload.orderId || payload.number;
        payload = await apiGetOrder(id) || payload;
      }
      fillViewModal(payload);
      const v = document.getElementById("orderViewModal");
      if (v?.showModal) v.showModal();
      else v?.setAttribute("open", "true");
    } catch (err) {
      console.error("[orders-edit] view open failed", err);
    }
  });

  // Bind Cancel/Save within the injected modal
  document.addEventListener("click", (e) => {
    if (e.target && (e.target.id === "oemCancel" || e.target.id === "orderCancelBtn" || e.target.id === "cancelEditBtn")) {
      e.preventDefault(); closeDialog();
    }
  });
  document.addEventListener("submit", (e) => {
    const f = e.target;
    if (f && (f.id === "orderEditForm" || f.id === "ordersEditForm")) {
      e.preventDefault(); doSave();
    }
  });

  // (B) Proactive upgrade when Orders partial loads
  window.addEventListener("admin:partial-loaded", (e) => {
    const name = e?.detail?.partial || e?.detail?.name;
    if (name === "orders") {
      ensureOrdersModalLoadedOnce().catch(console.error);
    }
  });
})();
