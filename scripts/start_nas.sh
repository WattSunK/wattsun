#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p data/dev logs run
set -a; [ -f .env ] && . ./.env; set +a
nohup node server.js >> logs/app.out 2>> logs/app.err &
echo $! > run/app.pid
sleep 1
curl -s -o /dev/null -w "health %s\n" "http://127.0.0.1:${PORT:-3001}/api/health" || true
echo "Started PID $(cat run/app.pid) on port ${PORT:-3001}"
