/* FULL FILE: /public/admin/js/orders-edit.js */
/* (unchanged original content from your latest file up to the first IIFE end) */
(() => {
  "use strict";

  const $  = (sel, root = document) => root.querySelector(sel);
  const by = (id) => document.getElementById(id);
  const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const ALLOWED = ["Pending", "Processing", "Delivered", "Cancelled"];

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

  const modal       = by("orderEditModal");
  const saveBtn     = by("orderSaveBtn");
  const cancelBtn   = by("orderCancelBtn");

  const idInput     = by("orderEditId");
  const statusSel   = by("orderEditStatus");
  const notesEl     = by("orderEditNotes");

  const driverWrap  = by("orderEditDriverWrap");
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

  function rowById(id) { return ordersTbody?.querySelector(`tr[data-oid="${CSS.escape(String(id))}"]`); }
  function readRowFields(id) {
    const row = rowById(id);
    if (!row) return {};
    const phone  = row.querySelector('[data-col="phone"]')?.textContent?.trim()  || "";
    const email  = row.querySelector('[data-col="email"]')?.textContent?.trim()  || "";
    const status = row.querySelector('[data-col="status"]')?.textContent?.trim() || "Pending";
    const total  = row.children?.[5]?.textContent || "";
    const driverName = row.querySelector('[data-col="driver"], .col-driver')?.textContent?.trim() || "";
    return { phone, email, status, total, driverName };
  }

  async function openModal(orderLike) {
    const id = orderLike?.id || orderLike?.orderNumber || orderLike?.order_id;
    if (!id) return alert("Missing order id");
    currentId = id;
    if (idInput) idInput.value = id;

    const row = readRowFields(id);
    buildStatusOptions(orderLike.status || row.status);
    resetDriver("", orderLike.driverName || row.driverName || "");
    notesEl && (notesEl.value = orderLike.notes || "");

    totalInp   && (totalInp.value   = "0");
    depositInp && (depositInp.value = "0");
    currInp    && (currInp.value    = "KES");
    fillItemsTable([], currInp?.value || "KES");

    openModalShell();
  }

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
      const tCents = totalInp ? toCentsFromInput(totalInp.value) : null;
      const dCents = depositInp ? toCentsFromInput(depositInp.value) : null;
      const curr   = currInp ? normCurrency(currInp.value) : null;

      const bodyA = { status, note, driverId: driverVal };
      if (tCents !== null) bodyA.totalCents = tCents;
      if (dCents !== null) bodyA.depositCents = dCents;
      if (curr)            bodyA.currency = curr;

      let r = await req("PATCH", `/api/admin/orders/${encodeURIComponent(currentId)}`, bodyA);
      if (!r.ok) {
        const bodyB = { status, notes: note, driver_id: driverVal };
        if (tCents !== null) bodyB.totalCents = tCents;
        if (dCents !== null) bodyB.depositCents = dCents;
        if (curr)            bodyB.currency = curr;
        r = await req("PATCH", `/api/admin/orders/${encodeURIComponent(currentId)}`, bodyB);
      }
      if (!r.ok) {
        const rs = await req("PUT", `/api/admin/orders/${encodeURIComponent(currentId)}/status`, { status, note });
        if (driverVal !== null) await req("PUT", `/api/admin/orders/${encodeURIComponent(currentId)}/assign-driver`, { driverUserId: driverVal });
        if (!rs.ok) throw new Error("Save failed");
      }

      const row = rowById(currentId);
      row?.querySelector('[data-col="status"]')?.replaceChildren(document.createTextNode(status));
      if (driverVal !== null) {
        const name = driverInp?.value || "";
        const cell = row?.querySelector('[data-col="driver"], .col-driver');
        if (cell) cell.textContent = name;
      }

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

  cancelBtn?.addEventListener("click", (e) => { e.preventDefault(); closeModalShell(); });
  saveBtn?.addEventListener("click",  (e) => { e.preventDefault(); doSave(); });

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

  if (typeof window.openOrderEdit !== "function") {
    window.openOrderEdit = (order) => openModal(order || {});
  }
})();

