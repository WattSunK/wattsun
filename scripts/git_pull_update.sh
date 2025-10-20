#!/bin/sh
# =====================================================
# WattSun NAS Git Pull (minimal, non-disruptive)
# -----------------------------------------------------
# - Verifies remote origin
# - Fetches latest changes
# - Fast-forwards current branch (no hard reset)
# - Logs old/new SHAs and changed files
# - Does NOT stop/start services, chmod, sed, npm, or health checks
# =====================================================

set -eu

ROOT="/volume1/web/wattsun"
LOGFILE="$ROOT/logs/update.log"
EXPECTED_REMOTE="git@github.com:WattSunK/wattsun.git"

mkdir -p "$ROOT/logs" "$ROOT/run" 2>/dev/null || true
echo "=== NAS Git Pull started at $(date) ===" >> "$LOGFILE" 2>&1
exec >> "$LOGFILE" 2>&1

cd "$ROOT" || { echo "[fatal] Repo directory not found: $ROOT"; exit 1; }

# Stabilize git metadata to avoid spurious timestamp changes
git config core.filemode false 2>/dev/null || true
git config core.autocrlf false 2>/dev/null || true

# Verify correct Git remote
CUR_REMOTE="$(git remote get-url origin 2>/dev/null || echo "")"
if [ "$CUR_REMOTE" != "$EXPECTED_REMOTE" ]; then
  echo "[warn] origin was '$CUR_REMOTE' -> fixing to '$EXPECTED_REMOTE'"
  git remote set-url origin "$EXPECTED_REMOTE"
fi
git remote set-url --push origin DISABLED 2>/dev/null || true

# Determine branch (fallback to remote HEAD or main)
BRANCH="$(git branch --show-current 2>/dev/null || true)"
if [ -z "$BRANCH" ]; then
  BRANCH="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@' || true)"
fi
[ -z "$BRANCH" ] && BRANCH=main
echo "[info] Using branch: $BRANCH"

OLD_SHA="$(git rev-parse HEAD 2>/dev/null || echo '')"
echo "[info] Current HEAD: ${OLD_SHA:-<none>}"

echo "[step] Fetching latest from origin"
git fetch --all --prune

echo "[step] Fast-forward merging origin/$BRANCH"
if git merge --ff-only "origin/$BRANCH"; then
  :
else
  echo "[error] Fast-forward failed (local changes or diverged history)."
  echo "[hint] Resolve locally or run a forced update manually if intended:"
  echo "       git reset --hard origin/$BRANCH && git clean -fd"
  echo "=== NAS Git Pull finished (FAILED) at $(date) ==="
  exit 1
fi

NEW_SHA="$(git rev-parse HEAD)"
echo "[info] Updated HEAD: $NEW_SHA"

if [ -n "$OLD_SHA" ] && [ "$OLD_SHA" != "$NEW_SHA" ]; then
  echo "[changes] Files updated since $OLD_SHA:" \
    && git diff --name-status "$OLD_SHA" "$NEW_SHA" || true
else
  echo "[changes] No changes"
fi

echo "$NEW_SHA" > run/last_sha 2>/dev/null || true
echo "=== NAS Git Pull finished (OK) at $(date) ==="

