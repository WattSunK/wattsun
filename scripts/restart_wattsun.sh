#!/bin/bash
# ==========================================
# restart_wattsun.sh — Restarts both DEV and QA using per-env scripts
# ==========================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Restarting WattSun DEV and QA environments..."
echo "==========================================================="

# Restart DEV (uses start/stop scripts with correct paths and DBs)
if "$HERE/restart_dev.sh"; then
  echo "[dev] restarted"
else
  echo "[dev] restart failed" >&2
fi

# Restart QA (uses start/stop scripts in QA root)
if "$HERE/restart_qa.sh"; then
  echo "[qa] restarted"
else
  echo "[qa] restart failed" >&2
fi

echo "All environments restart attempted. Check logs for details."

