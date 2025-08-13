// public/admin/js/orders-bridge.js — ID-agnostic View/Edit enabler
(function () {
  const BTN_SEL = [
    '[data-action="view"]','[data-action="edit"]',
    '.order-view-btn','.order-edit-btn','.js-order-view-btn','.js-order-edit-btn',
    'button[title*="View" i]','button[title*="Edit" i]','a[title*="View" i]','a[title*="Edit" i]'
  ].join(',');

  function getOrderIdFrom(btn) {
    const row = btn.closest('tr');
    const tryAttrs = (el) =>
      el?.dataset?.oid || el?.dataset?.id || el?.getAttribute?.('data-oid') || el?.getAttribute?.('data-id') || '';
    let oid = tryAttrs(btn) || tryAttrs(row) ||
              row?.querySelector('[data-oid],[data-id]')?.dataset?.oid ||
              row?.querySelector('[data-oid],[data-id]')?.dataset?.id || '';
    if (!oid && row) {
      const text = row.innerText || '';
      const watt = text.match(/WATT[\w-]{6,}/i);
      const longNum = text.match(/\b\d{8,}\b/);
      oid = (watt && watt[0]) || (longNum && longNum[0]) || '';
    }
    return String(oid).trim();
  }

  function enableButtons(root) {
    root.querySelectorAll(`${BTN_SEL}[disabled]`).forEach(el => el.removeAttribute('disabled'));
    root.querySelectorAll(BTN_SEL).forEach(el => { el.removeAttribute('aria-disabled'); el.classList.remove('disabled','is-disabled'); });
  }

  function bindClicks() {
    if (document.body.__wsOrdersBridgeBound) return;
    document.body.addEventListener('click', async (e) => {
      const btn = e.target.closest(BTN_SEL);
      if (!btn) return;
      const oid = getOrderIdFrom(btn);
      if (!oid) return alert('Could not determine order id for this row.');
      if (typeof window.openOrderEdit === 'function') { window.openOrderEdit({ id: oid }); return; }
      if (window.AdminOrders?.open) { window.AdminOrders.open(oid); return; }
      const trigger = document.querySelector(`[data-open="order-edit"][data-oid="${oid}"]`);
      if (trigger) trigger.click();
      else alert(`Order ID: ${oid}`);
    });
    document.body.__wsOrdersBridgeBound = true;
  }

  function observe() {
    const target = document.body;
    enableButtons(target);
    bindClicks();
    const mo = new MutationObserver(() => enableButtons(target));
    mo.observe(target, { childList: true, subtree: true });
  }

  document.addEventListener('DOMContentLoaded', observe);
})();