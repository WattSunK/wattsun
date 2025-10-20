// public/admin/js/orders-add.js
// Binder for the Admin “Add Order” modal.
// - Opens from any element with data-modal-target="#orderAddModal" or [data-action="add-order"].
// - Opens when the page broadcasts 'admin:create' (we listen on *both* window and document).
// - Opens when the legacy #btnAddOrder_orders button is clicked.
// - If the modal isn't present, fetch and inject the partial from several candidate paths.
// - POSTs to /api/admin/orders (credentials included) on Save.

(function () {
  // Candidate paths — we’ll try each until one returns 200, then remember it
  const PARTIAL_CANDIDATES = [
    "/partials/orders-add.html",
    "/public/partials/orders-add.html",
    "/admin/partials/orders-add.html",
  ];
  let RESOLVED_PARTIAL_URL = null;

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const getDlg  = () => document.getElementById("orderAddModal");
  const getForm = () => document.getElementById("orderAddForm");

  let ensuring = null;

  async function fetchFirstOk(urls) {
    let lastErr;
    for (const url of urls) {
      try {
        const res = await fetch(url, { credentials: "include" });
        if (res.ok) {
          const html = await res.text();
          return { url, html };
        }
        lastErr = new Error(`Fetch ${url} -> ${res.status}`);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("No candidate URL succeeded for orders-add.html");
  }

  async function ensureModal() {
    if (getDlg()) return getDlg();
    if (ensuring) return ensuring;

    ensuring = (async () => {
      if (!RESOLVED_PARTIAL_URL) {
        const { url, html } = await fetchFirstOk(PARTIAL_CANDIDATES);
        RESOLVED_PARTIAL_URL = url;
        const tpl = document.createElement("template");
        tpl.innerHTML = html.trim();
        document.body.appendChild(tpl.content);
      } else {
        const res = await fetch(RESOLVED_PARTIAL_URL, { credentials: "include" });
        if (!res.ok) throw new Error(`Failed to load ${RESOLVED_PARTIAL_URL}: ${res.status}`);
        const html = await res.text();
        const tpl = document.createElement("template");
        tpl.innerHTML = html.trim();
        document.body.appendChild(tpl.content);
      }

      const dlg = getDlg();
      if (!dlg) throw new Error("orders-add.html injected but #orderAddModal not found");
      wireCloseHandlers(dlg);
      return dlg;
    })();

    return ensuring;
  }

  function isDialog(el) { return el && el.nodeName === "DIALOG"; }

  async function showDialog() {
    const dlg = await ensureModal();
    if (!dlg) return;
    if (isDialog(dlg) && typeof dlg.showModal === "function") dlg.showModal();
    else dlg.classList.remove("hidden");
    $("#oa_fullName")?.focus();
    try { document.documentElement.classList.add('ws-modal-open'); document.body.classList.add('ws-modal-open'); } catch {}
  }

  function closeDialog() {
    const dlg = getDlg();
    if (!dlg) return;
    if (isDialog(dlg) && typeof dlg.close === "function") dlg.close();
    else dlg.classList.add("hidden");
    try { document.documentElement.classList.remove('ws-modal-open'); document.body.classList.remove('ws-modal-open'); } catch {}
  }

  function toast(msg, type = "info") {
    if (typeof window.toast === "function") return window.toast(msg, type);
    console.log(`[${type}] ${msg}`);
  }

  function toCents(v) {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s) return null;
    const clean = s.replace(/[_,\s,]/g, "");
    const n = Number(clean);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n);
  }

  function collectItems() {
    const rows = $$("#oa_itemsBody tr");
    const items = [];
    for (const r of rows) {
      const sku = $(".oa_item_sku", r)?.value.trim();
      const qty = Number($(".oa_item_qty", r)?.value || 0);
      if (!sku && !qty) continue;
      if (!sku || !Number.isFinite(qty) || qty <= 0) continue;
      items.push({ sku, qty });
    }
    return items;
  }

  function addItemRow() {
    const body = $("#oa_itemsBody");
    if (!body) return;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" class="oa_item_sku" placeholder="SKU" /></td>
      <td><input type="number" class="oa_item_qty" min="1" value="1" /></td>
      <td><button class="btn small ghost oa_row_remove" type="button">Remove</button></td>
    `;
    body.appendChild(tr);
  }

  async function handleSubmit(e) {
    e?.preventDefault?.();
    await ensureModal();

    const fullName     = $("#oa_fullName")?.value.trim();
    const phone        = $("#oa_phone")?.value.trim();
    const email        = $("#oa_email")?.value.trim();
    const status       = $("#oa_status")?.value || "Pending";
    const currency     = $("#oa_currency")?.value || "KES";
    const totalCents   = toCents($("#oa_totalCents")?.value);
    const depositCents = toCents($("#oa_depositCents")?.value);
    const notes        = $("#oa_notes")?.value.trim();
    const items        = collectItems();

    if (!fullName) return toast("Customer name is required.", "error");
    if (!phone)    return toast("Phone is required.", "error");

    const payload = {
      fullName,
      phone,
      email: email || undefined,
      status,
      currency,
      totalCents:   totalCents   ?? undefined,
      depositCents: depositCents ?? undefined,
      notes: notes || undefined,
      items: items.length ? items : undefined,
    };

    try {
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => "HTTP " + res.status));
      const data = await res.json().catch(() => ({ success: true }));
      if (!data?.success) throw new Error("Order create failed");
      toast("Order created.", "success");
      closeDialog();

      if (typeof window.__WS_ORDERS_FORCE_BOOT === "function") {
        window.__WS_ORDERS_FORCE_BOOT();
      } else {
        window.dispatchEvent(new CustomEvent("orders:reload"));
      }
    } catch (err) {
      console.error("Add Order failed:", err);
      toast(`Create failed: ${err.message || err}`, "error");
    }
  }

  function wireCloseHandlers(dialogEl) {
    dialogEl.addEventListener("click", (e) => {
      if (e.target && (e.target === dialogEl || e.target.hasAttribute("data-oa-close"))) {
        e.preventDefault();
        closeDialog();
      }
    });
  }

  function wire() {
    // Openers via attributes and legacy button id
    document.addEventListener("click", async (e) => {
      const el = e.target instanceof Element ? e.target : null;
      if (!el) return;

      const opener =
        el.closest('[data-modal-target="#orderAddModal"]') ||
        el.closest('[data-action="add-order"]') ||
        el.closest('#btnAddOrder_orders'); // legacy id in orders.html

      if (opener) {
        e.preventDefault();
        await showDialog();
        return;
      }

      if (el.classList.contains("oa_row_remove")) {
        e.preventDefault();
        const tr = el.closest("tr");
        tr?.parentElement?.removeChild(tr);
        return;
      }

      if (el.id === "oa_addRow") {
        e.preventDefault();
        addItemRow();
        return;
      }
    });

    // Submit buttons / forms
    document.addEventListener("click", (e) => {
      const t = e.target instanceof Element ? e.target : null;
      if (t && t.id === "oa_submit") {
        e.preventDefault();
        handleSubmit(e);
      }
    });

    document.addEventListener("submit", (e) => {
      const form = e.target;
      if (form && form.id === "orderAddForm") {
        e.preventDefault();
        handleSubmit(e);
      }
    });

    // ESC to close
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const dlg = getDlg();
      if (!dlg) return;
      if (isDialog(dlg) && typeof dlg.close === "function") dlg.close();
      else dlg.classList.add("hidden");
      try { document.documentElement.classList.remove('ws-modal-open'); document.body.classList.remove('ws-modal-open'); } catch {}
    });

    // Honor the broadcast used by orders.html
    const onCreate = (e) => {
      if (e?.detail?.type === "order") showDialog();
    };
    window.addEventListener("admin:create", onCreate);
    document.addEventListener("admin:create", onCreate);

    // expose a tiny API
    window.wattsunOrdersAdd = {
      open: showDialog,
      close: closeDialog,
      submit: handleSubmit,
      ensure: ensureModal,
    };
  }

  if (document.readyState !== "loading") wire();
  else document.addEventListener("DOMContentLoaded", wire);
})();
