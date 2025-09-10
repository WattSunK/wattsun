// public/admin/js/orders-add.js
// Binder for the Admin “Add Order” modal.
// - Opens from any element with data-modal-target="#orderAddModal" (and also [data-action="add-order"] as a convenience)
// - If the modal isn't present (e.g., SSI include not processed), it fetches and injects /public/partials/orders-add.html
// - Validates required fields, collects optional items (SKU + Qty)
// - POSTs to /api/admin/orders (credentials included)
// - On success: toast → close → refresh list via window.__WS_ORDERS_FORCE_BOOT?.()
// - Works with either <dialog id="orderAddModal"> or <div id="orderAddModal" class="ws-modal hidden">

(function () {
  const PARTIAL_URL = "/public/partials/orders-add.html";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // --- Helpers to always get the latest nodes (after injection) ---
  const getDlg  = () => document.getElementById("orderAddModal");
  const getForm = () => document.getElementById("orderAddForm");

  // Inject the modal partial if it's not already present
  let ensuring = null;
  async function ensureModal() {
    if (getDlg()) return getDlg();
    if (ensuring) return ensuring;

    ensuring = (async () => {
      const res = await fetch(PARTIAL_URL, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load ${PARTIAL_URL}: ${res.status}`);
      const html = await res.text();
      const tpl = document.createElement("template");
      tpl.innerHTML = html.trim();
      document.body.appendChild(tpl.content);
      const dlg = getDlg();
      if (!dlg) throw new Error("orders-add.html injected but #orderAddModal not found");
      wireCloseHandlers(dlg);
      return dlg;
    })();

    return ensuring;
  }

  function isDialog(el) {
    return el && el.nodeName === "DIALOG";
  }

  async function showDialog() {
    const dlg = await ensureModal();
    if (!dlg) return console.warn("orderAddModal not found after ensureModal()");
    if (isDialog(dlg) && typeof dlg.showModal === "function") dlg.showModal();
    else dlg.classList.remove("hidden");
    $("#oa_fullName")?.focus();
  }

  function closeDialog() {
    const dlg = getDlg();
    if (!dlg) return;
    if (isDialog(dlg) && typeof dlg.close === "function") dlg.close();
    else dlg.classList.add("hidden");
  }

  function toast(msg, type = "info") {
    if (typeof window.toast === "function") return window.toast(msg, type);
    alert(msg);
  }

  function normaliseCents(v) {
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
      if (!sku && !qty) continue; // blank row
      if (!sku || !Number.isFinite(qty) || qty <= 0) continue; // skip invalid row
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
    e?.preventDefault?.(); // prevent auto-close for method="dialog"
    await ensureModal();   // make sure form is present
    const form = getForm();

    const fullName     = $("#oa_fullName")?.value.trim();
    const phone        = $("#oa_phone")?.value.trim();
    const email        = $("#oa_email")?.value.trim();
    const status       = $("#oa_status")?.value || "Pending";
    const currency     = $("#oa_currency")?.value || "KES";
    const totalCents   = normaliseCents($("#oa_totalCents")?.value);
    const depositCents = normaliseCents($("#oa_depositCents")?.value);
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
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `HTTP ${res.status}`);
      }
      const data = await res.json();
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
    // Click on backdrop for <div.ws-modal>
    dialogEl.addEventListener("click", (e) => {
      if (e.target && (e.target === dialogEl || e.target.hasAttribute("data-oa-close"))) {
        e.preventDefault();
        closeDialog();
      }
    });
  }

  function wire() {
    // Openers: data-modal-target="#orderAddModal" and data-action="add-order"
    document.addEventListener("click", async (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;

      // Open
      if (
        t.getAttribute("data-modal-target") === "#orderAddModal" ||
        t.getAttribute("data-action") === "add-order"
      ) {
        e.preventDefault();
        await showDialog();
        return;
      }

      // Remove row
      if (t.classList.contains("oa_row_remove")) {
        e.preventDefault();
        const tr = t.closest("tr");
        tr?.parentElement?.removeChild(tr);
        return;
      }

      // Add row
      if (t.id === "oa_addRow") {
        e.preventDefault();
        addItemRow();
        return;
      }
    });

    // Submit via Save button or Enter on form
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (t instanceof Element && t.id === "oa_submit") {
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

    // Escape closes
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const dlg = getDlg();
      if (!dlg) return;
      if (isDialog(dlg) && typeof dlg.close === "function") dlg.close();
      else dlg.classList.add("hidden");
    });

    // Expose small API for diagnostics
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
