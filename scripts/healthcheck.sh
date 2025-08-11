#!/bin/sh
# WattSun — Healthcheck (stub)
# Checks local /api/health and prints status. Adjust HOST as needed.

set -eu
HOST="${HOST:-http://127.0.0.1:3000}"
URL="$HOST/api/health"

echo "Pinging $URL ..."
code=$(curl -s -o /dev/null -w "%{http_code}" "$URL" || true)
echo "HTTP $code"
[ "$code" = "200" ] && echo "OK" || echo "NOT OK"
exit 0
