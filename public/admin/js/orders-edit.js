// /public/admin/js/orders-edit.js
// Edit Order modal — combobox-only driver picker (markup lives in dashboard.html)
//
// Save order with robust fallbacks:
// 1) Try split endpoints:
//      PUT  /api/admin/orders/:id/status        { status, note }
//      PUT  /api/admin/orders/:id/assign-driver { driverUserId }
// 2) If either is 404 → immediately do legacy PATCH:
//      PATCH /api/admin/orders/:id { status, note, driverId }
//    If that fails, retry legacy-alt keys:
//      PATCH /api/admin/orders/:id { status, notes, driver_id }

(() => {
  "use strict";

  // ---------- Tiny helpers ----------
  const $  = (sel, root = document) => root.querySelector(sel);
  const by = (id) => document.getElementById(id);
  const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const ALLOWED = ["Pending", "Processing", "Delivered", "Cancelled"];

  // ---------- Modal elements ----------
  const modal     = by("orderEditModal") || by("orderEditDialog");
  const saveBtn   = by("orderSaveBtn");
  const cancelBtn = by("orderCancelBtn");

  const idInput   = by("orderEditId");
  const statusSel = by("orderEditStatus");
  const notesEl   = by("orderEditNotes");

  // Driver combobox (legacy)
  const driverIdH   = by("orderEditDriverId");
  const driverInp   = by("orderEditDriverInput");
  const driverList  = by("orderEditDriverList");
  const driverClear = by("orderEditDriverClear");

  // Money & items (display only)
  const totalInp   = by("orderEditTotalInput");
  const depositInp = by("orderEditDepositInput");
  const currInp    = by("orderEditCurrencyInput");
  const itemsBody  = by("orderEditItemsBody");

  const ordersTbody = by("ordersTbody"); // for inline row refresh
  let currentId = null;

  // ---------- UI utilities ----------
  function setSaving(on) {
    if (!saveBtn) return;
    saveBtn.disabled = !!on;
    saveBtn.textContent = on ? "Saving…" : "Save";
  }
  function isDialog(el) { return el && typeof el.showModal === "function"; }
  function openModalShell() {
    if (!modal) return;
    if (isDialog(modal)) { try { modal.showModal(); } catch { modal.setAttribute("open","true"); } }
    else { modal.style.display = "block"; modal.setAttribute("aria-hidden","false"); }
  }
  function closeModalShell() {
    if (!modal) return;
    if (isDialog(modal)) { try { modal.close(); } catch { modal.removeAttribute("open"); } }
    else { modal.style.display = "none"; modal.setAttribute("aria-hidden","true"); }
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
  function parseKES(s) {
    if (typeof s === "number") return s;
    if (!s) return 0;
    const n = String(s).replace(/[^\d.,-]/g, "").replace(/,/g, "");
    const f = parseFloat(n);
    return Number.isFinite(f) ? f : 0;
  }
  function rowById(id) {
    return ordersTbody?.querySelector(`tr[data-oid="${CSS.escape(String(id))}"]`);
  }
  function readRowFields(id) {
    const row = rowById(id);
    if (!row) return {};
    const phone  = row.querySelector('[data-col="phone"]')?.textContent?.trim()  || "";
    const email  = row.querySelector('[data-col="email"]')?.textContent?.trim()  || "";
    const status = row.querySelector('[data-col="status"]')?.textContent?.trim() || "Pending";
    const total  = parseKES(row.children?.[5]?.textContent || "");
    const driverName = row.querySelector('[data-col="driver"], .col-driver')?.textContent?.trim() || "";
    return { phone, email, status, total, driverName };
  }

  // ---------- Track hydration (optional) ----------
  async function hydrateFromTrack(orderId, phone, email) {
    const variants = [];
    if (phone) {
      const p = String(phone).trim();
      variants.push(p, p.replace(/^\+/, ""), p.replace(/^\+?254/, "0"));
    }
    const attempts = [];
    for (const ph of variants) attempts.push({ ph, ord: orderId });
    for (const ph of variants) attempts.push({ ph, ord: null });
    if (!variants.length) attempts.push({ ph: "", ord: orderId });

    for (const at of attempts) {
      try {
        const qs = new URLSearchParams();
        if (at.ph)  qs.set("phone", at.ph);
        if (at.ord) qs.set("order", String(at.ord));
        qs.set("page", "1"); qs.set("per", "5");
        const headers = email ? { "X-WS-Email": email } : undefined;
        const res = await fetch(`/api/track?${qs.toString()}`, { headers });
        if (!res.ok) continue;
        const data = await res.json().catch(() => ({}));
        const list = Array.isArray(data?.orders) ? data.orders : [];
        if (!list.length) continue;
        const hit = list.find(o => String(o.orderNumber || o.id) === String(orderId)) || list[0];
        if (hit) return hit;
      } catch {}
    }
    return null;
  }

  // ---------- Driver combobox ----------
  async function queryDrivers(q) {
    const url = `/api/admin/users?type=Driver${q ? `&q=${encodeURIComponent(q)}` : ""}`;
    try {
      const r = await fetch(url);
      const data = await r.json().catch(() => ({}));
      return Array.isArray(data?.users) ? data.users : [];
    } catch { return []; }
  }
  function resetDriver(id = "", name = "") {
    if (driverIdH)  driverIdH.value = id ? String(id) : "";
    if (driverInp)  driverInp.value = name || "";
    if (driverList) driverList.innerHTML = "";
  }
  function getDriverPayload() {
    const raw = (driverIdH?.value ?? "").trim();
    if (raw === "") return { ok: true, value: null };
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) return { ok: false, error: "Driver ID must be a positive integer." };
    return { ok: true, value: n };
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

  // ---------- Items table (display only) ----------
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

  // ---------- Modal open ----------
  async function openModal(orderLike) {
    const id = orderLike?.id || orderLike?.orderNumber;
    if (!id) return alert("Missing order id");
    currentId = id;
    if (idInput) idInput.value = id;

    const row = readRowFields(id);
    buildStatusOptions(orderLike.status || row.status);
    resetDriver("", orderLike.driverName || row.driverName || "");

    if (totalInp)   totalInp.value   = String(row.total || 0);
    if (depositInp) depositInp.value = String(depositInp.value || 0);
    if (currInp)    currInp.value    = currInp.value || "KES";

    const fromTrack = await hydrateFromTrack(id, orderLike.phone || row.phone, orderLike.email || row.email);
    if (fromTrack) {
      if (typeof fromTrack.total === "number" && totalInp) totalInp.value = String(fromTrack.total);
      if (fromTrack.currency && currInp) currInp.value = fromTrack.currency;
      fillItemsTable(fromTrack.items || fromTrack.cart || [], currInp?.value || "KES");
    } else {
      fillItemsTable([], currInp?.value || "KES");
    }

    openModalShell();
  }

  // ---------- Save (split + immediate legacy fallback on 404) ----------
  async function putJSON(url, body) {
    return fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  }
  async function patchJSON(url, body) {
    return fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  }
  async function readText(r) { try { return await r.text(); } catch { return ""; } }

  async function tryLegacyPATCH(id, note, driverVal, status) {
    // First legacy shape
    let r = await patchJSON(`/api/admin/orders/${encodeURIComponent(id)}`, {
      status,
      note,
      driverId: driverVal ?? null
    });
    if (r.ok) return true;

    console.warn("[orders-edit] legacy A failed:", r.status, await readText(r));

    // Second legacy shape
    r = await patchJSON(`/api/admin/orders/${encodeURIComponent(id)}`, {
      status,
      notes: note,
      driver_id: driverVal ?? null
    });
    if (r.ok) return true;

    console.warn("[orders-edit] legacy B failed:", r.status, await readText(r));
    return false;
  }

  async function doSave() {
    if (!currentId) return;
    const status = statusSel?.value || "Pending";
    if (!ALLOWED.includes(status)) return alert("Please choose a valid status.");

    const drv = getDriverPayload();
    if (!drv.ok) return alert(drv.error || "Invalid driver");

    const note = notesEl?.value?.trim() || "";
    setSaving(true);

    try {
      // 1) Try split endpoints
      let needsLegacy = false;

      // Status route
      try {
        const rs = await putJSON(`/api/admin/orders/${encodeURIComponent(currentId)}/status`, { status, note });
        if (rs.status === 404) {
          needsLegacy = true;
          console.info("[orders-edit] /status 404 → using legacy PATCH");
        } else if (!rs.ok) {
          console.warn("[orders-edit] status route failed:", rs.status, await readText(rs));
          needsLegacy = true;
        }
      } catch (e) {
        console.warn("[orders-edit] status route error:", e);
        needsLegacy = true;
      }

      // Assign-driver route (only if a driver was selected)
      if (!needsLegacy && drv.value !== null) {
        try {
          const rd = await putJSON(`/api/admin/orders/${encodeURIComponent(currentId)}/assign-driver`, { driverUserId: Number(drv.value) });
          if (rd.status === 404) {
            needsLegacy = true;
            console.info("[orders-edit] /assign-driver 404 → using legacy PATCH");
          } else if (!rd.ok) {
            console.warn("[orders-edit] assign-driver failed:", rd.status, await readText(rd));
            needsLegacy = true;
          }
        } catch (e) {
          console.warn("[orders-edit] assign-driver error:", e);
          needsLegacy = true;
        }
      }

      // 2) Immediate legacy fallback if required
      if (needsLegacy) {
        const ok = await tryLegacyPATCH(currentId, note, drv.value, status);
        if (!ok) throw new Error("All save attempts failed (split + both legacy shapes).");
      }

      // Minimal inline row refresh
      const row = rowById(currentId);
      row?.querySelector('[data-col="status"]')?.replaceChildren(document.createTextNode(status));

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

  // ---------- Bindings ----------
  cancelBtn?.addEventListener("click", (e) => { e.preventDefault(); closeModalShell(); });
  saveBtn?.addEventListener("click",  (e) => { e.preventDefault(); doSave(); });

  // Open via table buttons
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

    const orderLike = { id: oid, orderNumber: oid, phone, email, status: statusText, driverName };
    openModal(orderLike);
  });

  if (typeof window.openOrderEdit !== "function") {
    window.openOrderEdit = (order) => openModal(order || {});
  }
})();
