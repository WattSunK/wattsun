#!/bin/bash
# WattSun QA Restart Cycle Script
# Stops both Dev and QA, pulls latest code, reinstalls dependencies if needed,
# restarts both environments, and verifies health.

set -e

ROOT="/volume1/web/wattsun"
LOGFILE="$ROOT/logs/qa/restart_cycle.log"

echo "========================================" | tee -a "$LOGFILE"
echo "🔁 WattSun QA Restart Cycle — $(date)" | tee -a "$LOGFILE"
echo "========================================" | tee -a "$LOGFILE"

cd "$ROOT" || { echo "❌ Repo not found: $ROOT"; exit 1; }

# --- STOP BOTH ENVIRONMENTS ---
echo "🛑 Stopping DEV and QA environments..." | tee -a "$LOGFILE"
scripts/stop_dev.sh >> "$LOGFILE" 2>&1 || true
scripts/stop_qa.sh >> "$LOGFILE" 2>&1 || true

# --- GIT PULL ---
echo "📦 Fetching latest from GitHub..." | tee -a "$LOGFILE"
git fetch --all >> "$LOGFILE" 2>&1
git reset --hard origin/main >> "$LOGFILE" 2>&1
git clean -fd >> "$LOGFILE" 2>&1

# --- DEPENDENCY SAFEGUARD ---
echo "🧩 Ensuring dependencies are installed..." | tee -a "$LOGFILE"
npm ci --omit=dev >> "$LOGFILE" 2>&1 || npm install --omit=dev >> "$LOGFILE" 2>&1

# --- RESTART BOTH ---
echo "🚀 Starting DEV and QA servers..." | tee -a "$LOGFILE"
scripts/start_dev.sh >> "$LOGFILE" 2>&1
scripts/start_qa.sh >> "$LOGFILE" 2>&1

# --- VERIFY HEALTH ---
echo "🔍 Verifying both environments..." | tee -a "$LOGFILE"
scripts/qa_sync_verify.sh | tee -a "$LOGFILE"

echo | tee -a "$LOGFILE"
echo "✅ Restart cycle complete at $(date)" | tee -a "$LOGFILE"
echo "🌐 QA available at: http://127.0.0.1:3000/api/health" | tee -a "$LOGFILE"
echo "📦 Logs: $LOGFILE"
echo "========================================" | tee -a "$LOGFILE"
