#!/bin/sh
set -eu
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "Pulling latest..."
git pull --ff-only
echo "Installing deps..."
npm install --no-audit --no-fund
echo "Restarting..."
"$ROOT_DIR/scripts/stop.sh" || true
"$ROOT_DIR/scripts/start.sh"
