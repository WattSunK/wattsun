#!/bin/bash
# =====================================================================
#  WattSun Dev Sanity Check Utility
#  Verifies DB integrity, environment, routes, workers, and backups
# =====================================================================

set -e

ROOT="/volume1/web/wattsun"
DATA_DEV="$ROOT/data/dev"
LOGS_DEV="$ROOT/logs/dev"
SERVER_PORT=3001

echo "============================================================"
echo "🧩 WattSun DEV Environment Sanity Check — $(date)"
echo "============================================================"

# -------------------------------------------------------------
# 1️⃣ Database integrity checks
# -------------------------------------------------------------
echo -e "\n[1/7] 🧱 Checking SQLite databases..."
for db in "$DATA_DEV/wattsun.dev.db" "$DATA_DEV/inventory.dev.db"; do
  if [ -f "$db" ]; then
    echo "✅ Found: $db ($(du -h "$db" | cut -f1))"
    sqlite3 "$db" "PRAGMA integrity_check;" | grep -q ok && echo "   → Integrity OK" || echo "   ❌ Integrity FAILED"
  else
    echo "❌ Missing: $db"
  fi
done

echo -e "\n📋 Checking key tables..."
sqlite3 "$DATA_DEV/wattsun.dev.db" ".tables" | grep -q users && echo "✅ users table OK" || echo "❌ users table missing"
sqlite3 "$DATA_DEV/wattsun.dev.db" ".tables" | grep -q loyalty_ledger && echo "✅ loyalty tables present" || echo "⚠️ loyalty tables missing"
sqlite3 "$DATA_DEV/inventory.dev.db" ".tables" | grep -q items && echo "✅ items table OK" || echo "❌ items table missing"
sqlite3 "$DATA_DEV/inventory.dev.db" ".tables" | grep -q categories && echo "✅ categories table OK" || echo "❌ categories table missing"

# -------------------------------------------------------------
# 2️⃣ Foreign keys & columns
# -------------------------------------------------------------
echo -e "\n[2/7] 🔗 Checking schema columns..."
for col in priceCents depositCents currency categoryId; do
  sqlite3 "$DATA_DEV/inventory.dev.db" "PRAGMA table_info(items);" | grep -q "$col" \
    && echo "✅ Column '$col' exists" \
    || echo "⚠️ Missing column: $col"
done

# -------------------------------------------------------------
# 3️⃣ Server & worker process checks
# -------------------------------------------------------------
echo -e "\n[3/7] ⚙️  Checking running processes..."
ps -ef | grep "wattsun/server.js" >/dev/null && echo "✅ Backend server running" || echo "❌ Server not running"
ps -ef | grep "notifications_worker.js" >/dev/null && echo "✅ Notifications worker active" || echo "⚠️ Worker not running"

# -------------------------------------------------------------
# 4️⃣ API health tests
# -------------------------------------------------------------
echo -e "\n[4/7] 🌐 Testing API endpoints..."
function test_api() {
  local url=$1
  local label=$2
  if curl -fsS "http://127.0.0.1:${SERVER_PORT}${url}" >/dev/null; then
    echo "✅ $label OK (${url})"
  else
    echo "❌ $label FAILED (${url})"
  fi
}
test_api "/api/health" "Health endpoint"
test_api "/api/categories" "Categories endpoint"
test_api "/api/items" "Items endpoint"

# -------------------------------------------------------------
# 5️⃣ Logs & workers
# -------------------------------------------------------------
echo -e "\n[5/7] 🧾 Checking log summaries..."
tail -n 3 "$LOGS_DEV/app.out" 2>/dev/null || echo "⚠️ No app logs found"
tail -n 3 "$LOGS_DEV/worker.out" 2>/dev/null || echo "⚠️ No worker logs found"

# -------------------------------------------------------------
# 6️⃣ Backups
# -------------------------------------------------------------
echo -e "\n[6/7] 💾 Checking backup presence..."
ls -lh "$ROOT/backups"/*.db 2>/dev/null | tail -n 3 || echo "⚠️ No recent backups found"

# -------------------------------------------------------------
# 7️⃣ Startup script shebang verification
# -------------------------------------------------------------
echo -e "\n[7/7] 🧩 Checking startup scripts..."
for s in "$ROOT/scripts/start_dev.sh" "$ROOT/scripts/start_qa.sh"; do
  if head -1 "$s" | grep -q "#!/bin/bash"; then
    echo "✅ $s has valid shebang"
  else
    echo "⚠️ $s needs BOM cleanup or correct shebang"
  fi
done

echo -e "\n============================================================"
echo "🏁 Sanity check complete — review any ⚠️ or ❌ lines above."
echo "============================================================"
