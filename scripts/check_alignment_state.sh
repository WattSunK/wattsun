#!/bin/bash
# ============================================================
# 🧩 WattSun – Git Alignment Status Checker
# ============================================================
# Verifies that local NAS repo matches origin/main (GitHub)
# and prints current commit hashes for quick inspection.
# No destructive operations – read-only check.
# ============================================================

set -e
cd "$(dirname "$0")/.." || exit 1

echo "============================================================"
echo "🔍  Checking Git alignment for WattSun repo"
echo "============================================================"

HEAD_HASH=$(git rev-parse HEAD 2>/dev/null || echo "N/A")
REMOTE_HASH=$(git rev-parse origin/main 2>/dev/null || echo "N/A")

echo "📦  Local HEAD:     $HEAD_HASH"
echo "🌐  Origin (main):  $REMOTE_HASH"

if [ "$HEAD_HASH" = "$REMOTE_HASH" ]; then
  echo "✅  Repo is fully aligned with origin/main."
else
  echo "⚠️  Repo is NOT aligned. Consider: git fetch origin main && git merge --ff-only origin/main"
fi

echo
git status -s || true
echo "============================================================"
