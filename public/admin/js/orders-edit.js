
// /public/admin/js/orders-edit.js
// Admin Orders — Minimal, de-duplicated edit/view logic aligned with overlay-aware API.
// Endpoints used:
//   - GET    /api/admin/orders/:idOrNumber   -> load one order + items (overlay-aware)
//   - PATCH  /api/admin/orders/:idOrNumber   -> save overlay fields
//
// What this file does:
//   1) Opens the Edit modal for an order, loads data with GET, fills fields + items table.
//   2) Saves changes with PATCH (status, notes, driverId, totalCents, depositCents, currency).
//   3) Optimistically updates the visible table row (status/total/currency/driver).
//
// What this file intentionally DOES NOT do (removed redundancies):
//   - No global fetch monkey-patch.
//   - No legacy /api/track hydrator.
//   - No localStorage overlay cache.
//   - No multiple fallback routes for PATCH.
//   - No mutation observers. We just update the row we touched.
//
// DOM contract (ids/classes this script expects to exist):
//   Modal elements:
//     #orderEditModal, #orderSaveBtn, #orderCancelBtn
//     #orderEditId, #orderEditStatus, #orderEditNotes
//     #orderEditDriverId (hidden numeric), #orderEditDriverInput (text), #orderEditDriverList (ul), #orderEditDriverClear (btn)
//     #orderEditTotalInput, #orderEditDepositInput, #orderEditCurrencyInput
//     #orderEditItemsBody (tbody)
//   Table:
//     #ordersTbody (optional). We also find the row by matching the first <td> textContent to the order id.
//
// Status options (kept in sync with backend):
const ALLOWED_STATUSES = ["Pending", "Confirmed", "Dispatched", "Delivered", "Closed", "Cancelled"];

