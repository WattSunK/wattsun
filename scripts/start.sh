#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
RUN_DIR="${RUN_DIR:-$ROOT_DIR/run}"
LOG_DIR="${LOG_DIR:-$ROOT_DIR/logs}"
NODE_BIN="${NODE_BIN:-node}"

mkdir -p "$RUN_DIR" "$LOG_DIR"

if [ -f "$RUN_DIR/app.pid" ] && kill -0 "$(cat "$RUN_DIR/app.pid")" 2>/dev/null; then
  echo "App already running with PID $(cat "$RUN_DIR/app.pid")"
  exit 0
fi

echo "Starting server..."
TS="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$LOG_DIR/app-$TS.log"

if [ -f "$ROOT_DIR/.env" ]; then
  export $(grep -v '^#' "$ROOT_DIR/.env" | sed -E 's/(.*)=[ ]*$/=/' | xargs -I{} echo {})
fi

PORT="${PORT:-3101}"
echo "PORT=$PORT"

"$NODE_BIN" "$ROOT_DIR/server.js" >>"$LOG_FILE" 2>&1 &
PID=$!
echo $PID > "$RUN_DIR/app.pid"

echo "Started PID $PID (log: $LOG_FILE)"
