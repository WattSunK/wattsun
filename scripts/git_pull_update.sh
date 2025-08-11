#!/bin/bash
set -euo pipefail

ROOT="/volume1/web/wattsun"
LOGFILE="$ROOT/logs/update.log"
PORT="${PORT:-3001}"

mkdir -p "$ROOT/logs"
echo "=== Update started at $(date) ===" >> "$LOGFILE" 2>&1

cd "$ROOT" || { echo "Repo directory not found: $ROOT" >> "$LOGFILE"; exit 1; }

# Stop current app (ignore errors)
echo "--- stopping app ---" >> "$LOGFILE"
scripts/stop_nas.sh >> "$LOGFILE" 2>&1 || true

# Pull latest from the single repo
echo "--- fetching code ---" >> "$LOGFILE"
git fetch --all >> "$LOGFILE" 2>&1
git reset --hard origin/main >> "$LOGFILE" 2>&1
git clean -fd >> "$LOGFILE" 2>&1   # safe: ignored files (data/logs/run/* & symlinked paths) are preserved

# Normalize scripts and ensure perms
sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true
chmod +x scripts/*.sh 2>/dev/null || true

# Install/refresh prod deps
echo "--- installing deps ---" >> "$LOGFILE"
npm ci --omit=dev >> "$LOGFILE" 2>&1 || npm install --omit=dev >> "$LOGFILE" 2>&1

# Start and quick health check
echo "--- starting app ---" >> "$LOGFILE"
scripts/start_nas.sh >> "$LOGFILE" 2>&1

code="$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/health" || true)"
echo "health ${code}" >> "$LOGFILE"

echo "=== Update finished at $(date) ===" >> "$LOGFILE"
echo
