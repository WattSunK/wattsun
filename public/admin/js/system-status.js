// public/admin/js/system-status.js

function fetchWithTimeout(url, opts = {}, ms = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(id));
}

async function checkSystemStatus() {
  const box = document.getElementById('statusContainer');
  const ts = document.getElementById('timestamp');
  if (!box) return;

  box.innerHTML = '<div>Loading…</div>';

  try {
    const r = await fetchWithTimeout('/api/health', {}, 8000);
    const data = await r.json();

    const backend = data.backend || "❌ Unknown";
    const tunnel = data.tunnel || "❌ Unknown";

    box.innerHTML = `
      <div class="status-card ${backend.includes("OK") ? "" : "red"}">
        <span class="status-label">Backend API:</span>
        ${backend.includes("OK") ? "🟢" : "🔴"} ${backend}
      </div>
      <div class="status-card ${tunnel.includes("Connected") ? "" : "red"}">
        <span class="status-label">Cloudflare Tunnel:</span>
        ${tunnel.includes("Connected") ? "🟢" : "🔴"} ${tunnel}
      </div>
    `;

    if (ts && data.checkedAt) {
      const dt = new Date(data.checkedAt);
      ts.textContent = `Last checked: ${dt.toLocaleTimeString()} – auto-refreshes every 30s`;
    }
  } catch (e) {
    box.innerHTML = `
      <div class="status-card red"><span class="status-label">Backend API:</span> 🔴 Error</div>
      <div class="status-card red"><span class="status-label">Cloudflare Tunnel:</span> 🔴 Unknown</div>
    `;
    if (ts) ts.textContent = 'Last checked: Failed to retrieve';
  }
}

window.addEventListener("admin:partial-loaded", (e) => {
  if (e.detail?.name === "system-status") {
    checkSystemStatus();
    setInterval(checkSystemStatus, 30000);
  }
});
