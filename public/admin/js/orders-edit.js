/* Orders — View & Edit modal binder (admin.css classes, robust fetch, money units) */
(() => {
  const VER = "20250915-06p"; // publish tag

  // ---------------------------------
  // Short helpers
  // ---------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);

  const money = (units, currency = "KES", locale = "en-KE") => {
    if (units == null || units === "") return "—";
    const n = Number(units);
    if (!Number.isFinite(n)) return String(units);
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(n);
  };

  const fromCents = (c) => (c == null || c === "" ? null : Number(c) / 100);
  const toCents   = (u) => (u == null || u === "" ? null : Math.round(Number(u) * 100));

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

  async function getOrder(id) {
    if (!id) return null;
    if (window.wattsunData && typeof wattsunData.getOrder === "function") {
      return wattsunData.getOrder(id);
    }
    return api("GET", `/api/orders/${encodeURIComponent(id)}`);
  }

  async function updateOrder(id, patch) {
    if (window.wattsunData && typeof wattsunData.updateOrder === "function") {
      return wattsunData.updateOrder(id, patch);
    }
    return api("PATCH", `/api/orders/${encodeURIComponent(id)}`, patch);
  }

  // ---------------------------------
  // Ensure modal HTML exists once
  // ---------------------------------
  async function ensureOrdersModalLoadedOnce() {
    if (document.querySelector("#orderEditModal") && document.querySelector("#orderViewModal")) return;

    const res = await fetch(`/partials/orders-modal.html?v=${encodeURIComponent(VER)}`, {
      credentials: "same-origin"
    });
    if (!res.ok) throw new Error(`Failed to load orders-modal.html: ${res.status}`);
    const html = await res.text();

    const wrap = document.createElement("div");
    wrap.innerHTML = html;

    const viewDlg = wrap.querySelector("#orderViewModal");
    const editDlg = wrap.querySelector("#orderEditModal");
    if (viewDlg) document.body.appendChild(viewDlg);
    if (editDlg) document.body.appendChild(editDlg);

    // execute any inline scripts inside fragment (defensive)
    wrap.querySelectorAll("script").forEach(s => {
      const dup = document.createElement("script");
      for (const a of s.attributes) dup.setAttribute(a.name, a.value);
      dup.textContent = s.textContent;
      document.body.appendChild(dup);
      s.remove();
    });
  }

  // ---------------------------------
  // VIEW
  // ---------------------------------
  function fillView(order) {
    const idOrNumber = order.number || order.orderNo || order.id || order.orderId || "—";
    $("#ov-orderNo").textContent = idOrNumber;
    $("#ov-status").textContent  = order.status ?? "—";
    $("#ov-created").textContent = order.createdAt || order.created || "—";
    $("#ov-placed").textContent  = order.placedAt || order.placed || "—";

    $("#ov-customer").textContent = order.customerName || order.customer || "—";
    $("#ov-phone").textContent    = order.phone || "—";
    $("#ov-email").textContent    = order.email || "—";
    $("#ov-address").textContent  = order.address || order.deliveryAddress || "—";

    const curr = order.currency || "KES";
    $("#ov-total").textContent   = money(fromCents(order.totalCents ?? order.total), curr);
    $("#ov-deposit").textContent = money(fromCents(order.depositCents ?? order.deposit), curr);
    $("#ov-currency").textContent = curr;

    // history
    const histBox = $("#ov-history");
    if (Array.isArray(order.history) && order.history.length) {
      histBox.innerHTML = order.history.map(h => {
        const when = h.at || h.date || "";
        const txt  = h.text || h.note || h.status || "";
        return `<div class="history-item"><span class="when">${when}</span> — <span class="txt">${txt}</span></div>`;
      }).join("");
    } else {
      histBox.textContent = "—";
    }

    // items
    const tb = $("#ov-items tbody");
    tb.innerHTML = "";
    const items = Array.isArray(order.items) ? order.items : [];
    for (const it of items) {
      const qty = Number(it.qty ?? it.quantity ?? 0);
      const priceUnits = fromCents(it.priceCents ?? it.price);
      const lineTotal  = (Number(priceUnits) || 0) * qty;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${it.sku ?? ""}</td>
        <td>${it.name ?? ""}</td>
        <td class="num">${qty}</td>
        <td class="num">${money(priceUnits, curr)}</td>
        <td class="num">${money(lineTotal, curr)}</td>
      `;
      tb.appendChild(tr);
    }
  }

  // ---------------------------------
  // EDIT
  // ---------------------------------
  function loadDriversIntoSelect(selectEl, preferred) {
    selectEl.innerHTML = "";
    const drivers = (window.wattsunData && wattsunData.drivers) || [];
    if (Array.isArray(drivers) && drivers.length) {
      for (const d of drivers) {
        const opt = document.createElement("option");
        opt.value = d.id || d.phone || d.name || "";
        opt.textContent = [d.name || "Driver", d.phone ? `(${d.phone})` : ""].join(" ").trim();
        selectEl.appendChild(opt);
      }
    } else {
      const opt = document.createElement("option");
      opt.value = ""; opt.textContent = "—";
      selectEl.appendChild(opt);
    }
    if (preferred) selectEl.value = preferred;
  }

  async function openEdit(order) {
    const dlg = /** @type {HTMLDialogElement} */ ($("#orderEditModal"));
    $("#oe-id").value        = order.id ?? order.orderId ?? order.number ?? "";
    $("#oe-status").value    = order.status || "Pending";
    $("#oe-currency").value  = order.currency || "KES";
    $("#oe-notes").value     = order.notes || order.internalNote || "";

    // drivers
    loadDriversIntoSelect($("#oe-driver"), order.driverId || order.driver);

    // money — show in units
    $("#oe-total").value   = (fromCents(order.totalCents ?? order.total)   ?? 0).toFixed(2);
    $("#oe-deposit").value = (fromCents(order.depositCents ?? order.deposit) ?? 0).toFixed(2);

    if (!dlg.open && typeof dlg.showModal === "function") dlg.showModal();
  }

  async function onSave(e) {
    e?.preventDefault?.();
    const id = $("#oe-id").value;
    const patch = {
      status:   $("#oe-status").value,
      driverId: $("#oe-driver").value || null,
      currency: $("#oe-currency").value,
      totalCents:   toCents($("#oe-total").value),
      depositCents: toCents($("#oe-deposit").value),
      notes:   $("#oe-notes").value
    };

    const btn = $("#oe-save");
    btn.disabled = true;
    try {
      await updateOrder(id, patch);
      if (typeof window.toast === "function") toast("Order saved", "success");
      window.dispatchEvent(new CustomEvent("orders:saved", { detail: { id, patch } }));
      /** @type {HTMLDialogElement} */ ($("#orderEditModal")).close("save");
    } catch (err) {
      console.error("[orders-edit] save failed", err);
      if (typeof window.toast === "function") toast("Save failed", "error");
    } finally {
      btn.disabled = false;
    }
  }

  // ---------------------------------
  // Event wiring
  // ---------------------------------
  window.addEventListener("orders:view", async (ev) => {
    try {
      await ensureOrdersModalLoadedOnce();
      let order = ev.detail?.order || ev.detail || {};
      if (!order.items && (order.id || order.orderId || order.number)) {
        // Only an ID was provided → fetch full record
        const id = order.id || order.orderId || order.number;
        order = await getOrder(id) || order;
      }
      fillView(order);
      /** @type {HTMLDialogElement} */ ($("#orderViewModal")).showModal?.();
    } catch (e) { console.error(e); }
  });

  window.addEventListener("orders:edit", async (ev) => {
    try {
      await ensureOrdersModalLoadedOnce();
      let order = ev.detail?.order || ev.detail || {};
      if (!order.status && (order.id || order.orderId || order.number)) {
        const id = order.id || order.orderId || order.number;
        order = await getOrder(id) || order;
      }
      await openEdit(order);
    } catch (e) { console.error(e); }
  });

  // Save
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.id === "oe-save") onSave(e);
  }, true);
})();
