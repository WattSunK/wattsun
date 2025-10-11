#!/bin/sh
# Monorepo updater for NAS (pull-only)
# - Fixes origin to WattSunK/wattsun and disables pushes
# - Stops app, fetch/reset to origin/<current branch>
# - Skips npm install if lockfile unchanged; shows progress if running
# - Starts app and verifies health; logs to logs/update.log

set -eu

ROOT="/volume1/web/wattsun"
LOGFILE="$ROOT/logs/update.log"
PORT="${PORT:-3001}"
EXPECTED_REMOTE="git@github.com:WattSunK/wattsun.git"

mkdir -p "$ROOT/logs" "$ROOT/run"
echo "=== Update started at $(date) ===" >> "$LOGFILE" 2>&1
exec >> "$LOGFILE" 2>&1

echo "[info] cd $ROOT"
cd "$ROOT" || { echo "[fatal] Repo directory not found: $ROOT"; exit 1; }

# Guard: correct remote if it ever drifts
CUR_REMOTE="$(git remote get-url origin 2>/dev/null || echo "")"
if [ "$CUR_REMOTE" != "$EXPECTED_REMOTE" ]; then
  echo "[warn] origin was '$CUR_REMOTE' → fixing to '$EXPECTED_REMOTE'"
  git remote set-url origin "$EXPECTED_REMOTE"
fi
# Block accidental pushes from NAS
git remote set-url --push origin DISABLED 2>/dev/null || true

echo "[step] stopping app"
if [ -x scripts/stop_nas.sh ]; then
  scripts/stop_nas.sh || true
else
  if [ -f run/app.pid ]; then
    PID="$(cat run/app.pid || true)"
    [ -n "$PID" ] && kill "$PID" 2>/dev/null || true
    rm -f run/app.pid
  fi
  INUSE_PID="$(netstat -tlnp 2>/dev/null | awk -v P="$PORT" '$4 ~ ":"P && $6=="LISTEN" { split($7,a,"/"); print a[1]; exit }')"
  [ -n "${INUSE_PID:-}" ] && kill "$INUSE_PID" 2>/dev/null || true
fi

echo "[step] fetching latest"
git fetch --all

# Detect current branch
BRANCH=$(git branch --show-current)

if [ -z "$BRANCH" ]; then
  echo "[fatal] Could not detect current branch!"
  exit 1
fi

# Check branch exists on origin
if ! git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
  echo "[fatal] Branch '$BRANCH' not found in origin!"
  echo "[hint] Push it first: git push origin $BRANCH"
  exit 1
fi

echo "[info] Resetting to origin/$BRANCH"
git reset --hard "origin/$BRANCH"
git clean -fd

NEW_SHA="$(git rev-parse HEAD)"
OLD_SHA="$(cat run/last_sha 2>/dev/null || echo '')"

echo "[step] normalize scripts"
sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true
chmod +x scripts/*.sh 2>/dev/null || true

# Decide if we actually need npm install
LOCK_CHANGED=1
if [ -n "$OLD_SHA" ]; then
  LOCK_CHANGED="$(git diff --name-only "$OLD_SHA" "$NEW_SHA" | grep -c '^package-lock\.json$' || true)"
fi

if [ ! -d node_modules ] || [ -z "$OLD_SHA" ] || [ "$LOCK_CHANGED" -gt 0 ]; then
  echo "[step] install/refresh deps (node_modules missing or lockfile changed)"
  ( npm ci --omit=dev ) &
  npm_pid=$!
  secs=0
  while kill -0 "$npm_pid" 2>/dev/null; do
    secs=$((secs+1))
    if [ $((secs % 5)) -eq 0 ]; then
      echo "… npm still running (${secs}s)"
    fi
    sleep 1
  done
  wait "$npm_pid" || npm install --omit=dev
else
  echo "[skip] deps unchanged; skipping npm install"
fi

echo "[step] starting app"
if [ -x scripts/start_nas.sh ]; then
  scripts/start_nas.sh
else
  nohup node server.js >> "$ROOT/logs/app.out" 2>> "$ROOT/logs/app.err" &
  echo $! > "$ROOT/run/app.pid"
  echo "[warn] used fallback start; consider restoring scripts/start_nas.sh"
fi

echo "[step] health check"
ok=0; i=0
while [ $i -lt 5 ]; do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/api/health" || true)"
  echo "health ${code}"
  if [ "$code" = "200" ]; then ok=1; break; fi
  i=$((i+1)); sleep 2
done

if [ "$ok" -ne 1 ]; then
  echo "[error] health check failed"
  echo "=== Update finished (FAILED) at $(date) ==="
  exit 1
fi

echo "$NEW_SHA" > run/last_sha || true
echo "[ok] service healthy on port ${PORT} (commit $NEW_SHA)"
echo "=== Update finished (OK) at $(date) ==="
