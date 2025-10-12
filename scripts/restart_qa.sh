#!/bin/bash
# ===========================================
# ♻️ Restart WattSun QA Environment
# ===========================================

"$(dirname "$0")/stop_qa.sh" || true
sleep 1
"$(dirname "$0")/start_qa.sh"
