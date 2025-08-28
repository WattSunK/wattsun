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

  // ----- money helpers -----
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

  // ---------- modal elements ----------
  const modal       = by("orderEditModal");
  const saveBtn     = by("orderSaveBtn");
  const cancelBtn   = by("orderCancelBtn");

  const idInput     = by("orderEditId");
  const statusSel   = by("orderEditStatus");
  const notesEl     = by("orderEditNotes");

  // combobox (legacy)
  const driverWrap  = by("orderEditDriverWrap");
  const driverIdH   = by("orderEditDriverId");
  const driverInp   = by("orderEditDriverInput");
  const driverList  = by("orderEditDriverList");
  const driverClear = by("orderEditDriverClear");

  // money + items (display only)
  const totalInp    = by("orderEditTotalInput");
  const depositInp  = by("orderEditDepositInput");
  const currInp     = by("orderEditCurrencyInput");
  const itemsBody   = by("orderEditItemsBody");

  const ordersTbody = by("ordersTbody");

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
    // our table doesn’t carry a data attribute; fallback to first-cell text match
    const rows = document.querySelectorAll('table tbody tr');
    for (const r of rows) {
      const first = r.querySelector('td');
      if (first && (first.textContent || '').trim() === String(id)) return r;
    }
    return ordersTbody?.querySelector(`tr[data-oid="${CSS.escape(String(id))}"]`) || null;
  }
  function readRowFields(id) {
    const row = rowById(id);
    if (!row) return {};
    const cells = row.querySelectorAll('td');
    const status = cells?.[4]?.textContent?.trim() || "Pending";
    const total  = cells?.[5]?.textContent?.trim() || "";
    const phone  = cells?.[2]?.textContent?.trim() || "";
    const email  = cells?.[3]?.textContent?.trim() || "";
    return { phone, email, status, total };
  }

  // ---------- modal open (exposed) ----------
  async function openModal(orderLike) {
    const id = orderLike?.id || orderLike?.orderNumber || orderLike?.order_id;
    if (!id) return alert("Missing order id");
    currentId = id;
    if (idInput) idInput.value = id;

    const row = readRowFields(id);
    buildStatusOptions(orderLike.status || row.status);
    resetDriver("", orderLike.driverName || "");

    notesEl && (notesEl.value = orderLike.notes || "");

    // DON’T zero-out money; keep whatever was last shown/typed, tiny appends will hydrate if we have cached overlay.
    openModalShell();
  }

  // ---------- SAVE ----------
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
        if (!rs.ok) {
          const msg = await readText(rs);
          throw new Error(`Save failed on all routes. Last /status: ${rs.status} — ${msg || "(no body)"}`);
        }
        if (driverVal !== null) {
          const rd = await req("PUT", `/api/admin/orders/${encodeURIComponent(currentId)}/assign-driver`, { driverUserId: driverVal });
          if (!rd.ok) console.warn("[orders-edit] assign-driver failed:", rd.status, await readText(rd));
        }
      }

      // best-effort inline update before broadcast (Status/Total columns)
      const row = rowById(currentId);
      const cells = row?.querySelectorAll('td');
      if (cells && cells.length >= 6) {
        cells[4].textContent = status; // Status col
        const money = (amtCents, cur) => {
          if (amtCents == null) return cells[5].textContent || '';
          const n = (amtCents/100);
          return `${cur || curr || 'KES'} ${n.toLocaleString(undefined,{maximumFractionDigits:2})}`;
        };
        if (tCents != null) cells[5].textContent = money(tCents, curr);
        row?.setAttribute?.('data-oid', currentId);
        try { row.classList.add('just-saved'); setTimeout(()=>row.classList.remove('just-saved'), 900); } catch {}
      }

      try {
        // cache the overlay locally so the next open shows persisted values even if the list re-renders
        const cacheKey = 'ordersOverlayCache';
        const cache = JSON.parse(localStorage.getItem(cacheKey) || '{}');
        cache[currentId] = {
          orderId: currentId,
          status,
          driverId: driverVal,
          driverName: driverInp?.value || '',
          notes: note,
          totalCents: tCents,
          depositCents: dCents,
          currency: curr || 'KES',
          ts: Date.now()
        };
        localStorage.setItem(cacheKey, JSON.stringify(cache));

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

  document.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="edit-order"], .btn-edit');
    if (!btn) return;
    e.preventDefault();

    const oid   = btn.getAttribute("data-oid")   || "";
    const tr = btn.closest("tr");
    const statusText = tr?.querySelectorAll('td')?.[4]?.textContent?.trim() || "";
    openModal({ id: oid, orderNumber: oid, status: statusText });
  });

  if (typeof window.openOrderEdit !== "function") {
    window.openOrderEdit = (order) => openModal(order || {});
  }
})();

