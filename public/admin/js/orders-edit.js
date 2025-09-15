/* Orders — View & Edit modal binder (polished) */
(() => {
  const VER = "20250915-05p"; // polished
  console.debug("[orders-edit] loader active", VER);

  // -------------------------------
  // Utilities
  // -------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const money = (units, currency = "KES", locale = "en-KE") => {
    if (units == null || units === "") return "—";
    const n = Number(units);
    if (!Number.isFinite(n)) return String(units);
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  };

  // convert cents (number/integer) => units (number)
  const fromCents = (cents) => (cents == null ? null : Number(cents) / 100);
  const toCents   = (units) => (units == null || units === "" ? null : Math.round(Number(units) * 100));

  // Safe fetch wrapper
  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: body ? JSON.stringify(body) : null
    });
    if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${res.statusText}`);
    return res.json().catch(() => ({}));
  }

  // If your app exposes a data-adapter, we’ll use it. Otherwise fallback to REST.
  async function updateOrder(id, patch) {
    if (window.wattsunData && typeof wattsunData.updateOrder === "function") {
      return wattsunData.updateOrder(id, patch);
    }
    // Fallback REST; adjust path if your API differs
    return api("PATCH", `/api/orders/${encodeURIComponent(id)}`, patch);
  }

  // -------------------------------
  // Ensure modal HTML exists
  // -------------------------------
  async function ensureOrdersModalLoadedOnce() {
    // If already present, done
    if (document.querySelector("#orderEditModal") && document.querySelector("#orderViewModal")) return;

    console.debug("[orders-edit] no modal present — injecting new modal…");
    const res = await fetch(`/partials/orders-modal.html?v=${encodeURIComponent(VER)}`, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`Failed to load orders-modal.html: ${res.status}`);
    const html = await res.text();

    const wrap = document.createElement("div");
    wrap.innerHTML = html;

    const viewDlg = wrap.querySelector("#orderViewModal");
    const editDlg = wrap.querySelector("#orderEditModal");
    if (viewDlg) document.body.appendChild(viewDlg);
    if (editDlg) document.body.appendChild(editDlg);

    // execute any inline scripts that may be present (defensive)
    wrap.querySelectorAll("script").forEach(s => {
      const dup = document.createElement("script");
      for (const a of s.attributes) dup.setAttribute(a.name, a.value);
      dup.textContent = s.textContent;
      document.body.appendChild(dup);
      s.remove();
    });

    console.debug("[orders-edit] modal injected from /partials/orders-modal.html");
  }

  // -------------------------------
  // VIEW — populate UI
  // -------------------------------
  function fillView(order) {
    $("#ov-orderNo").textContent = order.number || order.orderNo || order.id || "—";
    $("#ov-status").textContent  = order.status || "—";
    $("#ov-created").textContent = order.created || order.createdAt || "—";
    $("#ov-placed").textContent  = order.placed || order.placedAt || "—";

    $("#ov-customer").textContent = order.customerName || order.customer || "—";
    $("#ov-phone").textContent    = order.phone || "—";
    $("#ov-email").textContent    = order.email || "—";
    $("#ov-address").textContent  = order.address || order.deliveryAddress || "—";

    const currency = order.currency || "KES";
    $("#ov-total").textContent   = money(fromCents(order.totalCents ?? order.total), currency);
    $("#ov-deposit").textContent = money(fromCents(order.depositCents ?? order.deposit), currency);
    $("#ov-currency").textContent = currency;

    // History (if provided; otherwise leave "—")
    const histBox = $("#ov-history");
    if (Array.isArray(order.history) && order.history.length) {
      histBox.innerHTML = order.history.map(h => {
        const when = h.at || h.date || "";
        const txt  = h.text || h.note || h.status || "";
        return `<div class="history-line"><span class="when">${when}</span><span class="txt">${txt}</span></div>`;
      }).join("");
    }

    // Items
    const tb = $("#ov-items tbody");
    tb.innerHTML = "";
    const items = Array.isArray(order.items) ? order.items : [];
    for (const it of items) {
      const qty = Number(it.qty ?? it.quantity ?? 0);
      const priceUnits = fromCents(it.priceCents ?? it.price);
      const lineTotal  = priceUnits * qty;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${it.sku ?? ""}</td>
        <td>${it.name ?? ""}</td>
        <td class="num">${qty}</td>
        <td class="num">${money(priceUnits, currency)}</td>
        <td class="num">${money(lineTotal, currency)}</td>
      `;
      tb.appendChild(tr);
    }
  }

  // -------------------------------
  // EDIT — open + load data → save
  // -------------------------------
  async function openEdit(order) {
    const dlg = /** @type {HTMLDialogElement} */ ($("#orderEditModal"));
    $("#oe-id").value = order.id ?? order.orderId ?? order.number ?? "";
    $("#oe-status").value   = order.status || "Pending";
    $("#oe-currency").value = order.currency || "KES";
    $("#oe-notes").value    = order.notes || order.internalNote || "";

    // driver list (if present on window or order)
    const driverSel = $("#oe-driver");
    driverSel.innerHTML = "";
    const drivers = (window.wattsunData && wattsunData.drivers) || order.drivers || [];
    if (Array.isArray(drivers) && drivers.length) {
      for (const d of drivers) {
        const opt = document.createElement("option");
        opt.value = d.id || d.phone || d.name || "";
        opt.textContent = `${d.name || "Driver"} ${d.phone ? `(${d.phone})` : ""}`.trim();
        driverSel.appendChild(opt);
      }
    } else {
      const opt = document.createElement("option");
      opt.value = ""; opt.textContent = "—";
      driverSel.appendChild(opt);
    }
    if (order.driverId || order.driver) driverSel.value = order.driverId || order.driver;

    // money: UI uses units (not cents)
    const currency = $("#oe-currency").value;
    $("#oe-total").value   = (fromCents(order.totalCents ?? order.total)   ?? 0).toFixed(2);
    $("#oe-deposit").value = (fromCents(order.depositCents ?? order.deposit) ?? 0).toFixed(2);

    if (!dlg.open && typeof dlg.showModal === "function") dlg.showModal();
  }

  // Save handler
  async function onSave(e) {
    e?.preventDefault?.();
    const dlg = /** @type {HTMLDialogElement} */ ($("#orderEditModal"));
    const id = $("#oe-id").value;

    const patch = {
      status:   $("#oe-status").value,
      driverId: $("#oe-driver").value || null,
      currency: $("#oe-currency").value,
      // send cents to the backend, derived from units typed by the admin
      totalCents:   toCents($("#oe-total").value),
      depositCents: toCents($("#oe-deposit").value),
      notes:   $("#oe-notes").value
    };

    const btn = $("#oe-save");
    btn.disabled = true;
    try {
      await updateOrder(id, patch);
      if (typeof window.toast === "function") toast("Order saved", "success");
      // Let the table know to refresh itself if it listens
      window.dispatchEvent(new CustomEvent("orders:saved", { detail: { id, patch } }));
      dlg.close("save");
    } catch (err) {
      console.error("[orders-edit] save failed", err);
      if (typeof window.toast === "function") toast("Save failed", "error");
    } finally {
      btn.disabled = false;
    }
  }

  // -------------------------------
  // Global entry points
  // -------------------------------
  // Listen to controller “open” events
  window.addEventListener("orders:view", async (ev) => {
    try {
      await ensureOrdersModalLoadedOnce();
      const order = ev.detail?.order || ev.detail || {};
      fillView(order);
      const dlg = /** @type {HTMLDialogElement} */ ($("#orderViewModal"));
      if (!dlg.open && typeof dlg.showModal === "function") dlg.showModal();
    } catch (e) { console.error(e); }
  });

  window.addEventListener("orders:edit", async (ev) => {
    try {
      await ensureOrdersModalLoadedOnce();
      const order = ev.detail?.order || ev.detail || {};
      await openEdit(order);
    } catch (e) { console.error(e); }
  });

  // Wire save once when modal appears
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.id === "oe-save") onSave(e);
  }, true);
})();
