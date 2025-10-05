# S0-T2 — DB bootstrap, migrations, and health check extension

This increment wires a SQLite dev database, a minimal migrations flow, and extends `/api/health` to reflect DB readiness.

## Quick Start (Dev)

```bash
cp .env.example .env
npm install
npm run migrate          # applies SQL in scripts/sql into data/dev/marketplace.dev.db
npm start                # runs on PORT (default 3101)
```

Verify:
- `curl -s http://127.0.0.1:3101/api/health | jq` → shows `{ ok:true, db.connected:true, db.migrations:[...] }`
- `curl -s http://127.0.0.1:3101/api/users/_smoketest | jq` → returns seeded admin user

## Migrations

Place timestamped `.sql` files in `scripts/sql/`, e.g. `2025-10-01_init.sql`.
Run `npm run migrate` (or `bash scripts/migrate.sh`). Applied migrations are tracked in the `migrations` table.

### Inspect DB

```bash
sqlite3 data/dev/marketplace.dev.db ".tables"
sqlite3 data/dev/marketplace.dev.db "SELECT * FROM migrations;"
sqlite3 data/dev/marketplace.dev.db "SELECT id, email, role FROM users;"
```

## Configuration

- `DB_ENGINE=better-sqlite3`
- `DB_PATH=data/dev/marketplace.dev.db`
- `MIGRATIONS_DIR=scripts/sql`
