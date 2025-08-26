// public/admin/js/data-adapter.js (v6.5-fallback)
(function(global){
  const KEY = "ws.ordersEndpoint";
  let ORDERS_ENDPOINT = null;

  async function detectOrdersEndpoint(){
    if (!ORDERS_ENDPOINT) {
      const cached = localStorage.getItem(KEY);
      if (cached) ORDERS_ENDPOINT = cached;
    }
    if (ORDERS_ENDPOINT) return ORDERS_ENDPOINT;

    const trials = ["/api/admin/orders", "/api/orders"];
    for (const base of trials){
      try {
        const r = await fetch(`${base}?page=1&per=1`, { credentials:"include" });
        if (r.ok || r.status === 403) {
          ORDERS_ENDPOINT = base;
          localStorage.setItem(KEY, base);
          console.log("[AdminData] Orders endpoint:", base);
          return base;
        }
      } catch (e) {}
    }
    ORDERS_ENDPOINT = "/api/admin/orders";
    console.warn("[AdminData] Orders endpoint detection failed; defaulting to", ORDERS_ENDPOINT);
    return ORDERS_ENDPOINT;
  }

  async function fetchOrders({page=1, per=10, q="", status=""}={}){
    const base = await detectOrdersEndpoint();
    const url = new URL(base, location.origin);
    url.searchParams.set("page", page);
    url.searchParams.set("per", per);
    if (q) url.searchParams.set("q", q);
    if (status) url.searchParams.set("status", status);
    const r = await fetch(url, { credentials:"include" });
    if (r.status === 404 && base === "/api/admin/orders") {
      localStorage.removeItem(KEY);
      console.warn("[AdminData] /api/admin/orders 404; retrying /api/orders");
      const rr = await fetch("/api/orders?page=1&per=1", { credentials:"include" });
      if (rr.ok || rr.status === 403) {
        localStorage.setItem(KEY, "/api/orders");
      }
    }
    const json = await r.json().catch(()=>({success:false, error:{message:"Invalid JSON"}}));
    return json;
  }

  global.AdminData = Object.assign(global.AdminData||{}, { detectOrdersEndpoint, fetchOrders });
})(window);
