#!/bin/sh
set -eu
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
RUN_DIR="${RUN_DIR:-$ROOT_DIR/run}"

if [ -f "$RUN_DIR/app.pid" ] && kill -0 "$(cat "$RUN_DIR/app.pid")" 2>/dev/null; then
  echo "RUNNING (PID $(cat "$RUN_DIR/app.pid"))"
else
  echo "STOPPED"
fi
