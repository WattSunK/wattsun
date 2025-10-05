# Server Bootstrap Notes

**Goal:** consistent app setup as we domainize the backend.

## Order of initialization
1. Load env (`.env`) and defaults (port, DB path, log level).
2. Create logger (JSON logs to file + console).
3. Create Express app:
   - Trust proxy (Cloudflared)
   - Security & perf middleware (helmet, compression)
   - Body parsers with sane limits
   - CORS (dev only; same-origin in staging/prod)
   - Rate limits on auth & checkout
4. Register routers by **domain** (`src/domains/...`), e.g.:
   - `/api/auth`, `/api/users`, `/api/items`, `/api/cart/checkout`,
     `/api/orders`, `/api/admin/orders`, `/api/track`
5. Health endpoints (`/api/health`, `/api/version`)
6. Error handling (typed errors → { success:false, error:{code,message} })
7. Start server (PORT; log a one-line startup summary).

## Env contract
- `PORT=3000`
- `DB_PATH=./data/dev/wattsun.dev.db` (per env)
- `LOG_LEVEL=info`
- SMTP vars for email

## Logging
- Structured (JSON) logs to file under `./logs/`
- Correlate requests (x-request-id) for traceability

## Rate limits
- Auth & checkout routes: conservative per-IP limits
- Admin routes: stricter and protected by role middleware

## Migrations
- Prefer a migration script before start (`scripts/migrate.js` placeholder)
- Orders: move off `orders.json` → tables (`orders`, `order_items`, `order_status_history`)
