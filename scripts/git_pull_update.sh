#!/bin/sh
# Monorepo updater for NAS (pull-only)
# - Ensures origin points to WattSunK/wattsun
# - Stops current app safely
# - Fetch/reset to origin/main
# - Normalizes scripts, installs deps
# - Starts app and verifies health
set -eu

ROOT="/volume1/web/wattsun"
LOGFILE="$ROOT/logs/update.log"
PORT="${PORT:-3001}"
EXPECTED_REMOTE="git@github.com:WattSunK/wattsun.git"

mkdir -p "$ROOT/logs" "$ROOT/run"
echo "=== Update started at $(date) ===" >> "$LOGFILE" 2>&1
# send all subsequent output to the log
exec >> "$LOGFILE" 2>&1

echo "[info] cd $ROOT"
cd "$ROOT" || { echo "[fatal] Repo directory not found: $ROOT"; exit 1; }

# Guard: correct remote if it drifted to an old repo
CUR_REMOTE="$(git remote get-url origin 2>/dev/null || echo "")"
if [ "$CUR_REMOTE" != "$EXPECTED_REMOTE" ]; then
  echo "[warn] origin was '$CUR_REMOTE' → fixing to '$EXPECTED_REMOTE'"
  git remote set-url origin "$EXPECTED_REMOTE"
fi

# Optional: make this clone pull-only (blocks accidental pushes)
if ! git remote -v | awk '$1=="origin" && $2=="DISABLED" && $3=="(push)"' | grep -q .; then
  git remote set-url --push origin DISABLED || true
fi

echo "[step] stopping app"
if [ -x scripts/stop_nas.sh ]; then
  scripts/stop_nas.sh || true
else
  # Fallback: stop by PID file or by port owner
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
git reset --hard origin/main
git clean -fd

echo "[step] normalize scripts"
sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true
chmod +x scripts/*.sh 2>/dev/null || true

echo "[step] install/refresh deps"
npm ci --omit=dev || npm install --omit=dev

echo "[step] starting app"
if [ -x scripts/start_nas.sh ]; then
  scripts/start_nas.sh
else
  # Minimal fallback if helper missing
  set +e
  nohup node server.js >> "$ROOT/logs/app.out" 2>> "$ROOT/logs/app.err" &
  echo $! > "$ROOT/run/app.pid"
  set -e
  echo "[warn] used fallback start; consider restoring scripts/start_nas.sh"
fi

echo "[step] health check"
ok=0
i=0
while [ $i -lt 5 ]; do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/api/health" || true)"
  echo "health ${code}"
  if [ "$code" = "200" ]; then ok=1; break; fi
  i=$((i+1))
  sleep 2
done

if [ "$ok" -ne 1 ]; then
  echo "[error] health check failed"
  echo "=== Update finished (FAILED) at $(date) ==="
  exit 1
fi

echo "[ok] service healthy on port ${PORT}"
echo "=== Update finished (OK) at $(date) ==="
