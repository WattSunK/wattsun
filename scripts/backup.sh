#!/bin/sh
# WattSun — Backup Script (stub)
# Date: 2025-08-11
# Purpose: Dump SQLite DBs from ./data/* to a backup location.
# SAFE DEFAULT: No destructive actions. Configure paths then remove 'exit 0'.

set -eu

echo "==> [DRY-RUN] WattSun backup starting..."
echo "    Source data folders: ./data/dev ./data/staging ./data/prod"
echo "    TODO: set BACKUP_DIR and SQLite dump command."
# Example:
# BACKUP_DIR="/volume1/backups/wattsun/$(date +%F)"
# mkdir -p "$BACKUP_DIR"
# for db in ./data/*/*.db; do
#   base=$(basename "$db")
#   echo "Dumping $db -> $BACKUP_DIR/$base.sql"
#   sqlite3 "$db" .dump > "$BACKUP_DIR/$base.sql"
# done

echo "==> [DRY-RUN] Backup complete (no files written)."
exit 0
