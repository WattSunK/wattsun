#!/bin/bash
# ==========================================================
# ♻️ WattSun QA Restart Cycle Script — Safe Cleanup + Self-Healing
# ==========================================================
# Stops both Dev and QA, pulls latest code, reinstalls dependencies if needed,
# restarts both environments, and verifies health.
# ----------------------------------------------------------

set -e

ROOT="/volume1/web/wattsun"
LOGDIR="$ROOT/logs/qa"
LOGFILE="$LOGDIR/restart_cycle.log"

mkdir -p "$LOGDIR"

echo "============================================================" | tee -a "$LOGFILE"
echo "🔁 WattSun QA Restart Cycle — $(date)" | tee -a "$LOGFILE"
echo "============================================================" | tee -a "$LOGFILE"

cd "$ROOT" || { echo "❌ Repo not found: $ROOT"; exit 1; }

# --- STOP BOTH ENVIRONMENTS ---
echo "🛑 Stopping DEV and QA environments..." | tee -a "$LOGFILE"
scripts/stop_dev.sh >> "$LOGFILE" 2>&1 || true
scripts/stop_qa.sh >> "$LOGFILE" 2>&1 || true

# --- GIT PULL (Safe Mode) ---
echo "📦 Fetching latest from GitHub..." | tee -a "$LOGFILE"
git fetch --all >> "$LOGFILE" 2>&1
git reset --hard origin/main >> "$LOGFILE" 2>&1

# 🧹 Safe cleanup: remove only untracked files, skip critical folders
echo "🧹 Cleaning repository (safe mode)..." | tee -a "$LOGFILE"
git clean -fdx -e data -e logs -e run -e .env -e .env.* >> "$LOGFILE" 2>&1

# --- SELF-HEALING FOR QA DATABASE ---
QA_DATA_DIR="$ROOT/data/qa"
QA_DB="$QA_DATA_DIR/wattsun.qa.db"
DEV_DB="$ROOT/data/dev/wattsun.dev.db"

if [ ! -d "$QA_DATA_DIR" ]; then
  echo "📁 Recreating missing QA data directory..." | tee -a "$LOGFILE"
  mkdir -p "$QA_DATA_DIR"
  chown 53Bret:users "$QA_DATA_DIR"
  chmod 775 "$QA_DATA_DIR"
fi

if [ ! -f "$QA_DB" ]; then
  echo "💾 Restoring missing QA database from DEV..." | tee -a "$LOGFILE"
  if [ -f "$DEV_DB" ]; then
    cp "$DEV_DB" "$QA_DB"
    chown 53Bret:users "$QA_DB"
    chmod 664 "$QA_DB"
  else
    echo "⚠️  DEV database not found at $DEV_DB — cannot restore QA DB!" | tee -a "$LOGFILE"
  fi
fi

# --- DEPENDENCY SAFEGUARD ---
echo "🧩 Ensuring dependencies are installed..." | tee -a "$LOGFILE"
npm ci --omit=dev >> "$LOGFILE" 2>&1 || npm install --omit=dev >> "$LOGFILE" 2>&1

# --- RESTART BOTH ---
echo "🚀 Starting DEV and QA servers..." | tee -a "$LOGFILE"
scripts/start_dev.sh >> "$LOGFILE" 2>&1
scripts/start_qa.sh >> "$LOGFILE" 2>&1

# --- VERIFY HEALTH ---
echo "🔍 Verifying both environments..." | tee -a "$LOGFILE"
if scripts/qa_sync_verify.sh >> "$LOGFILE" 2>&1; then
  echo "✅ QA Restart successful — environments verified" | tee -a "$LOGFILE"
else
  echo "❌ QA Restart failed — check logs: $LOGFILE" | tee -a "$LOGFILE"
fi

echo | tee -a "$LOGFILE"
echo "🌐 QA available at: http://127.0.0.1:3000/api/health" | tee -a "$LOGFILE"
echo "📦 Logs: $LOGFILE" | tee -a "$LOGFILE"
echo "============================================================" | tee -a "$LOGFILE"
echo "Done."
