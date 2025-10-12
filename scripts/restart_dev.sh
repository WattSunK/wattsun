#!/bin/bash
# ===========================================
# ♻️ Restart WattSun Dev Environment
# ===========================================

"$(dirname "$0")/stop_dev.sh" || true
sleep 1
"$(dirname "$0")/start_dev.sh"
