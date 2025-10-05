#!/bin/sh
# WattSun — Deploy (staging) STUB
# SAFE DEFAULT: prints actions only. Wire up when ready.

set -eu
APP_DIR="${APP_DIR:-/volume1/web/wattsun}"
BRANCH="${BRANCH:-develop}"

echo "==> [DRY-RUN] Deploy staging to $APP_DIR (branch: $BRANCH)"
echo "git -C $APP_DIR fetch origin && git -C $APP_DIR reset --hard origin/$BRANCH"
echo "npm ci --omit=dev"
echo "node scripts/migrate.js  # (optional)"
echo "Restart node app..."
echo "==> Done (no changes applied)."
exit 0
