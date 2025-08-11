#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ -f run/app.pid ]; then
  PID=$(cat run/app.pid)
  if kill "$PID" 2>/dev/null; then
    echo "Stopped PID $PID"
  else
    echo "PID $PID not running"
  fi
  rm -f run/app.pid
else
  echo "No PID file"
fi
