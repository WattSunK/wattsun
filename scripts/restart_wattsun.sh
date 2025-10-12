#!/bin/bash
# =====================================================
# ♻️ WattSun Full Environment Restart (Dev + QA)
# =====================================================

cd "$(dirname "$0")" || exit 1
SCRIPTS_DIR="$(pwd)"

echo "🔄 Restarting WattSun environments..."

# Restart Dev (port 3001)
if [ -f "$SCRIPTS_DIR/restart_dev.sh" ]; then
  echo "🟩 Restarting Dev environment..."
  "$SCRIPTS_DIR/restart_dev.sh" || echo "⚠️  Dev restart failed"
else
  echo "⚠️  restart_dev.sh not found"
fi

# Restart QA (port 3000)
if [ -f "$SCRIPTS_DIR/restart_qa.sh" ]; then
  echo "🟦 Restarting QA environment..."
  "$SCRIPTS_DIR/restart_qa.sh" || echo "⚠️  QA restart failed"
else
  echo "⚠️  restart_qa.sh not found"
fi

echo "✅ WattSun restart cycle complete."
