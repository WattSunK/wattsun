#!/bin/bash
# ==========================================
# restart_wattsun.sh — Restarts both DEV and QA environments
# ==========================================
set -euo pipefail

export PATH=/usr/local/bin:/usr/bin:/bin
LOGFILE="/volume1/web/wattsun/logs/restart_boot.log"
exec >>"$LOGFILE" 2>&1

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "==========================================================="
echo "$(date) — Restarting WattSun DEV and QA environments..."
echo "==========================================================="

# Restart DEV
if "$HERE/restart_dev.sh"; then
  echo "[dev] restarted"
else
  echo "[dev] restart failed" >&2
fi

# Restart QA
if "$HERE/restart_qa.sh"; then
  echo "[qa] restarted"
else
  echo "[qa] restart failed" >&2
fi

echo "All environments restart attempted. Check logs for details."
