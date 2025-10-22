#!/bin/bash
# ===========================================
# Restart WattSun QA Environment
# ===========================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[qa] restarting..."
"$HERE/stop_qa.sh" || true
sleep 1
"$HERE/start_qa.sh"
echo "[qa] restart invoked; check /volume1/web/wattsun/qa/logs/app.out"

