#!/bin/bash
# =====================================================
# ♻️ WattSun Full Environment Restart (Dev + QA)
# =====================================================

# Always run from the WattSun project root to prevent ESM bleed from /web/marketplace
cd /volume1/web/wattsun || {
  echo "❌ Failed to enter /volume1/web/wattsun"
  exit 1
}

SCRIPTS_DIR="$(pwd)/scripts"
LOG_DIR="$(pwd)/logs"

mkdir -p "$LOG_DIR"

echo "🔄 Restarting WattSun environments..."

# -----------------------------
# Helper: restart one instance
# -----------------------------
restart_instance() {
  local NAME="$1"
  local PORT="$2"
  local LOG_FILE="$LOG_DIR/${NAME}.log"

  echo "🟩 Restarting ${NAME^} environment..."

  PID=$(pgrep -f "server.js.*${PORT}" || true)
  if [ -n "$PID" ]; then
    echo "[${NAME}] Stopping PID $PID ..."
    kill "$PID" 2>/dev/null || true
    sleep 2
  else
    echo "[${NAME}] PID file not found — is ${NAME} running?"
  fi

  echo "[${NAME}] Starting WattSun ${NAME^} server on port $PORT ..."
  nohup node server.js --port="$PORT" > "$LOG_FILE" 2>&1 &
  sleep 2

  if pgrep -f "server.js.*${PORT}" >/dev/null; then
    echo "[${NAME}] WattSun ${NAME^} server running on port $PORT"
  else
    echo "[${NAME}] ❌ Failed to start on port $PORT — check $LOG_FILE"
  fi
}

# -----------------------------
# Restart both environments
# -----------------------------
restart_instance "dev" 3001
restart_instance "qa" 3000

echo "✅ WattSun restart cycle complete."
echo "Logs: $LOG_DIR/dev.log , $LOG_DIR/qa.log"
