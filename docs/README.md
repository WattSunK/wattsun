# Tenant–Landlord Marketplace — Structure & Ops (Dev)

## Quickstart
```bash
cp .env.example .env
npm install
./scripts/start.sh
# open http://127.0.0.1:3101/api/health
```

## DoD (S0-T1)
- App listens on **3101**
- `GET /api/health` → `{ ok: true, uptime, checks }`
- Canonical folders exist: `/public`, `/routes`, `/scripts`, `/data/dev`, `/logs`, `/run`, `/docs`
- `.env.example` present
- Scripts: `start.sh`, `stop.sh`, `update.sh`, `status.sh`, `migrate.sh`, `backup_sqlite.sh`
- FRD docs present in `/docs`