(function AdminOrdersEdit() {
  "use strict";

  // ---------- DOM helpers ----------
  const $  = (sel, root = document) => root.querySelector(sel);
  const by = (id) => document.getElementById(id);
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);

  // Modal + fields
  const modal       = by("orderEditModal");
  const saveBtn     = by("orderSaveBtn");
  const cancelBtn   = by("orderCancelBtn");

  const idInput     = by("orderEditId");
  const statusSel   = by("orderEditStatus");
  const notesEl     = by("orderEditNotes");

  const driverIdH   = by("orderEditDriverId");
  const driverInp   = by("orderEditDriverInput");
  const driverList  = by("orderEditDriverList");
  const driverClear = by("orderEditDriverClear");

  const totalInp    = by("orderEditTotalInput");
  const depositInp  = by("orderEditDepositInput");
  const currInp     = by("orderEditCurrencyInput");

  const itemsBody   = by("orderEditItemsBody");
  const ordersTbody = by("ordersTbody");

  let currentId = null;

  // ---------- Format helpers ----------
  function moneyToCents(input) {
    if (input == null || input === "") return null;
    if (typeof input === "number" && Number.isFinite(input)) return Math.round(input * 100);
    const s = String(input).replace(/[^\d.,-]/g,"").trim();
    if (!s) return null;
    // normalize commas
    const normalized = s.indexOf(",") > -1 && s.indexOf(".") > -1 ? s.replace(/,/g,"") : s.replace(/,/g,"");
    const f = parseFloat(normalized);
    return Number.isFinite(f) ? Math.round(f * 100) : null;
  }
  function normCurrency(v) {
    if (!v) return null;
    let c = String(v).trim().toUpperCase();
    if (c === "KSH") c = "KES";
    return /^[A-Z]{3}$/.test(c) ? c : null;
  }
  function fmtMoney(cents, currency) {
    if (cents == null || !Number.isFinite(Number(cents))) return "";
    const amt = Number(cents) / 100;
    try { return new Intl.NumberFormat(undefined,{style:"currency",currency:currency||"KES"}).format(amt); }
    catch { return `${currency||"KES"} ${amt.toLocaleString(undefined,{maximumFractionDigits:2})}`; }
  }

  // ---------- UI helpers ----------
  function setSaving(on) {
    if (!saveBtn) return;
    saveBtn.disabled = !!on;
    saveBtn.textContent = on ? "Saving…" : "Save";
  }
  function openModalShell() { if (modal) { modal.style.display = "block"; modal.setAttribute("aria-hidden","false"); } }
  function closeModalShell(){ if (modal) { modal.style.display = "none";  modal.setAttribute("aria-hidden","true"); } }
  function buildStatusOptions(current) {
    if (!statusSel) return;
    statusSel.innerHTML = "";
    for (const s of ALLOWED_STATUSES) {
      const opt = document.createElement("option");
      opt.value = s; opt.textContent = s;
      statusSel.appendChild(opt);
    }
    statusSel.value = ALLOWED_STATUSES.includes(current) ? current : "Pending";
  }

  // ---------- driver combobox (optional) ----------
  async function queryDrivers(q) {
    const url = `/api/admin/users?type=Driver${q ? `&q=${encodeURIComponent(q)}` : ""}`;
    try {
      const r = await fetch(url, { credentials:"include" });
      const j = await r.json().catch(() => ({}));
      return Array.isArray(j?.users) ? j.users : [];
    } catch { return []; }
  }
  function renderDriverList(arr) {
    if (!driverList) return;
    driverList.innerHTML = "";
    if (!arr.length) { driverList.innerHTML = `<li class="empty">No drivers</li>`; return; }
    for (const u of arr) {
      const li = document.createElement("li");
      const nm = u.name || u.fullName || "";
      li.textContent = `${nm}${u.phone ? ` — ${u.phone}` : ""}`;
      li.tabIndex = 0;
      li.addEventListener("click", () => {
        if (driverIdH) driverIdH.value = u.id;
        if (driverInp) driverInp.value = nm;
        driverList.style.display = "none";
      });
      driverList.appendChild(li);
    }
    driverList.style.display = "block";
  }
  function wireDriverComboOnce() {
    if (!driverInp || driverInp._bound) return;
    driverInp._bound = true;
    let t;
    driverInp.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(async () => renderDriverList(await queryDrivers(driverInp.value.trim())), 180);
    });
    driverInp.addEventListener("focus", () => driverInp.dispatchEvent(new Event("input")));
    document.addEventListener("click", (e) => {
      if (driverList && !driverList.contains(e.target) && e.target !== driverInp) driverList.style.display = "none";
    });
    driverClear?.addEventListener("click", (e) => {
      e.preventDefault();
      if (driverIdH) driverIdH.value = "";
      if (driverInp) driverInp.value = "";
      if (driverList) driverList.innerHTML = "";
      driverList.style.display = "none";
    });
  }
  wireDriverComboOnce();

  // ---------- Items table ----------
  function renderItems(tbody, items, currency) {
    if (!tbody) return;
    tbody.innerHTML = "";
    const list = Array.isArray(items) ? items : [];
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#6b7280">No items</td></tr>`;
      return;
    }
    for (const it of list) {
      const tr = document.createElement("tr");
      const qty = Number(it.qty || it.quantity || 1);
      const unit = Number(it.priceCents != null ? it.priceCents : (it.price ?? 0));
      tr.innerHTML = `
        <td>${it.sku ?? "—"}</td>
        <td>${it.name ?? "—"}</td>
        <td>${qty}</td>
        <td>${fmtMoney(unit, currency)}</td>
        <td>${fmtMoney(unit * qty, currency)}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  // ---------- Row helpers ----------
  function findRowByOrderId(orderId) {
    const rows = document.querySelectorAll("table tbody tr");
    for (const r of rows) {
      const first = r.querySelector("td");
      if (first && (first.textContent || "").trim() === String(orderId)) return r;
    }
    return null;
  }
  function refreshRow(order) {
    const row = findRowByOrderId(order.id || order.orderNumber);
    if (!row) return;
    const cells = row.querySelectorAll("td");
    // Assuming table columns: [0]=id, [1]=name, [2]=phone, [3]=email, [4]=status, [5]=total, [6]=currency?, [7]=driver?
    if (cells[4]) cells[4].textContent = order.status || "";
    if (cells[5]) cells[5].textContent = fmtMoney(order.totalCents, order.currency);
    if (cells[6]) cells[6].textContent = order.currency || (order.currency === null ? "" : "");
    if (cells[7] && order.driverName) cells[7].textContent = order.driverName;
    try { row.classList.add("just-saved"); setTimeout(()=>row.classList.remove("just-saved"), 900); } catch {}
  }

  // ---------- API ----------
  async function apiGetOrder(id) {
    const r = await fetch(`/api/admin/orders/${encodeURIComponent(id)}`, { credentials:"include" });
    if (!r.ok) throw new Error(`GET failed: ${r.status}`);
    const j = await r.json();
    if (!j?.success || !j.order) throw new Error("Malformed GET /order response");
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
    if (!j?.success) throw new Error("Malformed PATCH response");
    return j.order || payload;
  }

  // ---------- Modal open/load ----------
  async function openModalFor(orderId) {
    if (!orderId) return alert("Missing order id");
    currentId = orderId;
    if (idInput) idInput.value = orderId;
    buildStatusOptions("Pending");
    if (notesEl) notesEl.value = "";
    if (totalInp) totalInp.value = "";
    if (depositInp) depositInp.value = "";
    if (currInp) currInp.value = "KES";

    openModalShell();

    try {
      const order = await apiGetOrder(orderId);
      // Fill fields
      buildStatusOptions(order.status || order.originalStatus || "Pending");
      if (notesEl)     notesEl.value = order.notes || "";
      if (currInp)     currInp.value = order.currency || "KES";
      if (totalInp)    totalInp.value = order.totalCents != null ? (order.totalCents/100).toString() : "";
      if (depositInp)  depositInp.value = order.depositCents != null ? (order.depositCents/100).toString() : "";
      if (driverIdH)   driverIdH.value = order.driverId != null ? String(order.driverId) : "";
      if (driverInp)   driverInp.value = order.driverName || "";

      renderItems(itemsBody, order.items || [], order.currency || "KES");
    } catch (e) {
      console.error("[orders-edit] load failed:", e);
      alert("Failed to load the order. Please try again.");
      closeModalShell();
    }
  }

  // ---------- Save ----------
  async function doSave() {
    if (!currentId) return;
    const status = statusSel?.value || "Pending";
    if (!ALLOWED_STATUSES.includes(status)) return alert("Please choose a valid status.");

    const payload = { status };
    const notes = (notesEl?.value || "").trim();
    if (notes) payload.notes = notes;

    const driverValRaw = (driverIdH?.value ?? "").trim();
    if (driverValRaw) {
      const n = Number(driverValRaw);
      if (!Number.isInteger(n)) return alert("Driver ID must be a number.");
      payload.driverId = n;
    }

    const tCents = moneyToCents(totalInp?.value);
    if (tCents != null) payload.totalCents = tCents;

    const dCents = moneyToCents(depositInp?.value);
    if (dCents != null) payload.depositCents = dCents;

    const cur = normCurrency(currInp?.value || "KES");
    if (cur) payload.currency = cur;

    setSaving(true);
    try {
      await apiPatchOrder(currentId, payload);
      // reflect what we just sent (overlay-aware)
      refreshRow({ id: currentId, status, totalCents: tCents, currency: cur, driverName: driverInp?.value || "" });
      closeModalShell();
    } catch (e) {
      console.error("[orders-edit] save failed:", e);
      alert("Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ---------- Bindings ----------
  on(cancelBtn, "click", (e) => { e.preventDefault(); closeModalShell(); });
  on(saveBtn,   "click", (e) => { e.preventDefault(); doSave(); });

  // Bind to table edit buttons (data-action="edit-order" or .btn-edit)
  document.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="edit-order"], .btn-edit');
    if (!btn) return;
    const oid = btn.getAttribute("data-oid") || btn.closest("tr")?.querySelector("td")?.textContent?.trim();
    if (!oid) return;
    e.preventDefault();
    openModalFor(oid);
  }, { capture: true });

  // Optional: global hook for other scripts
  if (typeof window.openOrderEdit !== "function") {
    window.openOrderEdit = (orderLike) => {
      const id = orderLike?.id || orderLike?.orderNumber;
      if (id) openModalFor(id);
    };
  }
})();
