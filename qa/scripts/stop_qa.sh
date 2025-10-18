#!/bin/bash
# ===========================================
# 🟥 WattSun QA Environment Stopper (Self-Contained)
# ===========================================

PIDFILE="/volume1/web/wattsun/qa/run/app.pid"

if [ -f "$PIDFILE" ]; then
  PID=$(cat "$PIDFILE")
  echo "[qa] Stopping WattSun QA server (PID $PID)..."
  kill "$PID" 2>/dev/null || true
  rm -f "$PIDFILE"
  echo "[qa] ✅ WattSun QA stopped."
else
  echo "[qa] PID file not found — checking port 3000..."
  p=$(ss -lptn 'sport = :3000' | awk 'NR>1 {print $NF}' | sed 's/.*pid=\([0-9]\+\).*/\1/')
  [ -n "$p" ] && sudo kill "$p" && echo "[qa] Port 3000 process killed." || echo "[qa] Nothing running on 3000."
fi
