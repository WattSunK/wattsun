#!/bin/bash
set -e

# ============================================================
# 🧩 WattSun QA Environment Sanity Check
# ============================================================

ROOT="/volume1/web/wattsun"
DATA_QA="$ROOT/data/qa"
LOGS_QA="$ROOT/qa/logs"
BACKUPS="$ROOT/backups"
DATE=$(date "+%a %b %d %T %Z %Y")

echo "============================================================"
echo "🧩 WattSun QA Environment Sanity Check — $DATE"
echo "============================================================"
echo

# 1️⃣ Check SQLite databases
echo "[1/7] 🧱 Checking SQLite databases..."
for db in "$DATA_QA/wattsun.qa.db" "$DATA_QA/inventory.qa.db"; do
  if [ -f "$db" ]; then
    size=$(du -h "$db" | cut -f1)
    echo "✅ Found: $db ($size)"
    if sqlite3 "$db" "PRAGMA integrity_check;" | grep -q "ok"; then
      echo "   → Integrity OK"
    else
      echo "❌ Integrity check FAILED for $db"
    fi
  else
    echo "❌ Missing: $db"
  fi
done

echo
echo "📋 Checking key tables..."
sqlite3 "$DATA_QA/wattsun.qa.db" "SELECT name FROM sqlite_master WHERE type='table' AND name='users';" | grep -q users && echo "✅ users table OK" || echo "❌ users table missing"
sqlite3 "$DATA_QA/wattsun.qa.db" ".tables" | grep -q loyalty && echo "✅ loyalty tables present" || echo "⚠️  loyalty tables missing"
sqlite3 "$DATA_QA/inventory.qa.db" ".tables" | grep -q items && echo "✅ items table OK" || echo "❌ items table missing"
sqlite3 "$DATA_QA/inventory.qa.db" ".tables" | grep -q categories && echo "✅ categories table OK" || echo "❌ categories table missing"

# 2️⃣ Schema columns check
echo
echo "[2/7] 🔗 Checking schema columns..."
for col in priceCents depositCents currency categoryId; do
  if sqlite3 "$DATA_QA/inventory.qa.db" "PRAGMA table_info(items);" | grep -q "$col"; then
    echo "✅ Column '$col' exists"
  else
    echo "❌ Column '$col' missing"
  fi
done

# 3️⃣ Running processes
echo
echo "[3/7] ⚙️  Checking running processes..."
if ps -ef | grep -q "[q]a/server.js"; then
  echo "✅ Backend server running"
else
  echo "❌ Server not running"
fi
if ps -ef | grep -q "[q]a/scripts/notifications_worker.js"; then
  echo "✅ Notifications worker active"
else
  echo "⚠️  Worker not running"
fi

# 4️⃣ API endpoints
echo
echo "[4/7] 🌐 Testing API endpoints..."
curl -fsS http://127.0.0.1:3000/api/health >/dev/null && echo "✅ Health endpoint OK (/api/health)" || echo "❌ Health endpoint failed"
curl -fsS http://127.0.0.1:3000/api/categories >/dev/null && echo "✅ Categories endpoint OK (/api/categories)" || echo "⚠️  Categories endpoint failed"
curl -fsS http://127.0.0.1:3000/api/items >/dev/null && echo "✅ Items endpoint OK (/api/items)" || echo "⚠️  Items endpoint failed"

# 5️⃣ Logs
echo
echo "[5/7] 🧾 Checking log summaries..."
tail -n 5 "$LOGS_QA/app.out" 2>/dev/null || echo "⚠️  app.out log missing"
tail -n 5 "$LOGS_QA/worker.out" 2>/dev/null || echo "⚠️  worker.out log missing"

# 6️⃣ Backups
echo
echo "[6/7] 💾 Checking backup presence..."
latest_backup=$(ls -1t "$BACKUPS"/wattsun.dev.livecopy.*.db 2>/dev/null | head -n 1)
if [ -n "$latest_backup" ]; then
  ls -lh "$latest_backup"
else
  echo "⚠️  No recent livecopy backups found"
fi

# 7️⃣ Startup scripts
echo
echo "[7/7] 🧩 Checking startup scripts..."
for script in "$ROOT/scripts/start_qa.sh" "$ROOT/scripts/start_dev.sh"; do
  if head -n 1 "$script" | grep -q "#!/bin/bash"; then
    echo "✅ $script has valid shebang"
  else
    echo "⚠️  $script has BOM or invalid header"
  fi
done

echo
echo "============================================================"
echo "🏁 QA sanity check complete — review any ⚠️ or ❌ lines above."
echo "============================================================"
