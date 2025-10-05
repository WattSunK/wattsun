#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

PIDFILE="run/app.pid"
if [ -f "$PIDFILE" ]; then
  PID=$(cat "$PIDFILE")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "Stopped PID $PID"
  else
    echo "No process with PID $PID"
  fi
  rm -f "$PIDFILE"
else
  echo "No PID file"
fi

# Also stop anything still binding port 3001
if command -v lsof >/dev/null 2>&1; then
  PID=$(lsof -ti tcp:3001 || true)
  [ -n "$PID" ] && kill -9 $PID && echo "Also stopped port 3001 owner PID $PID"
fi
