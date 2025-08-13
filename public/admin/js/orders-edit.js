// public/admin/js/orders-edit.js
// Edit Order modal — surgical fix:
// - Status options = backend-allowed (no "All").
// - Hydrate amounts/items via GET /api/track?phone=&order= (if data exists).
// - Driver combobox resets per open and queries admin users (type=Driver).
// - Save = PATCH /api/admin/orders/:id with {status, driverId, notes} only.
// - Inline row refresh + Step 6.4 broadcast.

(() => {
  "use strict";

  // ---------- Elements in the existing modal ----------
  const modal       = document.getElementById("orderEditModal");
  const saveBtn     = document.getElementById("orderSaveBtn");
  const cancelBtn   = document.getElementById("orderCancelBtn");

  const idInput     = document.getElementById("orderEditId");
  const statusSel   = document.getElementById("orderEditStatus");

  const driverIdH   = document.getElementById("orderEditDriverId");
  const driverInp   = document.getElementById("orderEditDriverInput");
  const driverList  = document.getElementById("orderEditDriverList");
  const driverClear = document.getElementById("orderEditDriverClear");

  const notesEl     = document.getElementById("orderEditNotes");

  const totalInp    = document.getElementById("orderEditTotalInput");
  const depositInp  = document.getElementById("orderEditDepositInput");
  const currInp     = document.getElementById("orderEditCurrencyInput");

  const itemsBody   = document.getElementById("orderEditItemsBody");

  // Orders table (for reading row data + inline refresh)
  const ordersTbody = document.getElementById("ordersTbody");

  // ---------- Constants ----------
  const ALLOWED = ["Pending", "Processing", "Delivered", "Cancelled"]; // from backend route
  // parse "KES 12,345" → 12345
  function parseKES(s) {
    if (typeof s === "number") return s;
    if (!s) return 0;
    const n = String(s).replace(/[^\d.,-]/g, "").replace(/,/g, "");
    const f = parseFloat(n);
    return Number.isFinite(f) ? f : 0;
  }
  const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // ---------- Small helpers ----------
  function setSaving(on) {
    if (!saveBtn) return;
    saveBtn.disabled = !!on;
    saveBtn.textContent = on ? "Saving…" : "Save";
  }
  function rowById(id) {
    return ordersTbody?.querySelector(`tr[data-oid="${CSS.escape(String(id))}"]`);
  }
  function readRowFields(id) {
    const row = rowById(id);
    if (!row) return {};
    const phone = row.querySelector('[data-col="phone"]')?.textContent?.trim() || "";
    const email = row.querySelector('[data-col="email"]')?.textContent?.trim() || "";
    const status = row.querySelector('[data-col="status"]')?.textContent?.trim() || "Pending";
    const totalCell = row.children?.[5]?.textContent || ""; // 6th column in orders-controller.js
    const total = parseKES(totalCell);
    return { phone, email, status, total };
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
      try { return new Intl.NumberFormat(undefined, { style:"currency", currency: currency || "KES" }).format(Number(n||0)); }
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

  // ---------- Hydrate via Track (GET) ----------
  async function hydrateFromTrack(orderId, phone, email) {
    try {
      const qs = new URLSearchParams();
      if (phone) qs.set("phone", phone);
      if (orderId) qs.set("order", String(orderId));
      qs.set("page", "1"); qs.set("per", "5");
      const res = await fetch(`/api/track?${qs.toString()}`, {
        headers: email ? { "X-WS-Email": email } : undefined
      });
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data?.orders) ? data.orders : [];
      if (!list.length) return null;
      const hit = list.find(o => String(o.orderNumber || o.id) === String(orderId)) || list[0];
      return hit || null;
    } catch { return null; }
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

  // ---------- Modal open/close ----------
  let currentId = null;

  function buildStatusOptions(current) {
    if (!statusSel) return;
    const prev = statusSel.value;
    statusSel.innerHTML = "";
    for (const s of ALLOWED) {
      const opt = document.createElement("option");
      opt.value = s; opt.textContent = s;
      statusSel.appendChild(opt);
    }
    // pick a valid status
    const toSelect = ALLOWED.includes(current) ? current : (ALLOWED.includes(prev) ? prev : "Pending");
    statusSel.value = toSelect;
  }

  async function openModal({ id }) {
    if (!id) return alert("Missing order id");
    currentId = id;
    if (idInput) idInput.value = id;

    // read phone/email/status/total from the row
    const row = readRowFields(id);
    buildStatusOptions(row.status);            // exclude "All"
    resetDriver();                             // clear any previous driver selection
    if (notesEl) notesEl.value = "";           // start fresh

    // seed money fields from the row (display-only; backend doesn't persist money yet)
    if (totalInp)   totalInp.value   = String(row.total || 0);
    if (depositInp) depositInp.value = String(depositInp.value || 0);
    if (currInp)    currInp.value    = currInp.value || "KES";

    // try to hydrate items + better totals from Track
    const fromTrack = await hydrateFromTrack(id, row.phone, row.email);
    if (fromTrack) {
      if (typeof fromTrack.total === "number" && totalInp) totalInp.value = String(fromTrack.total);
      if (fromTrack.currency && currInp) currInp.value = fromTrack.currency;
      fillItemsTable(fromTrack.items || fromTrack.cart || [], currInp?.value || "KES");
    } else {
      fillItemsTable([], currInp?.value || "KES");
    }

    if (modal) { modal.style.display = "block"; modal.setAttribute("aria-hidden", "false"); }
  }

  function closeModal() {
    if (modal) { modal.style.display = "none"; modal.setAttribute("aria-hidden", "true"); }
  }

  cancelBtn?.addEventListener("click", (e) => { e.preventDefault(); closeModal(); });

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

      // inline table refresh via controller hook
      if (typeof window.refreshOrderRow === "function") {
        window.refreshOrderRow(currentId, {
          status,
          // note: the list doesn’t show notes/driver by default, but keep for future columns
        });
      } else {
        // fallback: update the visible cell
        const row = rowById(currentId);
        row?.querySelector('[data-col="status"]')?.replaceChildren(document.createTextNode(status));
      }

      // Step 6.4 broadcast (customer reflection)
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

  // ---------- Binder (hooked by orders-bridge.js) ----------
  if (typeof window.openOrderEdit !== "function") {
    window.openOrderEdit = (orderLike) => openModal(orderLike || {});
  }
})();
