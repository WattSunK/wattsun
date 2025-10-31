#!/bin/bash
ROOT=/volume1/web/marketplace
LOG=$ROOT/logs/integration/invoiceninja.log
echo "🧩 Running Invoice Ninja sync job..." | tee -a "$LOG"
node $ROOT/services/invoiceninja-sync.js >> "$LOG" 2>&1
echo "✅ Sync job finished." | tee -a "$LOG"
