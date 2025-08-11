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

# Fallback: if something still owns the port, stop it
INUSE_PID=$(netstat -tlnp 2>/dev/null | awk -v P="${PORT:-3001}" '$4 ~ ":"P && $6=="LISTEN" { split($7,a,"/"); print a[1]; exit }')
if [ -n "$INUSE_PID" ]; then
  if kill "$INUSE_PID" 2>/dev/null; then
    echo "Also stopped port ${PORT:-3001} owner PID $INUSE_PID"
  fi
fi
