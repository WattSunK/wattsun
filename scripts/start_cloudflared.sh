#!/bin/sh
set -eu
CFG="${CLOUDFLARED_CONFIG:-/etc/cloudflared/config.yml}"
NAME="${CLOUDFLARED_NAME:-cloudflared}"
echo "🔐 Cloudflared: using $CFG"

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -q '^cloudflared.service'; then
  sudo systemctl restart cloudflared
  systemctl status cloudflared --no-pager -l || true
  exit 0
fi

if command -v cloudflared >/dev/null 2>&1; then
  exec cloudflared tunnel --config "$CFG" run
fi

if command -v docker >/dev/null 2>&1; then
  sudo docker stop "$NAME" 2>/dev/null || true
  sudo docker rm "$NAME" 2>/dev/null || true
  sudo docker run -d --name "$NAME" --network host \
    -v "$CFG":/etc/cloudflared/config.yml:ro \
    cloudflare/cloudflared:latest \
    tunnel --config /etc/cloudflared/config.yml run
  echo "🚀 Cloudflared container launched"
  exit 0
fi

echo "❌ cloudflared not found (no service, binary, or docker)."
exit 1
