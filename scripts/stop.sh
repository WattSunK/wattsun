#!/bin/sh
set -eu
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
RUN_DIR="${RUN_DIR:-$ROOT_DIR/run}"

if [ ! -f "$RUN_DIR/app.pid" ]; then
  echo "No PID file; nothing to stop."
  exit 0
fi

PID="$(cat "$RUN_DIR/app.pid")"
if kill -0 "$PID" 2>/dev/null; then
  echo "Stopping PID $PID..."
  kill "$PID"
  sleep 1
  if kill -0 "$PID" 2>/dev/null; then
    echo "Force killing PID $PID..."
    kill -9 "$PID" || true
  fi
else
  echo "Stale PID file."
fi

rm -f "$RUN_DIR/app.pid"
echo "Stopped."
