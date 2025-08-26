// public/admin/js/endpoint-shim.js
(function(){
  const maps = [
    { from: "/api/admin/orders",   to: "/api/orders" },
    // { from: "/api/admin/dispatch", to: "/api/dispatch" }, // enable if needed
  ];
  const origFetch = window.fetch;
  window.fetch = function(input, init){
    function swap(u){
      try {
        const rel = u.startsWith(location.origin) ? u.slice(location.origin.length) : u;
        for (const m of maps) {
          if (rel.startsWith(m.from)) return u.replace(m.from, m.to);
        }
      } catch(e){}
      return u;
    }
    if (typeof input === "string") return origFetch.call(this, swap(input), init);
    if (input instanceof Request) {
      const newUrl = swap(input.url);
      if (newUrl !== input.url) {
        const copy = new Request(newUrl, input);
        return origFetch.call(this, copy, init);
      }
      return origFetch.call(this, input, init);
    }
    return origFetch.call(this, input, init);
  };
})();