/* ==== Step 6.5 overlay enhancer (updated) ===================================
   Now hooks PATCH **or PUT** to any /api/admin/orders* URL and supports
   JSON **and** x-www-form-urlencoded bodies.
============================================================================ */
(() => {
  const ADMIN_ORDERS_RE = /\/api\/admin\/orders(\/|$)/i;

  function centsFromMoneyInput(raw) {
    if (raw == null) return null;
    const s1 = String(raw).replace(/[^\d.]/g, "").trim();
    if (!s1) return null;
    const m = s1.match(/^\d*(?:\.\d{0,})?/);
    const num = m && m[0] ? Number(m[0]) : NaN;
    if (!isFinite(num)) return null;
    return Math.round(num * 100);
  }
  const pick = (el, sel) => el ? el.querySelector(sel) : null;

  function ctxFromModal() {
    const m =
      document.getElementById("orderEditModal") ||
      document.querySelector('.orders-modal.show, .orders-modal[open], #orders-modal.show, [data-modal="order"].show, [data-modal="order"][open]');
    const ctx = { modal: m || document };

    ctx.orderId =
      (pick(m, '[name="orderNumber"]')?.value ||
       pick(m, '[data-field="orderNumber"]')?.textContent ||
       document.getElementById('orderEditId')?.value ||
       '').trim();

    ctx.totalInput   = pick(m, '#order-total, [name="total"], input[data-field="total"]')   || document.getElementById('orderEditTotalInput');
    ctx.depositInput = pick(m, '#order-deposit, [name="deposit"], input[data-field="deposit"]') || document.getElementById('orderEditDepositInput');
    ctx.currencySel  = pick(m, '#order-currency, [name="currency"], select[data-field="currency"]') || document.getElementById('orderEditCurrencyInput');

    ctx.statusSel = pick(m, '#order-status, [name="status"], select[data-field="status"]') || document.getElementById('orderEditStatus');
    ctx.driverSel = document.getElementById('orderEditDriverId') || pick(m, '[data-field="driverId"]');
    ctx.notesEl   = document.getElementById('orderEditNotes') || pick(m, '[data-field="notes"]');

    ctx.totalCents   = centsFromMoneyInput(ctx.totalInput?.value ?? ctx.totalInput?.textContent);
    ctx.depositCents = centsFromMoneyInput(ctx.depositInput?.value ?? ctx.depositInput?.textContent);
    ctx.currency     = (ctx.currencySel?.value || ctx.currencySel?.textContent || '').trim() || 'KES';
    ctx.statusValue  = (ctx.statusSel?.value || ctx.statusSel?.textContent || '').trim();
    const drvRaw     = (ctx.driverSel?.value || ctx.driverSel?.getAttribute?.('data-driver-id') || '').trim();
    ctx.driverId     = drvRaw ? (isNaN(Number(drvRaw)) ? drvRaw : Number(drvRaw)) : null;
    ctx.notes        = (ctx.notesEl?.value || ctx.notesEl?.textContent || '').trim();
    return ctx;
  }

  function findRow(orderId) {
    return document.querySelector(`tr[data-oid="${CSS.escape(orderId)}"]`) ||
           document.querySelector(`tr[data-order-id="${CSS.escape(orderId)}"]`);
  }
  function fmtMoney(cents, currency) {
    if (!isFinite(cents)) return '';
    const amount = cents / 100;
    return `${currency || 'KES'} ${amount.toLocaleString(undefined, {minimumFractionDigits:0, maximumFractionDigits:2})}`;
  }
  function updateRow(ctx) {
    const row = findRow(ctx.orderId);
    if (!row) return;
    const set = (sel, text) => { const el = row.querySelector(sel); if (el) el.textContent = text; };
    if (ctx.statusValue) set('[data-col="status"], .col-status', ctx.statusValue);
    if (ctx.driverId != null) set('[data-col="driver"], .col-driver', String(ctx.driverId));
    if (ctx.totalCents != null)   set('[data-col="total"], .col-total', fmtMoney(ctx.totalCents, ctx.currency));
    if (ctx.depositCents != null) set('[data-col="deposit"], .col-deposit', fmtMoney(ctx.depositCents, ctx.currency));
    set('[data-col="currency"], .col-currency', ctx.currency);
    try { row.classList.add('just-saved'); setTimeout(() => row.classList.remove('just-saved'), 900); } catch {}
  }
  function signal() {
    try {
      localStorage.setItem('ordersUpdatedAt', String(Date.now()));
      window.postMessage?.({ type:'orders-updated' }, '*');
    } catch {}
  }

  // Helper: parse & stringify urlencoded bodies
  function parseForm(bodyStr) {
    const params = new URLSearchParams(bodyStr || "");
    const obj = {};
    for (const [k,v] of params.entries()) obj[k] = v;
    return obj;
  }
  function stringifyForm(obj) {
    const p = new URLSearchParams();
    Object.entries(obj || {}).forEach(([k,v]) => { if (v != null) p.set(k, String(v)); });
    return p.toString();
  }

  if (!window.__orders_edit_fetch_patched_v2__) {
    window.__orders_edit_fetch_patched_v2__ = true;

    const _fetch = window.fetch;
    window.fetch = async function(input, init = {}) {
      const url = (typeof input === 'string') ? input : (input?.url || '');
      const method = (init.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();

      const isTarget = (method === 'PATCH' || method === 'PUT') && ADMIN_ORDERS_RE.test(url);
      if (!isTarget) return _fetch.apply(this, arguments);

      try {
        const ctx = ctxFromModal();

        let body = init.body;
        let ct = '';
        if (init.headers && typeof init.headers === 'object') {
          if (init.headers.get) ct = init.headers.get('Content-Type') || '';
          else ct = String(init.headers['Content-Type'] || init.headers['content-type'] || '');
        }

        if (body) {
          if (ct.includes('application/json')) {
            let json; try { json = JSON.parse(body); } catch { json = {}; }
            if (ctx.totalCents != null)   json.totalCents   = json.totalCents   ?? ctx.totalCents;
            if (ctx.depositCents != null) json.depositCents = json.depositCents ?? ctx.depositCents;
            if (ctx.currency)             json.currency     = json.currency     || ctx.currency;
            if (ctx.statusValue && !json.status) json.status = ctx.statusValue;
            if (ctx.driverId != null && json.driverId == null) json.driverId = ctx.driverId;
            if (ctx.notes && !json.notes) json.notes = ctx.notes;
            init.body = JSON.stringify(json);
          } else if (ct.includes('application/x-www-form-urlencoded')) {
            const form = parseForm(typeof body === 'string' ? body : '');
            if (ctx.totalCents != null)   form.totalCents   = form.totalCents   ?? String(ctx.totalCents);
            if (ctx.depositCents != null) form.depositCents = form.depositCents ?? String(ctx.depositCents);
            if (ctx.currency)             form.currency     = form.currency     || ctx.currency;
            if (ctx.statusValue && !form.status) form.status = ctx.statusValue;
            if (ctx.driverId != null && form.driverId == null) form.driverId = String(ctx.driverId);
            if (ctx.notes && !form.notes) form.notes = ctx.notes;
            init.body = stringifyForm(form);
          }
        }
      } catch {}

      const res = await _fetch.apply(this, arguments);
      try {
        if (res && res.ok) { updateRow(ctxFromModal()); signal(); }
      } catch {}
      return res;
    };
  }
})();
