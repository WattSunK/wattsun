#!/bin/sh
set -eu
LOG="/volume1/web/wattsun/logs/update.log"
echo "=== Update at $(date) ===" >> "$LOG" 2>&1
cd /volume1/web/wattsun
scripts/stop_nas.sh >> "$LOG" 2>&1 || true
git fetch --all >> "$LOG" 2>&1
git reset --hard origin/main >> "$LOG" 2>&1
sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true
chmod +x scripts/*.sh 2>/dev/null || true
scripts/start_nas.sh >> "$LOG" 2>&1
echo "=== Done at $(date) ===" >> "$LOG" 2>&1
