// public/admin/js/orders-edit.js
// Edit Order modal — surgical update for Phase 6.4:
// - Status defaults to the clicked row’s real value (no “sticky” carry-over).
// - Hydrate via GET /api/track?phone=&order= with safe phone variants.
// - Driver combobox resets per open and queries /api/admin/users?type=Driver&q=.
// - Save PATCHes {status, driverId, notes}; inline row refresh + Step 6.4 broadcast.

(() => {
  "use strict";


// Flexible selectors to support both legacy (#orderEditModal/Save) and dialog-based (#orderEditDialog/editSaveBtn) markup
function getEl(...ids) {
  for (const i of ids) {
    let el = null;
    if (i.startsWith('#')) el = document.querySelector(i);
    else el = document.getElementById(i);
    if (el) return el;
  }
  return null;
}
function isDialog(el){ return el && typeof el.showModal === 'function'; }


  // ---------- Modal elements ----------
  const modal       = getEl("orderEditModal","#orderEditDialog");
  const saveBtn     = getEl("orderSaveBtn","#editSaveBtn");
  const cancelBtn   = getEl("orderCancelBtn");

  const idInput     = getEl("orderEditId");
  const statusSel   = getEl("orderEditStatus","#editStatus");

  const driverIdH   = getEl("orderEditDriverId");
  const driverInp   = getEl("orderEditDriverInput");
  const driverList  = getEl("orderEditDriverList");
  const driverClear = getEl("orderEditDriverClear");

  const notesEl     = getEl("orderEditNotes","#editNotes");

  const totalInp    = getEl("orderEditTotalInput");
  const depositInp  = getEl("orderEditDepositInput");
  const currInp     = getEl("orderEditCurrencyInput");

  const itemsBody   = getEl("orderEditItemsBody");

  // Orders table (for reading row data + inline refresh)
  const ordersTbody = document.getElementById("ordersTbody");

  // ---------- Constants / helpers ----------
  const ALLOWED = ["Pending", "Processing", "Delivered", "Cancelled"]; // backend enum

  const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  function setSaving(on) {
    if (!saveBtn) return;
    saveBtn.disabled = !!on;
    saveBtn.textContent = on ? "Saving…" : "Save";
  }

  function rowById(id) {
    return ordersTbody?.querySelector(`tr[data-oid="${CSS.escape(String(id))}"]`);
  }

  function parseKES(s) {
    if (typeof s === "number") return s;
    if (!s) return 0;
    const n = String(s).replace(/[^\d.,-]/g, "").replace(/,/g, "");
    const f = parseFloat(n);
    return Number.isFinite(f) ? f : 0;
  }

  function readRowFields(id) {
    const row = rowById(id);
    if (!row) return {};
    const phone  = row.querySelector('[data-col="phone"]')?.textContent?.trim()  || "";
    const email  = row.querySelector('[data-col="email"]')?.textContent?.trim()  || "";
    const status = row.querySelector('[data-col="status"]')?.textContent?.trim() || "Pending";
    const totalCell = row.children?.[5]?.textContent || ""; // matches orders table layout
    const total = parseKES(totalCell);
    const driverName = row.querySelector('[data-col="driver"], .col-driver')?.textContent?.trim() || "";
    return { phone, email, status, total, driverName };
  }

  function fillItemsTable(list, currency) {
    if (!itemsBody) return;
    itemsBody.innerHTML = "";
    const items = Array.isArray(list) ? list : [];
    if (!items.length) {
      itemsBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#6b7280">No items</td></tr>`;
      return;
    }
    const fmt = (n) => {
      try { return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "KES" }).format(Number(n||0)); }
      catch { return `${currency || "KES"} ${(Number(n||0)).toLocaleString()}`; }
    };
    for (const it of items) {
      const sku   = it.sku ?? it.code ?? it.id ?? "—";
      const name  = it.name ?? it.title ?? it.productName ?? "—";
      const qty   = it.qty ?? it.quantity ?? 1;
      const price = it.price ?? it.unitPrice ?? 0;
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${sku}</td><td>${name}</td><td>${qty}</td><td>${fmt(price)}</td>`;
      itemsBody.appendChild(tr);
    }
  }

  // ---------- Track hydration (GET with phone variants) ----------
  async function hydrateFromTrack(orderId, phone, email) {
    const variants = [];
    if (phone) {
      const p = String(phone).trim();
      variants.push(p);                             // "+254722…"
      variants.push(p.replace(/^\+/, ""));          // "254722…"
      variants.push(p.replace(/^\+?254/, "0"));     // "07…"
    }
    const attempts = [];
    for (const ph of variants) attempts.push({ ph, ord: orderId }); // exact order
    for (const ph of variants) attempts.push({ ph, ord: null });    // phone-only
    if (!variants.length) attempts.push({ ph: "", ord: orderId });  // last resort

    for (const at of attempts) {
      try {
        const qs = new URLSearchParams();
        if (at.ph)  qs.set("phone", at.ph);
        if (at.ord) qs.set("order", String(at.ord));
        qs.set("page", "1"); qs.set("per", "5");
        const res = await fetch(`/api/track?${qs.toString()}`, {
          headers: email ? { "X-WS-Email": email } : undefined
        });
        if (!res.ok) continue;
        const data = await res.json().catch(() => ({}));
        const list = Array.isArray(data?.orders) ? data.orders : [];
        if (!list.length) continue;
        const hit = list.find(o => String(o.orderNumber || o.id) === String(orderId)) || list[0];
        if (hit) return hit;
      } catch { /* try next */ }
    }
    return null;
  }

  // ---------- Drivers ----------
  async function queryDrivers(q) {
    const url = `/api/admin/users?type=Driver${q ? `&q=${encodeURIComponent(q)}` : ""}`;
    try {
      const r = await fetch(url);
      const data = await r.json().catch(() => ({}));
      return Array.isArray(data?.users) ? data.users : [];
    } catch { return []; }
  }

  function resetDriver(id = "", name = "") {
    if (driverIdH) driverIdH.value = id ? String(id) : "";
    if (driverInp) driverInp.value = name || "";
    if (driverList) driverList.innerHTML = "";
  }

  function wireDriverCombo() {
    if (!driverInp || !driverList) return;
    const render = (arr) => {
      driverList.innerHTML = "";
      if (!arr.length) { driverList.innerHTML = `<li class="empty">No drivers</li>`; return; }
      for (const u of arr) {
        const li = document.createElement("li");
        const name = u.name || u.fullName || "";
        li.textContent = `${name}${u.phone ? ` — ${u.phone}` : ""}`;
        li.tabIndex = 0;
        li.addEventListener("click", () => {
          resetDriver(u.id, name);
          driverList.style.display = "none";
        });
        driverList.appendChild(li);
      }
      driverList.style.display = "block";
    };
    const onType = debounce(async () => {
      const q = (driverInp.value || "").trim();
      render(await queryDrivers(q));
    }, 200);
    driverInp.addEventListener("input", onType);
    driverInp.addEventListener("focus", onType);
    document.addEventListener("click", (e) => {
      if (!driverList.contains(e.target) && e.target !== driverInp) driverList.style.display = "none";
    });
    driverClear?.addEventListener("click", (e) => { e.preventDefault(); resetDriver(); driverList.style.display = "none"; });
  }
  wireDriverCombo(); // one-time wire

  // ---------- Modal lifecycle ----------
  let currentId = null;

  function buildStatusOptions(current) {
    if (!statusSel) return;
    statusSel.innerHTML = "";
    for (const s of ALLOWED) {
      const opt = document.createElement("option");
      opt.value = s; opt.textContent = s;
      statusSel.appendChild(opt);
    }
    const toSelect = ALLOWED.includes(current) ? current : "Pending";
    statusSel.value = toSelect;
  }

  async function openModal(orderLike) {
    const id = orderLike?.id || orderLike?.orderNumber;
    if (!id) return alert("Missing order id");
    currentId = id;

    if (idInput) idInput.value = id;

    // Seed from the row (real values for this order)
    buildStatusOptions(orderLike.status);           // <-- fixes sticky status
    resetDriver("", orderLike.driverName || "");    // clear/reset driver each open

    const row = readRowFields(id);

    // Money fields are display-only in this phase
    if (totalInp)   totalInp.value   = String(row.total || 0);
    if (depositInp) depositInp.value = String(depositInp.value || 0);
    if (currInp)    currInp.value    = currInp.value || "KES";

    // Try to hydrate better totals/items via Track
    const fromTrack = await hydrateFromTrack(id, orderLike.phone || row.phone, orderLike.email || row.email);
    if (fromTrack) {
      if (typeof fromTrack.total === "number" && totalInp) totalInp.value = String(fromTrack.total);
      if (fromTrack.currency && currInp) currInp.value = fromTrack.currency;
      fillItemsTable(fromTrack.items || fromTrack.cart || [], currInp?.value || "KES");
    } else {
      fillItemsTable([], currInp?.value || "KES");
    }

    if (modal) { if (isDialog(modal)) { try { modal.showModal(); } catch { modal.setAttribute("open","true"); } } else { modal.style.display="block"; modal.setAttribute("aria-hidden","false"); } }
  }

  function closeModal() {
    if (modal) { if (isDialog(modal)) { try { modal.close(); } catch { modal.removeAttribute("open"); } } else { modal.style.display="none"; modal.setAttribute("aria-hidden","true"); } }
  }

  cancelBtn?.addEventListener("click", (e) => { e.preventDefault(); closeModal(); });
  // Fallback: close when a <button value="cancel"> inside dialog is clicked
  if (isDialog(modal)) {
    modal.addEventListener("close", () => {});
    modal.querySelectorAll('button[value="cancel"]').forEach(b => b.addEventListener("click", (ev) => { ev.preventDefault(); closeModal(); }));
  }


  // ---------- Save (PATCH /api/admin/orders/:id) ----------
  async function doSave() {
    if (!currentId) return;
    const status = statusSel?.value || "Pending";
    if (!ALLOWED.includes(status)) { alert("Please choose a valid status."); return; }

    const driverId = driverIdH?.value ? parseInt(driverIdH.value, 10) : null;
    const notes = notesEl?.value?.trim() || "";

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(currentId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, driverId, notes })
      });
      const txt = await res.text(); let json; try { json = JSON.parse(txt); } catch {}
      if (!res.ok || (json && json.success === false)) {
        const msg = (json && (json.error?.message || json.error || json.message)) || txt || `HTTP ${res.status}`;
        throw new Error(msg);
      }

      // inline table refresh via controller hook when available
      if (typeof window.refreshOrderRow === "function") {
        window.refreshOrderRow(currentId, { status });
      } else {
        const row = rowById(currentId);
        row?.querySelector('[data-col="status"]')?.replaceChildren(document.createTextNode(status));
      }

      // Step 6.4 broadcast
      try {
        localStorage.setItem("ordersUpdatedAt", String(Date.now()));
        window.postMessage({ type: "orders-updated", orderId: currentId }, "*");
      } catch {}

      closeModal();
    } catch (e) {
      console.error("[orders-edit] save failed:", e);
      alert(`Failed to save order changes.\n\n${e.message || ""}`);
    } finally {
      setSaving(false);
    }
  }

  saveBtn?.addEventListener("click", (e) => { e.preventDefault(); doSave(); });

  // ---------- Click binder (status comes from the clicked row) ----------
  document.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="edit-order"], .btn-edit');
    if (!btn) return;

    e.preventDefault();

    const oid   = btn.getAttribute("data-oid")   || "";
    const phone = btn.getAttribute("data-phone") || "";
    const email = btn.getAttribute("data-email") || "";

    const tr = btn.closest("tr");
    const statusText =
      tr?.querySelector('[data-col="status"], .col-status')?.textContent?.trim() || "";
    const driverName =
      tr?.querySelector('[data-col="driver"], .col-driver')?.textContent?.trim() || "";

    const orderLike = {
      id: oid,
      orderNumber: oid,
      phone,
      email,
      status: statusText,   // <-- pass real row status
      driverName           // (display only)
    };

    if (typeof window.openOrderEdit === "function") {
      window.openOrderEdit(orderLike);
    } else {
      openModal(orderLike);
    }
  });

  // expose programmatic hook if needed
  if (typeof window.openOrderEdit !== "function") {
    window.openOrderEdit = (order) => openModal(order || {});
  }
})();
