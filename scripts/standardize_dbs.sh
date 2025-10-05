#!/bin/sh
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p data/dev logs run

# Stop app to avoid locks
[ -f run/app.pid ] && kill "$(cat run/app.pid)" || true

# For each *.db in the previous checkout, copy & link
( cd ../wattsun.bak && find . -type f -name '*.db' | sed 's|^\./||' ) | while IFS= read -r rel; do
  src="../wattsun.bak/$rel"
  # Skip if current repo already has a symlink at that path
  if [ -L "$rel" ]; then
    echo "… skipping $rel (already symlinked)"
    continue
  fi

  base="$(basename "$rel" .db)"
  tgt="data/dev/${base}.dev.db"

  echo "→ Migrating $src -> $tgt and linking $rel"
  mkdir -p "$(dirname "$tgt")" "$(dirname "$rel")"
  cp -a "$src" "$tgt"

  # Absolute symlink (robust on BusyBox/Synology)
  ln -sf "$ROOT/$tgt" "$rel"
done

# Restart app
set -a; [ -f .env ] && . ./.env; set +a
nohup node server.js >> logs/app.out 2>> logs/app.err & echo $! > run/app.pid
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:${PORT:-3001}/api/health" || true
