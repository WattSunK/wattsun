#!/bin/bash
# =============================================================
# restart_wattsun.sh — Boot-safe restart of WattSun DEV & QA
# =============================================================

set -euo pipefail

# --- Ensure basic runtime environment
export PATH="/usr/local/bin:/usr/bin:/bin"
export ENV_FILE="/volume1/web/wattsun/qa/.env.qa"
export NODE_ENV="qa"

# --- Logging
mkdir -p /volume1/web/wattsun/logs
LOGFILE="/volume1/web/wattsun/logs/restart_boot.log"
exec >>"$LOGFILE" 2>&1

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "============================================================"
echo "$(date) — Starting WattSun restart sequence..."
echo "Script dir: $HERE"
echo "============================================================"

# --- DEV restart
if [ -f "$HERE/restart_dev.sh" ]; then
  echo "[dev] restarting..."
  if bash "$HERE/restart_dev.sh"; then
    echo "[dev] ✅ restarted successfully"
  else
    echo "[dev] ❌ restart failed" >&2
  fi
else
  echo "[dev] ⚠️ restart_dev.sh not found"
fi

# --- QA restart
if [ -f "$HERE/restart_qa.sh" ]; then
  echo "[qa] restarting..."
  if bash "$HERE/restart_qa.sh"; then
    echo "[qa] ✅ restarted successfully"
  else
    echo "[qa] ❌ restart failed" >&2
  fi
else
  echo "[qa] ⚠️ restart_qa.sh not found"
fi

# --- Restart Cloudflared tunnel after QA backend comes online
echo "[qa] Restarting Cloudflared tunnel..."
if bash /volume1/web/wattsun/scripts/start_cloudflared.sh >/dev/null 2>&1; then
  echo "[qa] ✅ Cloudflared tunnel restarted after QA backend"
else
  echo "[qa] ⚠️ Cloudflared tunnel restart failed"
fi

echo "Restart sequence complete."
echo "============================================================"
