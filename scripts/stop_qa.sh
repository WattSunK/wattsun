#!/bin/bash
ROOT=$(dirname "$0")/..
PID_FILE="$ROOT/run/qa/app.pid"

if [ -f "$PID_FILE" ]; then
  kill $(cat "$PID_FILE") && rm "$PID_FILE"
  echo "[qa] WattSun QA server stopped."
else
  echo "[qa] PID file not found — is QA running?"
fi
