// public/admin/js/endpoint-shim.js (v2) — selective rewrite
(function(){
  console.log("[Shim] Endpoint shim active");
  const origFetch = window.fetch;
  window.fetch = function(input, init){
    let url = typeof input === "string" ? input : (input && input.url) || "";
    let method = (init && init.method) || (typeof input !== "string" && input && input.method) || "GET";
    method = String(method || "GET").toUpperCase();
    function shouldSwap(u){
      try{
        const rel = u.startsWith(location.origin) ? u.slice(location.origin.length) : u;
        if (!rel.startsWith("/api/admin/orders")) return false;
        if (!/[?&]page=/.test(rel)) return false;
        return method === "GET";
      }catch(e){ return false; }
    }
    function swap(u){
      return shouldSwap(u) ? u.replace("/api/admin/orders", "/api/orders") : u;
    }
    if (typeof input === "string") return origFetch.call(this, swap(url), init);
    if (input instanceof Request) {
      const newUrl = swap(url);
      if (newUrl !== url) {
        const copy = new Request(newUrl, input);
        return origFetch.call(this, copy, init);
      }
      return origFetch.call(this, input, init);
    }
    return origFetch.call(this, input, init);
  };
})();