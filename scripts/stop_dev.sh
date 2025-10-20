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
# Stop notifications worker if running
WORKER_PIDFILE="run/dev/worker.pid"
if [ -f "$WORKER_PIDFILE" ]; then
  WPID=$(cat "$WORKER_PIDFILE")
  if kill -0 "$WPID" 2>/dev/null; then
    echo "[dev] Stopping notifications_worker (PID $WPID)..."
    kill "$WPID" 2>/dev/null || true
  fi
  rm -f "$WORKER_PIDFILE"
fi
