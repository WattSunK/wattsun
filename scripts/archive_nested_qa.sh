#!/bin/bash
# =====================================================================
# 🗜️  WattSun Utility: Archive Nested QA Directories
# ---------------------------------------------------------------------
# Keeps the primary QA environment at /volume1/web/wattsun/qa/
# Archives and removes any nested QA directories (qa/qa/, qa/qa/qa/, etc.)
# Creates a timestamped backup tarball under ./archive/
# =====================================================================

set -euo pipefail

BASE_DIR="/volume1/web/wattsun"
QA_ROOT="$BASE_DIR/qa"
ARCHIVE_DIR="$BASE_DIR/archive"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
ARCHIVE_FILE="$ARCHIVE_DIR/qa_nested_backup_$TIMESTAMP.tar.gz"

echo "============================================================"
echo "🏗️  WattSun QA Nested Archive Utility"
echo "============================================================"
echo "[*] Base directory: $BASE_DIR"
echo "[*] Primary QA root: $QA_ROOT"
echo "[*] Archive target:  $ARCHIVE_FILE"
echo

# 1️⃣ Ensure archive folder exists
mkdir -p "$ARCHIVE_DIR"

# 2️⃣ Find nested QA directories (anything inside qa/qa*/…)
echo "[*] Searching for nested QA directories..."
NESTED_DIRS=$(find "$QA_ROOT" -type d -path "$QA_ROOT/qa*" -maxdepth 4 || true)

if [ -z "$NESTED_DIRS" ]; then
  echo "✅ No nested QA directories found."
  exit 0
fi

echo "[!] Found the following nested QA directories:"
echo "$NESTED_DIRS"
echo

# 3️⃣ Create compressed backup archive
echo "[*] Archiving nested QA directories..."
tar -czf "$ARCHIVE_FILE" $NESTED_DIRS
echo "✅ Archive created: $ARCHIVE_FILE"

# 4️⃣ Remove nested directories
echo "[*] Removing archived directories..."
for d in $NESTED_DIRS; do
  echo "   - Deleting $d"
  rm -rf "$d"
done

# 5️⃣ Final verification
echo
echo "[*] Remaining QA structure:"
find "$QA_ROOT" -maxdepth 2 -type d
echo
echo "✅ Cleanup complete. Nested QA directories have been archived and removed."
echo "============================================================"
