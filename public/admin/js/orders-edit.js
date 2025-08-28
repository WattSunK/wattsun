// /public/admin/js/orders-edit.js
// Admin Orders — Edit & View modals, overlay persistence, and table refresh hardeners.
//
// What this file handles:
// 1) Edit modal: send PATCH with status, notes, driverId, + money fields (totalCents, depositCents, currency).
// 2) Post-save: update the visible table row, broadcast a change event, and cache the overlay in localStorage.
// 3) Hydration: when opening Edit/View, fetch from /api/track and populate fields + items.
// 4) Re-render resilience: if the table re-renders (pagination/partials), re-apply cached overlays to rows.
//
// This file is APPEND-ONLY safe. It does not remove or rely on other app scripts.
// -----------------------------------------------------------------------------
// probe layer – additive only

/* === Step 6.5 Analysis Probes — ADDITIVE ONLY ===
   Safe to include multiple times. No behavior changes.
   Emits console.debug logs when window.WS_DEBUG_ORDERS === true.
*/
(() => {
  // idempotent guard
  if (window.__WS_ORDERS_PROBES_INSTALLED__) return;
  window.__WS_ORDERS_PROBES_INSTALLED__ = true;

  // ---- Toggle ----
  if (!('WS_DEBUG_ORDERS' in window)) window.WS_DEBUG_ORDERS = true;
  const ON = () => !!window.WS_DEBUG_ORDERS;

  // ---- Logger + helpers ----
  const now = () => new Date().toISOString().slice(11, 23);
  const post = (type, data = {}) => {
    if (!ON()) return;
    const msg = { t: now(), type, ...data };
    // eslint-disable-next-line no-console
    console.debug('[ORDERS]', msg);
    try { localStorage.setItem('__ORD_LAST', JSON.stringify(msg)); } catch (_) {}
  };
  const safe = (fnName, wrap) => {
    // return a wrapper if the symbol exists, otherwise noop
    const parts = fnName.split('.');
    let ctx = window, key = parts.pop();
    for (const p of parts) ctx = ctx?.[p];
    if (!ctx || !key || typeof ctx[key] !== 'function') return null;
    const original = ctx[key];
    const wrapped = wrap(original);
    try { ctx[key] = wrapped; } catch (_) {}
    return { ctx, key, original, wrapped };
  };

  // Public helper surface
  window.__ordersTrace = Object.assign(window.__ordersTrace || {}, {
    ev: post,
    mark: (name) => performance.mark('ord:' + name),
    measure: (name, a, b) => performance.measure('ord:' + name, 'ord:' + a, 'ord:' + b),
    snapRow(tr) {
      const get = (sel) => tr?.querySelector(sel)?.textContent?.trim() || null;
      return {
        orderId: tr?.dataset?.orderId || get('[data-col="orderNumber"]'),
        total:   get('[data-col="total"]'),
        deposit: get('[data-col="deposit"]'),
        currency:get('[data-col="currency"]'),
        status:  get('[data-col="status"]'),
        driver:  tr?.dataset?.driverId || get('[data-col="driver"]')
      };
    },
    async assertBackend(orderId, phone) {
      try {
        const r = await fetch(`/api/track?order=${encodeURIComponent(orderId)}&phone=${encodeURIComponent(phone||'')}`);
        const j = await r.json();
        const o = (j.orders || []).find(x => (x.orderNumber||x.id) === orderId) || null;
        post('assert:backend', { orderId, got: o ? {
          total:o.total, deposit:o.deposit, currency:o.currency, status:o.status, items:(o.items||[]).length
        } : null });
        return o;
      } catch (e) {
        post('assert:backend:error', { orderId, err: String(e) });
      }
    }
  });

  // ---- Storage + visibility breadcrumbs ----
  window.addEventListener('storage', (e) => {
    if (e.key === 'ordersUpdatedAt') post('storage:ordersUpdatedAt', { newValue: e.newValue });
  });
  document.addEventListener('visibilitychange', () => {
    post('doc:visibility', { state: document.visibilityState });
  });

  // ---- Anchor 1/2: partial mount/unmount detection ----
  // Strategy: detect Orders table container appearance/disappearance.
  const isOrdersContainer = (el) => {
    if (!el || el.nodeType !== 1) return false;
    const idMatch = /orders/i.test(el.id || '');
    const attrMatch = el.matches?.('[data-partial="orders"], [data-orders], .orders-partial, section.orders, #orders');
    const tableMatch = el.matches?.('table[data-orders], table#orders, table.orders-table');
    return !!(idMatch || attrMatch || tableMatch);
  };

  let mountedCount = 0;
  const markMount = () => post('partial:orders:mount', { n: ++mountedCount });
  const markUnmount = () => post('partial:orders:unmount', { n: mountedCount });

  // MutationObserver to spot mounts/unmounts
  const obs = new MutationObserver((mut) => {
    for (const m of mut) {
      [...m.addedNodes].forEach((n) => {
        if (isOrdersContainer(n) || (n.querySelector && n.querySelector('[data-partial="orders"], table[data-orders], #orders'))) {
          markMount();
        }
      });
      [...m.removedNodes].forEach((n) => {
        if (isOrdersContainer(n) || (n.querySelector && n.querySelector('[data-partial="orders"], table[data-orders], #orders'))) {
          markUnmount();
        }
      });
    }
  });
  try { obs.observe(document.body, { childList: true, subtree: true }); } catch (_) {}

  // Also fire once on first discoverable mount (e.g., SSR or immediate DOM)
  queueMicrotask(() => {
    const first = document.querySelector('[data-partial="orders"], table[data-orders], #orders, .orders-partial');
    if (first) markMount();
  });

  // ---- Anchor 3/4: openEditModal + defaults ----
  // Try common namespaces; adjust here if your code uses another name.
  // e.g., window.OrdersEdit.openEditModal(order)
  safe('OrdersEdit.openEditModal', (orig) => function wrappedOpenEdit(order, ...rest) {
    try {
      const orderId = order?.orderNumber || order?.id;
      post('edit:open', { orderId });
    } catch(_) {}
    const res = orig.apply(this, [order, ...rest]);
    return res;
  });

  // Hook a common "apply defaults" function if present
  // e.g., OrdersEdit.applyMoneyDefaults(order) OR OrdersEdit.prefillEditForm(order)
  const defaultsHooks = [
    'OrdersEdit.applyMoneyDefaults',
    'OrdersEdit.prefillEditForm',
    'OrdersEdit.fillEditFields'
  ];
  defaultsHooks.forEach((name) => {
    safe(name, (orig) => function wrappedDefaults(order, ...rest) {
      const r = orig.apply(this, [order, ...rest]);
      try {
        const orderId = order?.orderNumber || order?.id;
        // Try to read current inputs if available
        const totalCents   = (document.querySelector('#edit-total')?.value ?? '').trim();
        const depositCents = (document.querySelector('#edit-deposit')?.value ?? '').trim();
        const currency     = (document.querySelector('#edit-currency')?.value ?? '').trim();
        post('edit:defaults', { orderId, totalCents, depositCents, currency, source: '(filled)' });
      } catch(_) {}
      return r;
    });
  });

  // ---- Anchor 5: PATCH success → patch:ok ----
  // If you have a dedicated save function, wrap it; otherwise intercept fetch.
  const saveHooks = [
    'OrdersEdit.saveEdit',
    'OrdersEdit.saveOrderPatch',
    'OrdersEdit.submitEdit'
  ];
  let saveHooked = false;
  saveHooks.forEach((name) => {
    const h = safe(name, (orig) => async function wrappedSave(...args) {
      const result = await orig.apply(this, args);
      try {
        // Try to extract the payload if your function keeps it in scope
        const orderId = (args[0]?.orderId) || document.querySelector('#edit-order-id')?.value || null;
        const totalCents   = (document.querySelector('#edit-total')?.value ?? '').trim();
        const depositCents = (document.querySelector('#edit-deposit')?.value ?? '').trim();
        const currency     = (document.querySelector('#edit-currency')?.value ?? '').trim();
        const status       = (document.querySelector('#edit-status')?.value ?? '').trim();
        const driverId     = (document.querySelector('#edit-driver')?.dataset?.driverId
                              || document.querySelector('#edit-driver-id')?.value || '').trim();
        post('patch:ok', { orderId, sent:{ totalCents, depositCents, currency, status, driverId } });
      } catch(_) {}
      return result;
    });
    if (h) saveHooked = true;
  });

  // If no dedicated save hook was found, intercept fetch() for PATCH /api/admin/orders/:id
  if (!saveHooked) {
    const _fetch = window.fetch;
    window.fetch = async function wrappedFetch(input, init = {}) {
      const url = typeof input === 'string' ? input : input?.url || '';
      const method = (init?.method || 'GET').toUpperCase();
      const isPatch = method === 'PATCH' && /\/api\/admin\/orders\//.test(url);
      let bodyObj = null;
      if (isPatch && init?.body) {
        try { bodyObj = JSON.parse(init.body); } catch (_) {}
      }
      const resp = await _fetch.apply(this, arguments);
      if (isPatch && resp.ok) {
        const orderId = url.split('/').pop();
        const payload = bodyObj || {};
        post('patch:ok', { orderId, sent: payload });
      }
      return resp;
    };
  }

  // ---- Anchor 6: after inline row UI update ----
  // Try common row update functions
  const rowHooks = [
    'OrdersEdit.updateOrderRowUI',
    'OrdersEdit.refreshRow',
    'OrdersEdit.applyRowPatch'
  ];
  rowHooks.forEach((name) => {
    safe(name, (orig) => function wrappedUpdateRow(tr, data, ...rest) {
      const r = orig.apply(this, [tr, data, ...rest]);
      try { post('row:update:ui', window.__ordersTrace.snapRow(tr)); } catch(_) {}
      return r;
    });
  });

  // Fallback: small observer to catch cell text changes and emit once per tick
  let rowEmitScheduled = false, lastEmitAt = 0;
  const rowObs = new MutationObserver(() => {
    if (rowEmitScheduled) return;
    rowEmitScheduled = true;
    queueMicrotask(() => {
      rowEmitScheduled = false;
      const tr = document.querySelector('table [data-order-id].editing, table [data-order-id].just-saved');
      if (!tr) return;
      const nowTs = Date.now();
      if (nowTs - lastEmitAt < 250) return;
      lastEmitAt = nowTs;
      post('row:update:ui', window.__ordersTrace.snapRow(tr));
    });
  });
  try { rowObs.observe(document.body, { subtree: true, childList: true, characterData: true } ); } catch(_) {}

  // ---- Anchor 7: View modal filled ----
  const viewHooks = [
    'OrdersEdit.openViewModal',
    'OrdersEdit.showView',
    'OrdersEdit.viewOrder'
  ];
  viewHooks.forEach((name) => {
    safe(name, (orig) => function wrappedView(order, ...rest) {
      const res = orig.apply(this, [order, ...rest]);
      try {
        const orderId = order?.orderNumber || order?.id;
        const fields = ['status','total','deposit','currency'];
        const fieldsPresent = fields.every(id => !!document.querySelector(`#view-${id}`));
        const itemsCount = (order?.items || []).length;
        post('view:open:filled', { orderId, fieldsPresent, itemsCount });
      } catch(_) {}
      return res;
    });
  });

  // Expose a quick sanity ping
  post('probes:ready', { mode: 'orders-edit', hooked:{ saveHooked } });
})();
// probe layer – additive only
(() => {
  "use strict";

  // ---------- tiny DOM helpers ----------
  const $  = (sel, root = document) => root.querySelector(sel);
  const by = (id) => document.getElementById(id);
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);
  const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const ALLOWED = ["Pending", "Processing", "Delivered", "Cancelled"];
  const CACHE_KEY = "ordersOverlayCache";

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
  function moneyString(cents, currency) {
    if (cents == null || !Number.isFinite(Number(cents))) return "";
    const amt = Number(cents) / 100;
    try { return new Intl.NumberFormat(undefined,{style:"currency",currency:currency||"KES"}).format(amt); }
    catch { return `${currency||"KES"} ${amt.toLocaleString(undefined,{maximumFractionDigits:2})}`; }
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
  function renderItems(tbody, list, currency) {
    if (!tbody) return;
    tbody.innerHTML = "";
    const items = Array.isArray(list) ? list : [];
    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#6b7280">No items</td></tr>`;
      return;
    }
    const add = (html) => { const tr = document.createElement("tr"); tr.innerHTML = html; tbody.appendChild(tr); };
    const m = (n) => {
      const v = Number(n || 0);
      try { return new Intl.NumberFormat(undefined,{style:"currency",currency:currency||"KES"}).format(v); }
      catch { return `${currency||"KES"} ${v.toLocaleString()}`; }
    };
    for (const it of items) {
      const sku   = it.sku ?? it.code ?? it.id ?? "—";
      const name  = it.name ?? it.title ?? it.productName ?? "—";
      const qty   = it.qty ?? it.quantity ?? 1;
      const price = it.price ?? it.unitPrice ?? it.amount ?? 0;
      add(`<td>${sku}</td><td>${name}</td><td>${qty}</td><td>${m(price)}</td>`);
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
    // Prefer exact first-cell match (works even without data attributes)
    const rows = document.querySelectorAll('table tbody tr');
    for (const r of rows) {
      const first = r.querySelector('td');
      if (first && (first.textContent || '').trim() === String(id)) return r;
    }
    return ordersTbody?.querySelector(`tr[data-oid="${CSS.escape(String(id))}"]`);
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

    // Clear money inputs immediately so the next order doesn't show stale values;
    // hydrate will refill from /api/track below.
    if (totalInp)   totalInp.value   = "";
    if (depositInp) depositInp.value = "";
    if (currInp)    currInp.value    = "";

    // do not overwrite previous input; hydrator will populate from /api/track
    openModalShell();

    // kick off hydrator (fetch items & overlay)
    setTimeout(() => hydrateEditModal(id), 30);
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
        if (tCents != null) cells[5].textContent = moneyString(tCents, curr || currInp?.value || "KES");
        row?.setAttribute?.('data-oid', currentId);
        try { row.classList.add('just-saved'); setTimeout(()=>row.classList.remove('just-saved'), 900); } catch {}
      }

      // cache overlay so table re-renders keep values
      cacheOverlay({
        orderId: currentId,
        status,
        driverId: driverVal,
        driverName: driverInp?.value || "",
        notes: note,
        totalCents: tCents,
        depositCents: dCents,
        currency: curr || currInp?.value || "KES",
      });

      // broadcast to other views and our observers
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
  on(cancelBtn, "click", (e) => { e.preventDefault(); closeModalShell(); });
  on(saveBtn,   "click", (e) => { e.preventDefault(); doSave(); });

  // open via action buttons in the table (supports either selector)
  // GUARDED: only hijack if our modal exists; else let original handler run.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="edit-order"], .btn-edit');
    if (!btn) return;

    const modalEl = document.getElementById("orderEditModal");
    const idEl    = document.getElementById("orderEditId");
    if (!modalEl || !idEl) return; // do not preventDefault → allow site’s original JS

    e.preventDefault();

    const oid   = btn.getAttribute("data-oid") || "";
    const tr    = btn.closest("tr");
    const statusText = tr?.querySelectorAll('td')?.[4]?.textContent?.trim() || "";
    openModal({ id: oid, orderNumber: oid, status: statusText });
  }, { capture: true });

  if (typeof window.openOrderEdit !== "function") {
    window.openOrderEdit = (order) => openModal(order || {});
  }

  // =======================================================================
  // FETCH PATCH: inject totalCents/depositCents/currency + robust row update
  // =======================================================================
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

    function updateRowResilient() {
      const ctx = ctxFromModal();
      if (!ctx.orderId) return;

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

    function cacheOverlay(ctx) {
      try {
        const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
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
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      } catch {}
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
            updateRowResilient();
            localStorage.setItem('ordersUpdatedAt', String(Date.now()));
            window.postMessage?.({ type:'orders-updated', orderId: ctx.orderId }, '*');
          }
        } catch {}
        return res;
      };
    }
  })();

  // ===========================================================
  // Hydrator: fetch /api/track on open to populate Edit / View
  // ===========================================================
  async function fetchOrderFromTrack({ orderId, phone, email }) {
    if (!orderId || (!phone && !email)) return null;
    const params = new URLSearchParams();
    if (phone) params.set("phone", phone);
    if (email && !phone) params.set("email", email);
    params.set("order", orderId);

    const url = `/api/track?${params.toString()}`;
    try {
      const r = await fetch(url, { credentials:"include" });
      const j = await r.json();
      return Array.isArray(j?.orders) ? (j.orders[0] || null) : null;
    } catch { return null; }
  }

  function getRowContext(orderId) {
    const rows = document.querySelectorAll('table tbody tr');
    let row = null;
    for (const r of rows) {
      const first = r.querySelector('td');
      if (first && (first.textContent || '').trim() === String(orderId)) { row = r; break; }
    }
    const ctx = { phone:"", email:"" };
    if (!row) return ctx;
    const cells = row.querySelectorAll('td');
    ctx.phone = (row.getAttribute("data-phone") || cells?.[2]?.textContent || "").trim();
    ctx.email = (row.getAttribute("data-email") || cells?.[3]?.textContent || "").trim();
    return ctx;
  }

  async function hydrateEditModal(orderId) {
    const idEl = document.getElementById("orderEditId");
    if (!idEl || idEl.value !== String(orderId)) return;

    const { phone, email } = getRowContext(orderId);
    if (itemsBody) itemsBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#9ca3af">Loading…</td></tr>`;

    const data = await fetchOrderFromTrack({ orderId, phone, email });
    if (!data) { if (itemsBody) itemsBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#ef4444">Failed to load</td></tr>`; return; }

    // Fill status/notes/money/currency if inputs exist (default only if inputs are empty)
    if (statusSel && data.status) statusSel.value = statusSel.value || data.status;
    if (notesEl && typeof data.notes === "string") { if (!notesEl.value) notesEl.value = data.notes; }
    if (totalInp && (totalInp.value === "" || totalInp.value == null) && data.total != null) totalInp.value = String(data.total);
    if (depositInp && (depositInp.value === "" || depositInp.value == null) && data.deposit != null) depositInp.value = String(data.deposit);
    if (currInp && (currInp.value === "" || currInp.value == null) && data.currency) currInp.value = data.currency;

    renderItems(itemsBody, data.items || data.cart || [], data.currency);
  }

  async function openViewAndHydrate(btn) {
    const tr = btn.closest("tr");
    const orderId = (tr?.querySelector('td')?.textContent || btn.getAttribute("data-oid") || "").trim();
    if (!orderId) return;

    const { phone, email } = getRowContext(orderId);
    const data = await fetchOrderFromTrack({ orderId, phone, email });
    if (!data) return;

    // Try common view modal selectors
    const view = document.getElementById("orderViewModal") || document.querySelector(".order-view-modal, #order-view");
    if (view) {
      const set = (sel, val) => { const el = view.querySelector(sel); if (el && val != null) el.textContent = String(val); };
      set('[data-field="orderNumber"], .js-order-number', data.orderNumber);
      set('[data-field="status"], .js-order-status', data.status);
      set('[data-field="phone"], .js-order-phone', data.phone || phone);
      set('[data-field="email"], .js-order-email', data.email || email);
      set('[data-field="total"], .js-order-total', moneyString((data.total ?? 0)*100, data.currency));
      const vBody = view.querySelector("#orderViewItemsBody, .js-view-items-body, tbody");
      if (vBody) renderItems(vBody, data.items || data.cart || [], data.currency);
    }
  }

  // Bind click on "View" buttons once
  document.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="view-order"], .btn-view');
    if (!btn) return;
    openViewAndHydrate(btn);
  }, { capture: true });

  // ===========================================================
  // Cache + Table re-render resilience (persist across partials)
  // ===========================================================
  function cacheOverlay(obj) {
    if (!obj || !obj.orderId) return;
    try {
      const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      cache[obj.orderId] = { ...cache[obj.orderId], ...obj, ts: Date.now() };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {}
  }
  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); }
    catch { return {}; }
  }
  function applyCacheToTable() {
    const cache = readCache();
    if (!cache || !Object.keys(cache).length) return;
    const rows = document.querySelectorAll('table tbody tr');
    for (const r of rows) {
      const idCell = r.querySelector('td');
      if (!idCell) continue;
      const oid = (idCell.textContent || '').trim();
      const c = cache[oid];
      if (!c) continue;

      const cells = r.querySelectorAll('td');
      // Status at col 5 (index 4), Total at col 6 (index 5) typical layout
      if (c.status && cells[4]) cells[4].textContent = c.status;
      if (cells[5] && c.totalCents != null) cells[5].textContent = moneyString(c.totalCents, c.currency);
      r.setAttribute('data-oid', oid);
    }
  }
  // Observe tbody for re-renders and re-apply cache
  (function observeTable() {
    const tbody = document.querySelector('table tbody') || ordersTbody;
    if (!tbody) return;
    const obs = new MutationObserver(debounce(applyCacheToTable, 30));
    try { obs.observe(tbody, { childList: true, subtree: true }); } catch {}
    // initial pass
    applyCacheToTable();
  })();

  // Re-apply cache on storage events (multi-tab) and on nav/hash changes
  window.addEventListener('storage', (e) => { if (e.key === CACHE_KEY) applyCacheToTable(); });
  window.addEventListener('hashchange', () => setTimeout(applyCacheToTable, 60));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(applyCacheToTable, 60); });
  // EXTRA lifecycle hooks to keep inline values sticky across SPA/tab changes
  on(window, "pageshow", () => setTimeout(applyCacheToTable, 30));
  on(window, "focus",    () => setTimeout(applyCacheToTable, 30));
  on(window, "popstate", () => setTimeout(applyCacheToTable, 60));

  // =====================================================================
  // Minimal UI refresh hardener — respond to our own 'orders-updated' ping
  // =====================================================================
  (() => {
    function robustFindRowByOrderId(orderId) {
      if (!orderId) return null;
      let row = document.querySelector(`tr[data-oid="${CSS.escape(orderId)}"]`)
            || document.querySelector(`tr[data-order-id="${CSS.escape(orderId)}"]`);
      if (row) return row;
      const rows = document.querySelectorAll('table tbody tr');
      for (const r of rows) {
        const cells = r.querySelectorAll('td, [data-col]');
        for (const c of cells) {
          if ((c.textContent || '').trim().includes(orderId)) return r;
        }
      }
      return null;
    }
    function writeCell(row, selList, text) {
      if (!row || text == null) return;
      for (const sel of selList) {
        const el = row.querySelector(sel);
        if (el) { el.textContent = String(text); return; }
      }
    }
    function fmtMoney(cents, currency) {
      if (!(Number.isFinite(cents))) return '';
      const amt = cents / 100;
      return `${currency || 'KES'} ${amt.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:2})}`;
    }
    function updateRowFromModal() {
      const orderId = (document.getElementById('orderEditId')?.value || '').trim();
      if (!orderId) return;
      const row = robustFindRowByOrderId(orderId);
      if (!row) return;

      const status   = (document.getElementById('orderEditStatus')?.value || '').trim();
      const driverNm = (document.getElementById('orderEditDriverInput')?.value || '').trim();
      const currency = (document.getElementById('orderEditCurrencyInput')?.value || 'KES').trim();

      const toCents = (v) => {
        if (!v) return null;
        const n = Number(String(v).replace(/[^\d.]/g,''));
        return Number.isFinite(n) ? Math.round(n * 100) : null;
      };
      const totalCts   = toCents(document.getElementById('orderEditTotalInput')?.value);
      const depositCts = toCents(document.getElementById('orderEditDepositInput')?.value);

      if (status)   writeCell(row, ['[data-col="status"]','.col-status'], status);
      if (driverNm) writeCell(row, ['[data-col="driver"]','.col-driver'], driverNm);
      if (totalCts!=null)   writeCell(row, ['[data-col="total"]','.col-total'],   fmtMoney(totalCts, currency));
      if (depositCts!=null) writeCell(row, ['[data-col="deposit"]','.col-deposit'], fmtMoney(depositCts, currency));
      writeCell(row, ['[data-col="currency"]','.col-currency'], currency);

      try { row.classList.add('just-saved'); setTimeout(()=>row.classList.remove('just-saved'), 900); } catch {}
    }

    window.addEventListener('message', (e) => {
      if (e?.data?.type === 'orders-updated') {
        requestAnimationFrame(() => setTimeout(() => { updateRowFromModal(); applyCacheToTable(); }, 60));
      }
    });
  })();

})();
