// public/admin/js/orders-bridge.js — strategy reset bridge for dashboard.html?css=v2#orders
// Purpose: Work even if dashboard dynamically injects the orders table and disables buttons.
(function(){
  function enableAndBind(root){
    if (!root) return;
    // Re-enable any disabled view/edit buttons by common patterns
    root.querySelectorAll(
      '.js-order-edit-btn[disabled], .order-edit-btn[disabled], [data-action="edit"][disabled], ' +
      '.js-order-view-btn[disabled], .order-view-btn[disabled], [data-action="view"][disabled]'
    ).forEach(el => el.removeAttribute('disabled'));

    // Attach one delegated handler to the container, open modal via existing global (if present)
    const sel = '.js-order-edit-btn, .order-edit-btn, [data-action="edit"], .js-order-view-btn, .order-view-btn, [data-action="view"]';
    if (!root.__wsOrdersBound){
      root.addEventListener('click', (e)=>{
        const btn = e.target.closest(sel);
        if (!btn) return;
        const row = btn.closest('tr');
        const oid = btn.dataset.oid || btn.getAttribute('data-id') || row?.dataset?.oid || row?.dataset?.id || '';
        if (!oid) return alert('Could not find order id.');
        if (typeof window.openOrderEdit === 'function'){
          // Admin editor we ship
          window.openOrderEdit({ id: oid });
        } else if (typeof window.AdminOrders?.open === 'function'){
          // If the dashboard exposes a handler
          window.AdminOrders.open(oid);
        } else {
          // Fallback: try to simulate a click on any hidden modal trigger
          const trigger = document.querySelector(`[data-open="order-edit"][data-oid="${oid}"]`);
          if (trigger) trigger.click();
        }
      });
      root.__wsOrdersBound = true;
    }
  }

  function observe(){
    const container = document.getElementById('ordersTbody')?.parentElement || document.getElementById('ordersTable') || document.body;
    enableAndBind(container);
    const mo = new MutationObserver(()=> enableAndBind(container));
    mo.observe(container, { childList: true, subtree: true });
  }
  document.addEventListener('DOMContentLoaded', observe);
})();
