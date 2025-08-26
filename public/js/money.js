// public/js/money.js
// Unified KES formatter for display (UMD + ESM)

(function(global){
  function formatKES(cents){
    const n = Number(cents);
    if (!Number.isFinite(n)) return "KES —";
    const sh = Math.round(n / 100);
    return "KES " + sh.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  // expose globally for non-module consumers
  global.formatKES = formatKES;
  if (typeof module !== "undefined") module.exports = { formatKES };
})(typeof window !== "undefined" ? window : globalThis);

// ESM export (works if imported as a module)
export function formatKES(cents){
  const n = Number(cents);
  if (!Number.isFinite(n)) return "KES —";
  const sh = Math.round(n / 100);
  return "KES " + sh.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
