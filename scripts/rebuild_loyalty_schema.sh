#!/bin/bash
# ============================================================
# ⚙️  WattSun Loyalty Schema Rebuild (Dev + QA)
# ============================================================
# This script:
#  1. Creates timestamped backups of both dev & qa databases
#  2. Sequentially applies all loyalty-related SQL migrations
#  3. Verifies tables, views, and triggers
# ============================================================

set -euo pipefail

ROOT="/volume1/web/wattsun"
SQL_DIR="$ROOT/scripts/sql"
TS=$(date +"%Y%m%d_%H%M%S")
LOG="$ROOT/logs/rebuild_loyalty_${TS}.log"

DEV_DB="$ROOT/data/dev/wattsun.dev.db"
QA_DB="$ROOT/data/qa/wattsun.qa.db"

echo "============================================================"
echo "🔧 WattSun Loyalty Schema Rebuild"
echo "Timestamp: $TS"
echo "Log file: $LOG"
echo "============================================================"

# --- Safety checks
for db in "$DEV_DB" "$QA_DB"; do
  if [[ ! -f "$db" ]]; then
    echo "❌ Missing DB: $db — aborting."
    exit 1
  fi
done

# --- Backups
echo "📦 Backing up current databases..."
cp "$DEV_DB" "$ROOT/backups/wattsun.dev.db.backup.$TS"
cp "$QA_DB"  "$ROOT/backups/wattsun.qa.db.backup.$TS"
echo "✅ Backups saved under /backups/"

# --- Ordered SQL migrations
MIGRATIONS=(
  "2025-10-01_init.sql"
  "2025-09-21_loyalty_init.sql"
  "2025-10-08_add_user_status.sql"
  "2025-10-08_add_fk_loyalty_user.sql"
  "2025-10-09_fix_fk_loyalty_accounts.sql"
  "2025-10-10_loyalty_withdrawal_meta_fix.sql"
  "fix_v_withdrawals_unified.sql"
  "triggers_user_loyalty_sync.sql"
  "2025-10-15_upgrade_loyalty_programs.sql"
)

echo "============================================================"
echo "🚀 Applying migrations to DEV ($DEV_DB)"
echo "============================================================"
for file in "${MIGRATIONS[@]}"; do
  echo "➡️  Applying $file..."
  sqlite3 "$DEV_DB" < "$SQL_DIR/$file" >> "$LOG" 2>&1 || {
    echo "❌ Error applying $file to DEV. Check $LOG."
    exit 1
  }
done
echo "✅ DEV database migration complete."

echo "============================================================"
echo "🚀 Applying migrations to QA ($QA_DB)"
echo "============================================================"
for file in "${MIGRATIONS[@]}"; do
  echo "➡️  Applying $file..."
  sqlite3 "$QA_DB" < "$SQL_DIR/$file" >> "$LOG" 2>&1 || {
    echo "❌ Error applying $file to QA. Check $LOG."
    exit 1
  }
done
echo "✅ QA database migration complete."

# --- Verification
echo "============================================================"
echo "🔍 Verifying tables, views, and triggers..."
echo "============================================================"
for env in dev qa; do
  DB="$ROOT/data/$env/wattsun.$env.db"
  echo -e "\n📦 $env → $DB"
  echo "  Loyalty tables:"
  sqlite3 "$DB" ".tables" | tr ' ' '\n' | grep -E "loyalty|notifications" | sed 's/^/    └── /'
  echo "  Views:"
  sqlite3 "$DB" "SELECT name FROM sqlite_master WHERE type='view';" | sed 's/^/    └── /'
  echo "  Triggers:"
  sqlite3 "$DB" "SELECT name FROM sqlite_master WHERE type='trigger';" | sed 's/^/    └── /'
done

echo "============================================================"
echo "🎉 Loyalty schema rebuild completed successfully."
echo "Detailed log saved at: $LOG"
echo "============================================================"
