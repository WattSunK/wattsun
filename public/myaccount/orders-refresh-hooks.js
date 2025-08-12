// public/myaccount/orders-refresh-hooks.js
// Lightweight hooks to re-fetch orders when the tab regains focus or admin pings localStorage.
(function(){
  "use strict";
  function tryRefetch(){
    try {
      // assume a global renderOrders() or a function that reloads the list
      if (typeof renderOrders === "function") renderOrders();
    } catch(e){ /* no-op */ }
  }
  window.addEventListener("focus", tryRefetch);
  window.addEventListener("storage", (e) => {
    if (e.key === "wattsun:ordersUpdated") tryRefetch();
  });
})();
