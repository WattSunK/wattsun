#!/bin/sh
# =====================================================
# 🔁 WattSun Monorepo Updater (Environment-Aware, Patched)
# -----------------------------------------------------
# Detects environment (Dev or QA)
# Pulls and resets current branch
# Runs env-specific stop/start scripts
# Verifies dependencies non-destructively
# =====================================================

set -eu

ROOT="/volume1/web/wattsun"
LOGFILE="$ROOT/logs/update.log"
EXPECTED_REMOTE="git@github.com:WattSunK/wattsun.git"

mkdir -p "$ROOT/logs" "$ROOT/run"
echo "=== Update started at $(date) ===" >> "$LOGFILE" 2>&1
exec >> "$LOGFILE" 2>&1

cd "$ROOT" || { echo "[fatal] Repo directory not found: $ROOT"; exit 1; }

# -----------------------------------------------------
# 🧩 Detect environment
# -----------------------------------------------------
ENV="dev"
PORT=3001
STOP_SCRIPT="scripts/stop_dev.sh"
START_SCRIPT="scripts/start_dev.sh"

if grep -q "NODE_ENV=qa" .env.qa 2>/dev/null; then
  ENV="qa"
  PORT=3000
  STOP_SCRIPT="scripts/stop_qa.sh"
  START_SCRIPT="scripts/start_qa.sh"
fi

echo "[info] Detected environment: $ENV (port $PORT)"
echo "[info] Logfile: $LOGFILE"

# -----------------------------------------------------
# 🧩 Verify correct Git remote
# -----------------------------------------------------
CUR_REMOTE="$(git remote get-url origin 2>/dev/null || echo "")"
if [ "$CUR_REMOTE" != "$EXPECTED_REMOTE" ]; then
  echo "[warn] origin was '$CUR_REMOTE' → fixing to '$EXPECTED_REMOTE'"
  git remote set-url origin "$EXPECTED_REMOTE"
fi
git remote set-url --push origin DISABLED 2>/dev/null || true

# -----------------------------------------------------
# 🧩 Stop current environment
# -----------------------------------------------------
echo "[step] stopping $ENV app"
if [ -x "$STOP_SCRIPT" ]; then
  "$STOP_SCRIPT" || true
else
  if [ -f "run/${ENV}/app.pid" ]; then
    PID=$(cat "run/${ENV}/app.pid" || true)
    [ -n "$PID" ] && kill "$PID" 2>/dev/null || true
    rm -f "run/${ENV}/app.pid"
  fi
fi

# -----------------------------------------------------
# 🧩 Fetch + Reset
# -----------------------------------------------------
echo "[step] fetching latest"
git fetch --all

BRANCH=$(git branch --show-current || true)
[ -z "$BRANCH" ] && { echo "[fatal] could not detect branch"; exit 1; }

if ! git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
  echo "[fatal] branch '$BRANCH' not found in origin"
  exit 1
fi

echo "[info] Resetting to origin/$BRANCH"
git reset --hard "origin/$BRANCH"
git clean -fd

NEW_SHA="$(git rev-parse HEAD)"
OLD_SHA="$(cat run/last_sha 2>/dev/null || echo '')"

# -----------------------------------------------------
# 🧩 Normalize scripts + verify dependencies
# -----------------------------------------------------
sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true
chmod +x scripts/*.sh 2>/dev/null || true

LOCK_CHANGED=1
if [ -n "$OLD_SHA" ]; then
  LOCK_CHANGED="$(git diff --name-only "$OLD_SHA" "$NEW_SHA" | grep -c '^package-lock\\.json$' || true)"
fi

# ✅ Patched section: non-destructive dependency verification
if [ ! -d node_modules ] || [ -z "$OLD_SHA" ] || [ "$LOCK_CHANGED" -gt 0 ]; then
  echo "[step] verifying dependencies"
  npm install --omit=dev
else
  echo "[skip] deps unchanged"
fi

# -----------------------------------------------------
# 🧩 Start environment
# -----------------------------------------------------
echo "[step] starting $ENV app"
if [ -x "$START_SCRIPT" ]; then
  "$START_SCRIPT"
else
  nohup node server.js >> "logs/${ENV}/app.out" 2>> "logs/${ENV}/app.err" &
  echo $! > "run/${ENV}/app.pid"
  echo "[warn] used fallback start"
fi

# -----------------------------------------------------
# 🧩 Health check
# -----------------------------------------------------
echo "[step] health check"
ok=0; i=0
while [ $i -lt 5 ]; do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/api/health" || true)"
  echo "health ${code}"
  if [ "$code" = "200" ]; then ok=1; break; fi
  i=$((i+1)); sleep 2
done

if [ "$ok" -ne 1 ]; then
  echo "[error] health check failed for ${ENV} on port ${PORT}"
  echo "=== Update finished (FAILED) at $(date) ==="
  exit 1
fi

echo "$NEW_SHA" > run/last_sha || true
echo "[ok] ${ENV} service healthy on port ${PORT} (commit $NEW_SHA)"
echo "=== Update finished (OK) at $(date) ==="
