#!/bin/bash
# ============================================================
# 🔧 WattSun Utility — Fix inventory.priceCents from price
# ------------------------------------------------------------
# Safe patch that populates priceCents = price * 100
# only where priceCents = 0 or NULL.
#
# Applies to both DEV and QA environments.
# Creates a timestamped backup before modifying each DB.
# ============================================================

set -euo pipefail

ROOT="/volume1/web/wattsun"
DATA_DEV="$ROOT/data/dev/inventory.dev.db"
DATA_QA="$ROOT/data/qa/inventory.qa.db"
BACKUP_DIR="$ROOT/backups/inventory_price_patch_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "============================================================"
echo "🔧  WattSun Inventory PriceCents Fix"
echo "============================================================"
echo "Timestamp: $(date)"
echo "Backup directory: $BACKUP_DIR"
echo

for DB in "$DATA_DEV" "$DATA_QA"; do
  if [ ! -f "$DB" ]; then
    echo "⚠️  Skipping: $DB (file not found)"
    continue
  fi

  NAME=$(basename "$DB")
  echo "📦 Processing $NAME ..."
  cp "$DB" "$BACKUP_DIR/$NAME.bak"
  echo "   → Backup saved to $BACKUP_DIR/$NAME.bak"

  BEFORE=$(sqlite3 "$DB" "SELECT COUNT(*) FROM items WHERE priceCents=0 OR priceCents IS NULL;")
  TOTAL=$(sqlite3 "$DB" "SELECT COUNT(*) FROM items;")
  echo "   Items before patch: $BEFORE/$TOTAL have empty priceCents"

  sqlite3 "$DB" <<'SQL'
  UPDATE items
  SET priceCents = price * 100
  WHERE (priceCents IS NULL OR priceCents = 0)
    AND price IS NOT NULL
    AND price > 0;
SQL

  AFTER=$(sqlite3 "$DB" "SELECT COUNT(*) FROM items WHERE priceCents=0 OR priceCents IS NULL;")
  echo "   ✅ Patch applied. Items still empty: $AFTER"
  echo
done

echo "------------------------------------------------------------"
echo "🧩 Verification (sample 5 rows per DB)"
echo "------------------------------------------------------------"
for DB in "$DATA_DEV" "$DATA_QA"; do
  if [ -f "$DB" ]; then
    NAME=$(basename "$DB")
    echo
    echo "📊 $NAME:"
    sqlite3 "$DB" "SELECT id,name,price,priceCents FROM items LIMIT 5;"
  fi
done

echo
echo "✅ Completed successfully."
echo "Backups stored in: $BACKUP_DIR"
echo "============================================================"