/* ==== Step 6.5 overlay enhancer (updated) ===================================
   Hooks PATCH/PUT to /api/admin/orders*, supports JSON & urlencoded,
   then updates row, caches overlay, and broadcasts.
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
    ctx.driverName   = (document.getElementById('orderEditDriverInput')?.value || '').trim();
    return ctx;
  }

  // urlencoded helpers
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

  function cacheOverlay(ctx) {
    try {
      const key = 'ordersOverlayCache';
      const cache = JSON.parse(localStorage.getItem(key) || '{}');
      cache[ctx.orderId] = {
        orderId: ctx.orderId,
        status: ctx.statusValue,
        driverId: ctx.driverId,
        driverName: ctx.driverName || '',
        notes: ctx.notes,
        totalCents: ctx.totalCents,
        depositCents: ctx.depositCents,
        currency: ctx.currency,
        ts: Date.now()
      };
      localStorage.setItem(key, JSON.stringify(cache));
    } catch {}
  }

  function updateRowCells(ctx) {
    // locate the row by exact first-cell match
    const rows = document.querySelectorAll('table tbody tr');
    let row = null;
    for (const r of rows) {
      const first = r.querySelector('td');
      if (first && (first.textContent || '').trim() === ctx.orderId) { row = r; break; }
    }
    if (!row) return;
    row.setAttribute('data-oid', ctx.orderId);

    const cells = row.querySelectorAll('td');
    const fmt = (cents, currency) => {
      if (cents == null) return cells?.[5]?.textContent || '';
      const n = (cents/100);
      return `${currency || 'KES'} ${n.toLocaleString(undefined,{maximumFractionDigits:2})}`;
    };
    if (ctx.statusValue && cells[4]) cells[4].textContent = ctx.statusValue;
    if (cells[5] && ctx.totalCents != null) cells[5].textContent = fmt(ctx.totalCents, ctx.currency);

    try { row.classList.add('just-saved'); setTimeout(()=>row.classList.remove('just-saved'), 900); } catch {}
  }

  if (!window.__orders_edit_fetch_patched_v3__) {
    window.__orders_edit_fetch_patched_v3__ = true;

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
        if (res && res.ok) {
          const ctx = ctxFromModal();
          cacheOverlay(ctx);
          updateRowCells(ctx);
          localStorage.setItem('ordersUpdatedAt', String(Date.now()));
          window.postMessage?.({ type:'orders-updated', orderId: ctx.orderId }, '*');
        }
      } catch {}
      return res;
    };
  }
})();

/* ==== Step 6.5 — minimal UI refresh & rehydrate on open (tiny appends) ======
   1) After save we cached overlay in localStorage. This block rehydrates the
      modal fields on open if cache exists.
   2) Also listens for 'orders-updated' and reapplies row patch after re-render.
============================================================================ */
(() => {
  const CACHE_KEY = 'ordersOverlayCache';

  function getCache(orderId) {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')[orderId] || null; }
    catch { return null; }
  }

  function toMoney(cents) {
    if (cents == null) return '';
    return (cents/100).toString();
  }

  // Rehydrate modal once it becomes visible
  const m = document.getElementById('orderEditModal') || document;
  const hydrate = () => {
    const id = (document.getElementById('orderEditId')?.value || '').trim();
    if (!id) return;
    const c = getCache(id);
    if (!c) return;

    const statusSel = document.getElementById('orderEditStatus');
    const notesEl   = document.getElementById('orderEditNotes');
    const drvInp    = document.getElementById('orderEditDriverInput');
    const drvIdH    = document.getElementById('orderEditDriverId');
    const totalInp  = document.getElementById('orderEditTotalInput');
    const depInp    = document.getElementById('orderEditDepositInput');
    const currInp   = document.getElementById('orderEditCurrencyInput');

    if (statusSel && c.status) statusSel.value = c.status;
    if (notesEl && c.notes != null) notesEl.value = c.notes;
    if (drvInp && c.driverName != null) drvInp.value = c.driverName;
    if (drvIdH && c.driverId != null) drvIdH.value = String(c.driverId);
    if (totalInp && c.totalCents != null) totalInp.value = toMoney(c.totalCents);
    if (depInp && c.depositCents != null) depInp.value = toMoney(c.depositCents);
    if (currInp && c.currency) currInp.value = c.currency;
  };

  // Observe visibility/state change of the modal container (defensive)
  try {
    const obs = new MutationObserver(() => hydrate());
    const modal = document.getElementById('orderEditModal') || document.body;
    obs.observe(modal, { attributes: true, subtree: true, attributeFilter: ['style','aria-hidden','class'] });
  } catch {}

  // Re-apply row patch after list re-render
  window.addEventListener('message', (e) => {
    if (e?.data?.type !== 'orders-updated') return;
    const id = (document.getElementById('orderEditId')?.value || '').trim();
    if (!id) return;

    const c = getCache(id);
    if (!c) return;

    // find row by exact first-cell match
    const rows = document.querySelectorAll('table tbody tr');
    let row = null;
    for (const r of rows) {
      const first = r.querySelector('td');
      if (first && (first.textContent || '').trim() === id) { row = r; break; }
    }
    if (!row) return;
    row.setAttribute('data-oid', id);

    const cells = row.querySelectorAll('td');
    if (cells[4] && c.status) cells[4].textContent = c.status;
    if (cells[5] && c.totalCents != null) {
      const n = (c.totalCents/100);
      cells[5].textContent = `${c.currency || 'KES'} ${n.toLocaleString(undefined,{maximumFractionDigits:2})}`;
    }
  });
})();
