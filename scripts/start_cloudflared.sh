#!/bin/sh
###############################################################################
# start_cloudflared.sh
# -----------------------------------------------------------------------------
# Starts the shared Cloudflare tunnel (wattsun_nas) that exposes:
#   • https://api.wattsun.co.ke  → http://localhost:3001 (DEV)
#   • https://qa.wattsun.co.ke   → http://localhost:3000 (QA)
#
# Uses token-based authentication (no config.yml or cert.pem required).
# Safe for NAS boot tasks and repeat runs.
###############################################################################

set -eu

NAME="${CLOUDFLARED_NAME:-cloudflared-qa}"
TOKEN_FILE="/volume1/web/wattsun/.cloudflared/token.txt"

# -----------------------------------------------------------------------------
# 1️⃣ Verify Docker and token file
# -----------------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ Docker not found. Cannot start cloudflared container."
  exit 1
fi

if [ ! -f "$TOKEN_FILE" ]; then
  echo "❌ No token file found at: $TOKEN_FILE"
  echo "   Please run:  tunnel login + tunnel token <ID>  and save it to this path."
  exit 1
fi

TOKEN="$(cat "$TOKEN_FILE" | tr -d '\n')"

# -----------------------------------------------------------------------------
# 2️⃣ Stop any existing container
# -----------------------------------------------------------------------------
echo "🔐 Cloudflared: preparing container '$NAME'..."
sudo docker stop "$NAME" 2>/dev/null || true
sudo docker rm "$NAME" 2>/dev/null || true

# -----------------------------------------------------------------------------
# 3️⃣ Launch the tunnel in token mode
# -----------------------------------------------------------------------------
echo "🚀 Launching Cloudflared tunnel using token mode..."
sudo docker run -d \
  --name "$NAME" \
  --restart always \
  --network host \
  cloudflare/cloudflared:latest tunnel \
  --no-autoupdate run --token "$TOKEN"

# -----------------------------------------------------------------------------
# 4️⃣ Verify status
# -----------------------------------------------------------------------------
sleep 3
if sudo docker ps | grep -q "$NAME"; then
  echo "✅ Cloudflared container '$NAME' is running."
else
  echo "⚠️  Cloudflared container failed to start. Check logs:"
  echo "    sudo docker logs -n 40 $NAME"
  exit 1
fi

# -----------------------------------------------------------------------------
# 5️⃣ Optional connection summary
# -----------------------------------------------------------------------------
echo "ℹ️  Checking Cloudflare connection..."
sudo docker logs -n 20 "$NAME" | grep -E 'Route|Connection' || true

echo "✨ Cloudflared tunnel startup complete."
exit 0
