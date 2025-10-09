#!/bin/bash
# ============================================================================
# 🧹 loyalty_reset.sh — Clean up all Loyalty-related tables for a fresh E2E test
# WattSun Project | 2025-10-09
# ============================================================================
DB="/volume1/web/wattsun/data/dev/wattsun.dev.db"

echo "=== ⚙️  Cleaning Loyalty and Notification tables for fresh E2E validation ==="

sqlite3 $DB <<'SQL'
PRAGMA foreign_keys = OFF;

DELETE FROM loyalty_ledger;
DELETE FROM loyalty_accounts;
DELETE FROM notifications_queue WHERE kind IN ('loyalty','penalty','withdrawal','bonus');

-- Optionally reset auto-increment counters
DELETE FROM sqlite_sequence WHERE name IN ('loyalty_ledger','loyalty_accounts','notifications_queue');

PRAGMA foreign_keys = ON;
SQL

echo "✅ Loyalty tables and notifications_queue cleaned."
echo "You can now rerun: bash scripts/loyalty_e2e_check.sh"
