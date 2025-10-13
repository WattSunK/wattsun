#!/bin/bash
# =====================================================
# ♻️ WattSun Full Environment Restart (Dev + QA)
# =====================================================

# Always run from project root to avoid ESM bleed
cd /volume1/web/wattsun || {
  echo "❌ Failed to enter /volume1/web/wattsun"
  exit 1
}

SCRIPTS_DIR="$(pwd)/scripts"
LOG_DIR="$(pwd)/logs"
mkdir -p "$LOG_DIR"

echo "============================================================"
echo "🔁 Restarting WattSun environments — $(date)"
echo "============================================================"

# -------------------------------------------------
# Step 1 — Stop any existing WattSun Node processes
# -------------------------------------------------
echo "🛑 Stopping existing WattSun Node processes..."

PIDS=$(ps -ef | grep "node /volume1/web/wattsun/server.js" | grep -v grep | awk '{print $2}')

if [ -n "$PIDS" ]; then
  echo "Found running processes: $PIDS"
  kill -9 $PIDS 2>/dev/null || true
  sleep 2
  echo "✅ All previous WattSun Node processes stopped."
else
  echo "No running WattSun Node processes found."
fi

# -------------------------------------------------
# Step 2 — Clean logs
# -------------------------------------------------
echo "🧹 Cleaning old logs..."
: > "$LOG_DIR/dev.log"
: > "$LOG_DIR/qa.log"

# -------------------------------------------------
# Step 3 — Helper to start one environment
# -------------------------------------------------
start_instance() {
  local NAME="$1"
  local PORT="$2"
  local LOG_FILE="$LOG_DIR/${NAME}.log"

  echo "▶️  Launching ${NAME^^} (port $PORT)..."
  nohup node server.js --port="$PORT" > "$LOG_FILE" 2>&1 &
  sleep 2

  if ps -ef | grep "node server.js --port=$PORT" | grep -v grep >/dev/null; then
    echo "✅ ${NAME^^} running on port $PORT"
  else
    echo "❌ Failed to start ${NAME^^} — check $LOG_FILE"
  fi
}

# -------------------------------------------------
# Step 4 — Start both environments
# -------------------------------------------------
start_instance "dev" 3001
start_instance "qa" 3000

# -------------------------------------------------
# Step 5 — Verify
# -------------------------------------------------
echo "============================================================"
echo "✅ Active Node processes (showing ports):"
netstat -tlnp 2>/dev/null | grep -E ':3000|:3001' || echo "⚠️ No open WattSun ports detected"
echo "============================================================"
echo "Logs: $LOG_DIR/dev.log , $LOG_DIR/qa.log"
echo "============================================================"
echo "Done."
