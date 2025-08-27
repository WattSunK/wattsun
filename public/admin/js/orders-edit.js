// /public/admin/js/orders-edit.js
// Edit Order modal — combobox-only driver picker (markup lives in dashboard.html)
//
// AUTH on every request:
//   - credentials:"include" (send cookies)
//   - Authorization: Bearer <token> if ws_token/authToken/jwt/xToken exists
//
// Save strategy (compat, PATCH-first):
//   A) PATCH /api/admin/orders/:id            { status, note, driverId }
//   B) PATCH /api/admin/orders/:id            { status, notes, driver_id }   // alt legacy keys
//   C) PUT   /api/admin/orders/:id/status     { status, note }               // last resort
//      PUT   /api/admin/orders/:id/assign-driver { driverUserId }           // last resort (if driver chosen)

(() => {
  "use strict";

  // ---------- tiny DOM helpers ----------
  const $  = (sel, root = document) => root.querySelector(sel);
  const by = (id) => document.getElementById(id);
  const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const ALLOWED = ["Pending", "Processing", "Delivered", "Cancelled"];

  // ----- money helpers (Step 6.5) -----
  function toCentsFromInput(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 100);
    let s = String(v).trim();
    s = s.replace(/[^\d.,-]/g, "");
    if (s.indexOf(",") > -1 && s.indexOf(".") > -1) s = s.replace(/,/g, "");
    else s = s.replace(/,/g, "");
    const f = parseFloat(s);
    return Number.isFinite(f) ? Math.round(f * 100) : null;
  }
  function normCurrency(v) {
    if (!v) return null;
    let c = String(v).trim().toUpperCase();
    if (c === "KSH") c = "KES";
    return /^[A-Z]{3}$/.test(c) ? c : null;
  }

  // ---------- modal elements (must match dashboard.html) ----------
  const modal       = by("orderEditModal");            // container
  const saveBtn     = by("orderSaveBtn");
  const cancelBtn   = by("orderCancelBtn");

  const idInput     = by("orderEditId");
  const statusSel   = by("orderEditStatus");
  const notesEl     = by("orderEditNotes");

  // combobox (legacy)
  const driverWrap  = by("orderEditDriverWrap");
  const driverIdH   = by("orderEditDriverId");         // hidden numeric id
  const driverInp   = by("orderEditDriverInput");      // text input
  const driverList  = by("orderEditDriverList");       // <ul> results
  const driverClear = by("orderEditDriverClear");

  // money + items (display only; not saved by this file)
  const totalInp    = by("orderEditTotalInput");
  const depositInp  = by("orderEditDepositInput");
  const currInp     = by("orderEditCurrencyInput");
  const itemsBody   = by("orderEditItemsBody");

  // orders table (inline refresh)
  const ordersTbody = by("ordersTbody");

  // state
  let currentId = null;

  // ---------- auth + fetch wrappers ----------
  function readToken() {
    try {
      return (
        localStorage.getItem("ws_token") ||
        localStorage.getItem("authToken") ||
        localStorage.getItem("jwt") ||
        localStorage.getItem("xToken") ||
        ""
      );
    } catch { return ""; }
  }
  function authHeaders(extra = {}) {
    const h = { "Content-Type": "application/json", ...extra };
    const tok = readToken();
    if (tok && !h.Authorization) h.Authorization = `Bearer ${tok}`;
    return h;
  }
  async function req(method, url, body) {
    return fetch(url, {
      method,
      credentials: "include",
      headers: authHeaders(),
      body: body ? JSON.stringify(body) : undefined
    });
  }
  async function readText(r) { try { return await r.text(); } catch { return ""; } }

  // ---------- UI utils ----------
  function setSaving(on) {
    if (!saveBtn) return;
    saveBtn.disabled = !!on;
    saveBtn.textContent = on ? "Saving…" : "Save";
  }
  function openModalShell() {
    if (!modal) return;
    modal.style.display = "block";
    modal.setAttribute("aria-hidden", "false");
  }
  function closeModalShell() {
    if (!modal) return;
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  }
  function buildStatusOptions(current) {
    if (!statusSel) return;
    statusSel.innerHTML = "";
    for (const s of ALLOWED) {
      const opt = document.createElement("option");
      opt.value = s; opt.textContent = s;
      statusSel.appendChild(opt);
    }
    statusSel.value = ALLOWED.includes(current) ? current : "Pending";
  }

  // ---------- items table (display only) ----------
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
      const qty   = it.qty  ?? it.quantity ?? 1;
      const price = it.price ?? it.unitPrice ?? 0;
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${sku}</td><td>${name}</td><td>${qty}</td><td>${fmt(price)}</td>`;
      itemsBody.appendChild(tr);
    }
  }

  // ---------- driver combobox ----------
  async function queryDrivers(q) {
    const url = `/api/admin/users?type=Driver${q ? `&q=${encodeURIComponent(q)}` : ""}`;
    try {
      const r = await fetch(url, { credentials: "include", headers: authHeaders() });
      const data = await r.json().catch(() => ({}));
      return Array.isArray(data?.users) ? data.users : [];
    } catch { return []; }
  }
  function resetDriver(id = "", name = "") {
    if (driverIdH)  driverIdH.value = id ? String(id) : "";
    if (driverInp)  driverInp.value = name || "";
    if (driverList) driverList.innerHTML = "";
  }
  function wireDriverComboOnce() {
    if (!driverInp || !driverList) return;
    if (driverInp._bound) return;
    driverInp._bound = true;

    const render = (arr) => {
      driverList.innerHTML = "";
      if (!arr.length) { driverList.innerHTML = `<li class="empty">No drivers</li>`; return; }
      for (const u of arr) {
        const li = document.createElement("li");
        const name = u.name || u.fullName || "";
        li.textContent = `${name}${u.phone ? ` — ${u.phone}` : ""}`;
        li.tabIndex = 0;
        li.addEventListener("click", () => { resetDriver(u.id, name); driverList.style.display = "none"; });
        driverList.appendChild(li);
      }
      driverList.style.display = "block";
    };

    const onType = debounce(async () => {
      const q = (driverInp.value || "").trim();
      render(await queryDrivers(q));
    }, 180);

    driverInp.addEventListener("input", onType);
    driverInp.addEventListener("focus", onType);
    document.addEventListener("click", (e) => {
      if (!driverList.contains(e.target) && e.target !== driverInp) driverList.style.display = "none";
    });
    driverClear?.addEventListener("click", (e) => { e.preventDefault(); resetDriver(); driverList.style.display = "none"; });
  }
  wireDriverComboOnce();

  // ---------- helpers to read table row values for seeding ----------
  function rowById(id) {
    return ordersTbody?.querySelector(`tr[data-oid="${CSS.escape(String(id))}"]`);
  }
  function readRowFields(id) {
    const row = rowById(id);
    if (!row) return {};
    const phone  = row.querySelector('[data-col="phone"]')?.textContent?.trim()  || "";
    const email  = row.querySelector('[data-col="email"]')?.textContent?.trim()  || "";
    const status = row.querySelector('[data-col="status"]')?.textContent?.trim() || "Pending";
    const total  = row.children?.[5]?.textContent || ""; // display only
    const driverName = row.querySelector('[data-col="driver"], .col-driver')?.textContent?.trim() || "";
    return { phone, email, status, total, driverName };
  }

  // ---------- modal open (exposed) ----------
  async function openModal(orderLike) {
    const id = orderLike?.id || orderLike?.orderNumber || orderLike?.order_id;
    if (!id) return alert("Missing order id");
    currentId = id;
    if (idInput) idInput.value = id;

    // seed from row / payload
    const row = readRowFields(id);
    buildStatusOptions(orderLike.status || row.status);
    resetDriver("", orderLike.driverName || row.driverName || "");
    notesEl && (notesEl.value = orderLike.notes || "");

    // money: display only
    totalInp   && (totalInp.value   = "0");
    depositInp && (depositInp.value = "0");
    currInp    && (currInp.value    = "KES");
    fillItemsTable([], currInp?.value || "KES");

    openModalShell();
  }

  // ---------- SAVE (PATCH-first with credentials) ----------
  async function doSave() {
    if (!currentId) return;

    const status = statusSel?.value || "Pending";
    if (!ALLOWED.includes(status)) return alert("Please choose a valid status.");

    const note = notesEl?.value?.trim() || "";
    const driverValRaw = (driverIdH?.value ?? "").trim();
    const driverVal = driverValRaw === "" ? null : Number(driverValRaw);
    if (driverVal !== null && (!Number.isInteger(driverVal) || driverVal < 0)) {
      return alert("Driver ID must be a positive integer.");
    }

    setSaving(true);
    try {
      // Read optional money fields and include in PATCH
      const tCents = totalInp ? toCentsFromInput(totalInp.value) : null;
      const dCents = depositInp ? toCentsFromInput(depositInp.value) : null;
      const curr   = currInp ? normCurrency(currInp.value) : null;

      // A) primary PATCH with new fields
      const bodyA = { status, note, driverId: driverVal };
      if (tCents !== null) bodyA.totalCents = tCents;
      if (dCents !== null) bodyA.depositCents = dCents;
      if (curr)            bodyA.currency = curr;

      let r = await req("PATCH", `/api/admin/orders/${encodeURIComponent(currentId)}`, bodyA);

      // B) alt legacy keys if A failed
      if (!r.ok) {
        console.warn("[orders-edit] legacy A failed:", r.status, await readText(r));
        const bodyB = { status, notes: note, driver_id: driverVal };
        if (tCents !== null) bodyB.totalCents = tCents;
        if (dCents !== null) bodyB.depositCents = dCents;
        if (curr)            bodyB.currency = curr;
        r = await req("PATCH", `/api/admin/orders/${encodeURIComponent(currentId)}`, bodyB);
      }

      // C) split routes as last resort
      if (!r.ok) {
        console.info("[orders-edit] trying split routes as last resort…");
        const rs = await req("PUT", `/api/admin/orders/${encodeURIComponent(currentId)}/status`, { status, note });
        if (!rs.ok) {
          const msg = await readText(rs);
          throw new Error(`Save failed on all routes. Last /status: ${rs.status} — ${msg || "(no body)"}`);
        }
        if (driverVal !== null) {
          const rd = await req("PUT", `/api/admin/orders/${encodeURIComponent(currentId)}/assign-driver`, { driverUserId: driverVal });
          if (!rd.ok) console.warn("[orders-edit] assign-driver failed:", rd.status, await readText(rd));
        }
      }

      // inline row refresh (status + driver name if present)
      const row = rowById(currentId);
      row?.querySelector('[data-col="status"]')?.replaceChildren(document.createTextNode(status));
      if (driverVal !== null) {
        // show the typed name as a best-effort (API doesn’t echo)
        const name = driverInp?.value || "";
        const cell = row?.querySelector('[data-col="driver"], .col-driver');
        if (cell) cell.textContent = name;
      }

      // broadcast to other views (customer track, etc.)
      try {
        localStorage.setItem("ordersUpdatedAt", String(Date.now()));
        window.postMessage({ type: "orders-updated", orderId: currentId }, "*");
      } catch {}

      closeModalShell();
    } catch (e) {
      console.error("[orders-edit] save failed:", e);
      alert(`Failed to save order changes.\n\n${e.message || ""}`);
    } finally {
      setSaving(false);
    }
  }

  // ---------- bindings ----------
  cancelBtn?.addEventListener("click", (e) => { e.preventDefault(); closeModalShell(); });
  saveBtn?.addEventListener("click",  (e) => { e.preventDefault(); doSave(); });

  // open via action buttons in the table (supports either selector)
  document.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="edit-order"], .btn-edit');
    if (!btn) return;
    e.preventDefault();

    const oid   = btn.getAttribute("data-oid")   || "";
    const phone = btn.getAttribute("data-phone") || "";
    const email = btn.getAttribute("data-email") || "";

    const tr = btn.closest("tr");
    const statusText = tr?.querySelector('[data-col="status"], .col-status')?.textContent?.trim() || "";
    const driverName = tr?.querySelector('[data-col="driver"], .col-driver')?.textContent?.trim() || "";

    openModal({ id: oid, orderNumber: oid, phone, email, status: statusText, driverName });
  });

  // optional global hook
  if (typeof window.openOrderEdit !== "function") {
    window.openOrderEdit = (order) => openModal(order || {});
  }
})();
