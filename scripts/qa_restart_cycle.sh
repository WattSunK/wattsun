#!/bin/sh
# ==========================================================
# WattSun QA Restart Cycle Script
# ----------------------------------------------------------
# Stops QA, pulls latest code, restarts Dev & QA, verifies
# ==========================================================

ROOT="/volume1/web/wattsun"
LOGFILE="$ROOT/logs/qa/restart_cycle.log"
DATE_NOW="$(date '+%Y-%m-%d %H:%M:%S')"

echo "==========================================" | tee -a "$LOGFILE"
echo "🚀 WattSun QA Restart Cycle — $DATE_NOW" | tee -a "$LOGFILE"
echo "==========================================" | tee -a "$LOGFILE"
echo

cd "$ROOT" || { echo "❌ ERROR: Could not cd to $ROOT"; exit 1; }

# --- Step 1: Stop QA if running ---
echo "🛑 Stopping QA server..." | tee -a "$LOGFILE"
if [ -x scripts/stop_qa.sh ]; then
  scripts/stop_qa.sh >> "$LOGFILE" 2>&1 || true
else
  echo "[warn] stop_qa.sh not found — skipping manual stop" | tee -a "$LOGFILE"
fi

sleep 2

# --- Step 2: Pull latest code (fetch + fast-forward main) ---
echo "⬇️  Pulling latest code from origin/main..." | tee -a "$LOGFILE"
git fetch origin main >> "$LOGFILE" 2>&1
git checkout main >> "$LOGFILE" 2>&1
git reset --hard origin/main >> "$LOGFILE" 2>&1
git clean -fd >> "$LOGFILE" 2>&1
echo "✅ Code synced with origin/main" | tee -a "$LOGFILE"

# --- Step 3: Restart both environments ---
echo "🔄 Restarting Dev and QA..." | tee -a "$LOGFILE"

if [ -x scripts/start_dev.sh ]; then
  scripts/start_dev.sh >> "$LOGFILE" 2>&1 &
else
  echo "[warn] start_dev.sh not found" | tee -a "$LOGFILE"
fi

sleep 2

if [ -x scripts/start_qa.sh ]; then
  scripts/start_qa.sh >> "$LOGFILE" 2>&1 &
else
  echo "[warn] start_qa.sh not found" | tee -a "$LOGFILE"
fi

sleep 4

# --- Step 4: Verify both environments ---
echo "🔍 Verifying health for both environments..." | tee -a "$LOGFILE"
if [ -x scripts/qa_sync_verify.sh ]; then
  scripts/qa_sync_verify.sh | tee -a "$LOGFILE"
else
  echo "[warn] qa_sync_verify.sh not found — skipping verification" | tee -a "$LOGFILE"
fi

echo
echo "✅ QA Restart Cycle Complete — $(date)" | tee -a "$LOGFILE"
echo "==========================================" | tee -a "$LOGFILE"
