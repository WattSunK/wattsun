#!/bin/bash
# =====================================================
# ♻️ WattSun Full Environment Restart (Dev + QA)
# =====================================================

cd /volume1/web/wattsun || {
  echo "❌ Failed to enter /volume1/web/wattsun"
  exit 1
}

LOG_DIR="$(pwd)/logs"
mkdir -p "$LOG_DIR"

echo "============================================================"
echo "🔁 Restarting WattSun environments — $(date)"
echo "============================================================"

# -------------------------------------------------
# Step 1 — Stop *all* Node processes bound to 3000/3001
# -------------------------------------------------
echo "🛑 Stopping existing WattSun Node processes..."

PIDS=$(ps -ef | grep "[n]ode.*server\.js" | grep -E "3000|3001" | awk '{print $2}')
if [ -n "$PIDS" ]; then
  echo "Found running processes: $PIDS"
  kill -9 $PIDS 2>/dev/null || true
  sleep 2
  echo "✅ All previous WattSun Node processes stopped."
else
  echo "No running WattSun Node processes found."
fi

# Safety double-check: free ports 3000/3001
for PORT in 3000 3001; do
  PROC=$(netstat -tlnp 2>/dev/null | grep ":$PORT" | awk '{print $7}' | cut -d'/' -f1)
  if [ -n "$PROC" ]; then
    echo "⚠️  Port $PORT still in use by PID $PROC — forcing kill"
    kill -9 "$PROC" 2>/dev/null || true
  fi
done

# -------------------------------------------------
# Step 2 — Clean logs
# -------------------------------------------------
echo "🧹 Cleaning old logs..."
: > "$LOG_DIR/dev.log"
: > "$LOG_DIR/qa.log"

# -------------------------------------------------
# Step 3 — Start helpers
# -------------------------------------------------
start_instance() {
  local NAME="$1"
  local PORT="$2"
  local LOG_FILE="$LOG_DIR/${NAME}.log"

  echo "▶️  Launching ${NAME^^} (port $PORT)..."
  PORT=$PORT nohup node server.js >"$LOG_FILE" 2>&1 &
  sleep 2

  if netstat -tlnp 2>/dev/null | grep -q ":$PORT"; then
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
