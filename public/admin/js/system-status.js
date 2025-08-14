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
  box.innerHTML = '';

  let backend = 'Checking…', tunnel = 'Checking…';
  try {
    const r = await fetchWithTimeout('/api/health', {}, 8000);
    backend = r.ok ? '🟢 OK' : '🔴 DOWN (HTTP ' + r.status + ')';
  } catch (e) {
    backend = '🔴 DOWN (network error)';
  }

  try {
    const r2 = await fetchWithTimeout('/api/tunnel', {}, 8000);
    tunnel = r2.ok ? '🟢 Connected' : '🔴 Disconnected (HTTP ' + r2.status + ')';
  } catch (e) {
    tunnel = '🔴 Disconnected (network error)';
  }

  box.innerHTML += '<div class="status-card ' + (backend.includes('🔴') ? 'red' : '') + '"><span class="status-label">Backend API:</span> ' + backend + '</div>';
  box.innerHTML += '<div class="status-card ' + (tunnel.includes('🔴') ? 'red' : '') + '"><span class="status-label">Cloudflare Tunnel:</span> ' + tunnel + '</div>';

  if (ts) {
    ts.textContent = 'Last checked: ' + new Date().toLocaleTimeString() + ' – auto-refreshes every 30s';
  }
}

window.addEventListener("admin:partial-loaded", (e) => {
  if (e.detail?.name === "system-status") {
    checkSystemStatus();
    setInterval(checkSystemStatus, 30000);
  }
});
