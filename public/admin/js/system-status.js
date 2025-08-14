// public/admin/js/system-status.js

function fetchWithTimeout(url, opts = {}, ms = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() =>
    clearTimeout(id)
  );
}

// Fallback-aware tunnel checker:
// 1) Try /api/tunnel (kept for compatibility)
// 2) If missing/404 or network error, fall back to /status.html and
//    infer "Connected/OK" from the HTML.
async function tunnelStatus() {
  try {
    // Use the known-good status page as the source of truth for the tunnel
  const s = await fetchWithTimeout('/status.html', {}, 8000);
if (!s.ok) {
  tunnel = '🔴 Disconnected (fallback HTTP ' + s.status + ')';
 } else {
   const html = await s.text();
   const ok = /Cloudflare\s*Tunnel[^]*?(Connected|OK)/i.test(html);
   tunnel = ok ? '🟢 Connected' : '🔴 Disconnected (fallback parse)';
 }
    // 404 → fall through to fallback
  } catch (_) {
    // network error → fallback
  }
  try {
    const s = await fetchWithTimeout("/status.html", {}, 8000);
    if (!s.ok) return "🔴 Disconnected (fallback HTTP " + s.status + ")";
    const html = await s.text();
    const ok =
      /Cloudflare\s*Tunnel[^]*?(Connected|OK)/i.test(html) ||
      /id\s*=\s*["']tunnelStatus["'][^>]*>([^<]*Connected|OK)/i.test(html);
    return ok ? "🟢 Connected" : "🔴 Disconnected (fallback parse)";
  } catch (_) {
    return "🔴 Disconnected (fallback network error)";
  }
}

async function checkSystemStatus() {
  const box = document.getElementById("statusContainer");
  const ts = document.getElementById("timestamp");
  if (!box) return;

  box.innerHTML = "";

  // Backend
  let backend = "Checking…";
  try {
    const r = await fetchWithTimeout("/api/health", {}, 8000);
    backend = r.ok ? "🟢 OK" : "🔴 DOWN (HTTP " + r.status + ")";
  } catch (_) {
    backend = "🔴 DOWN (network error)";
  }

  // Tunnel (with fallback)
  const tunnel = await tunnelStatus();

  box.innerHTML +=
    '<div class="status-card ' +
    (backend.includes("🔴") ? "red" : "") +
    '"><span class="status-label">Backend API:</span> ' +
    backend +
    "</div>";

  box.innerHTML +=
    '<div class="status-card ' +
    (tunnel.includes("🔴") ? "red" : "") +
    '"><span class="status-label">Cloudflare Tunnel:</span> ' +
    tunnel +
    "</div>";

  if (ts) {
    ts.textContent =
      "Last checked: " +
      new Date().toLocaleTimeString() +
      " – auto-refreshes every 30s";
  }
}

// Run when the partial is injected (no duplicate intervals)
window.addEventListener("admin:partial-loaded", (e) => {
  if (e.detail?.name === "system-status") {
    checkSystemStatus();
    if (!window.__wsStatusInterval) {
      window.__wsStatusInterval = setInterval(checkSystemStatus, 30000);
    }
  }
});
