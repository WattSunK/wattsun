#!/usr/bin/env bash
set -euo pipefail

# Load .env if present
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

DB_PATH="${DB_PATH:-data/dev/marketplace.dev.db}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-scripts/sql}"

mkdir -p "$(dirname "$DB_PATH")"

# Ensure migrations table exists
sqlite3 "$DB_PATH" "CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT UNIQUE NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);"

# Apply migrations in filename order
echo "🔎 Scanning $MIGRATIONS_DIR for migrations..."
shopt -s nullglob
applied_count=0
for file in "$MIGRATIONS_DIR"/*.sql; do
  fname="$(basename "$file")"
  already=$(sqlite3 "$DB_PATH" "SELECT COUNT(1) FROM migrations WHERE filename='$fname';")
  if [ "$already" -eq 0 ]; then
    echo "➡️  Applying $fname"
    sqlite3 "$DB_PATH" < "$file"
    sqlite3 "$DB_PATH" "INSERT INTO migrations (filename) VALUES ('$fname');"
    applied_count=$((applied_count+1))
  else
    echo "✔️  Skipping $fname (already applied)"
  fi
done
echo "✅ Done. Applied $applied_count new migration(s)."

# Show tables for sanity
echo "📋 Tables now in DB:"
sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
