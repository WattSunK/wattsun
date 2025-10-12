#!/bin/bash
# ===========================================
# 🟥 WattSun Dev Environment Stopper
# ===========================================

PIDFILE="run/dev/app.pid"
if [ -f "$PIDFILE" ]; then
  PID=$(cat "$PIDFILE")
  echo "[dev] Stopping WattSun Dev server (PID $PID)..."
  kill $PID 2>/dev/null || true
  rm -f "$PIDFILE"
  echo "[dev] WattSun Dev stopped."
else
  echo "[dev] PID file not found — is Dev running?"
fi
