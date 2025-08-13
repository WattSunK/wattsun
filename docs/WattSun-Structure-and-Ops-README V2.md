# WattSun — Structure & Ops (Updated 2025-08-13)

This document captures how the app is structured on your Synology NAS, the current runtime conventions, database layout, diagnostic endpoints, and the **Phase 6** admin roadmap status. It also prescribes the next task (**6.4 Customer Reflection**) and how we’ll implement and test it.

---

## 1) High‑level layout (repo root)

```
wattsun/
├─ public/                     # static site (index.html, assets, admin dashboard)
│  ├─ admin/
│  │  ├─ css/…
│  │  └─ js/
│  │     ├─ dashboard.js
│  │     ├─ data-adapter.js
│  │     ├─ orders-controller.js
│  │     └─ orders-edit.js
│  └─ partials/
│     └─ orders.html
├─ routes/                     # Express routes (auth, admin, items, etc)
│  ├─ login.js                 # POST /api/login   (JSON or urlencoded)
│  ├─ signup.js                # POST /api/signup  (JSON or urlencoded)
│  ├─ reset.js                 # POST /api/reset-request + /api/reset-confirm (+ legacy /api/reset)
│  ├─ admin-orders.js          # PATCH /api/admin/orders/:id
│  ├─ admin-users.js           # GET /api/admin/users?type=Driver
│  └─ admin-diagnostics.js     # GET /api/admin/_diag/*
├─ data/
│  └─ dev/
│     ├─ wattsun.dev.db       # **canonical Users DB** (auth/users + admin overlay table)
│     └─ inventory.dev.db     # Items/categories/messages (read-mostly)
├─ user-setup/
│  └─ users.db -> ../data/dev/wattsun.dev.db   # **symlink** for old code paths
├─ scripts/
│  ├─ start_nas.sh             # exports DB env and launches server.js
│  ├─ stop_nas.sh              # stops the node process safely
│  └─ status_nas.sh            # optional status helper
├─ logs/
│  ├─ app.out                  # server log (nohup target)
│  └─ app.3010.out             # example alt-port run (dev only)
├─ server.js                   # Express app
└─ docs/
   └─ (this file)
```

---

## 2) Runtime & process

- **Node**: v20 (Synology package).
- **Default port**: `3001`. You can override with `PORT`, but we keep `3001` for NAS tasks.
- **Start/Stop** (Task Scheduler uses these):

```bash
# stop
./scripts/stop_nas.sh

# start (pins DBs via env)
./scripts/start_nas.sh

# sanity
ps -ef | grep -E "node .*server\.js|node server\.js" | grep -v grep
curl -fsS http://127.0.0.1:3001/api/admin/_diag/ping
```
`start_nas.sh` exports:
- `SQLITE_DB=$ROOT/data/dev/wattsun.dev.db`
- `DB_PATH_USERS=$ROOT/data/dev/wattsun.dev.db`

These make the **Users DB** the single source of truth for auth and the admin overlay.

---

## 3) Databases

### 3.1 Canonical files

- **Users (auth + overlay)** → `data/dev/wattsun.dev.db`
- **Inventory (items/categories/messages)** → `data/dev/inventory.dev.db`

Legacy paths are bridged by a symlink: `user-setup/users.db -> data/dev/wattsun.dev.db`.

### 3.2 Admin overlay table (lives in Users DB)

```
CREATE TABLE IF NOT EXISTS admin_order_meta (
  order_id   TEXT PRIMARY KEY,
  status     TEXT NOT NULL,
  driver_id  INTEGER,
  notes      TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

> We migrated any previous rows from `inventory.dev.db` and now **write only** to `wattsun.dev.db`.

### 3.3 Quick DB checks

```bash
sqlite3 data/dev/wattsun.dev.db ".tables"
sqlite3 data/dev/wattsun.dev.db "PRAGMA table_info(users);"
sqlite3 data/dev/wattsun.dev.db "SELECT COUNT(*) FROM admin_order_meta;"
```

---

## 4) Diagnostic endpoints (admin)

```bash
# server liveness
GET /api/admin/_diag/ping
# → {"success":true,"time":"..."}

# DB wiring
GET /api/admin/_diag/db
# → { success, sqliteVersion, overlayDbPath, envDbPath, users:{total?,drivers?}, pid }
```

These are already mounted in `server.js` as:
```js
app.use("/api/admin/_diag", require("./routes/admin-diagnostics"));
```

---

## 5) Auth endpoints (browser + curl)

All accept **JSON** and **URL‑encoded form** payloads.

- **POST** `/api/login`
  - body: `{ email, password }`
  - 200: `{ ok:true, user:{...} }`  •  401: invalid credentials  •  500: DB error

- **POST** `/api/signup` (and alias `/api/` when mounted at `/api/signup`)
  - body: `{ name, email, phone?, password }`
  - 200: `{ ok:true, user:{ id, name, email, phone, type:"User", status:"Active" } }`
  - 409: `Email already registered`
  - 500: DB error (see logs)

- **POST** `/api/reset-request` (aliases: `/api/reset/request`, legacy `/api/reset` without token)
  - body: `{ email }`
  - 200: `{ ok:true, token, expires }` *(token included for dev)*

- **POST** `/api/reset-confirm` (aliases: `/api/reset/confirm`, legacy `/api/reset` with token)
  - body: `{ token, password }`
  - 200: `{ ok:true }`

**Troubleshooting signup 500 (browser-only):**  
1) Tail logs to see `[signup]` details:
```bash
tail -n 120 logs/app.out | grep -i '\[signup\]\|\[login\]\|\[reset\]'
```
2) If it’s a duplicate email you’ll get **409**, not 500.  
3) Ensure `server.js` mounts the router once and before any catch‑all:
```js
app.use("/api/signup", require("./routes/signup"));
```
4) Body parser is applied by the route (JSON + urlencoded), so you don’t need a global change.

---

## 6) Phase 6 — Admin Dashboard

### 6.0 Core Restore ✅
- Role gate, header/sidebar, Home/Logout, partial loader; no console errors.

### 6.1 Orders List ✅ (baseline)
- Table rendering stable with **search**, **status filter**, and **pagination (10/pg)**.
- Network uses `/api/orders?page=&per=&q=&status=`; client filters keep UI responsive.

### 6.2 View / Edit Order ✅ (baseline)
- **View** modal shows canonical order data + overlay (status/driver/notes).  
- **Edit** drawer opens; **status + notes** persist through PATCH; **driver** requires a user with `type='Driver'`.
  - Create a driver quickly:
    ```sql
    INSERT INTO users (name,email,phone,type,status,created_at)
    VALUES ('Test Driver','driver1@example.com','+254700000001','Driver','Active',CURRENT_TIMESTAMP);
    ```

### 6.3 Backend wiring ✅
- **GET** `/api/admin/users?type=Driver` → list of drivers.  
- **PATCH** `/api/admin/orders/:id` → writes overlay fields to `admin_order_meta` in **wattsun.dev.db**.  
- `server.js` pins the DB via env (`DB_PATH_USERS` / `SQLITE_DB`) and exposes `_diag` endpoints.

### 6.4 Customer Reflection 🔜 (next task)
When admin saves an order, the **customer view** (Track / My Orders) should refresh **immediately** without reloading.

**Plan**  
1) **Emit signal on save** (admin UI, in `orders-edit.js` after successful PATCH):
   ```js
   // flag for other tabs
   localStorage.setItem("ordersUpdatedAt", String(Date.now()));
   // message for same-tab iframes (defensive)
   window.postMessage({ type:"orders-updated" }, "*");
   ```
2) **Listen & re-fetch** (customer pages, e.g. `public/js/myorders.js` / `public/js/track.js`):
   - on `window.focus` → refetch
   - on `window.storage` for key `ordersUpdatedAt` → refetch
   - on `window.message` with `{type:"orders-updated"}` → refetch
   - optional: fallback polling (30–60s) behind a feature flag
3) **Refetch mechanics**
   - Call the **existing** orders endpoint (same shape as manual refresh today).
   - Preserve pagination and filter state across refreshes.
4) **Smoke tests**
   - Open Customer tab A (My Orders). Open Admin tab B (Orders).
   - In B: change status of order X → **A updates within 1s**.
   - Repeat with driver & notes; ensure UI merges overlay correctly.

### 6.5 Hardening (after 6.4)
- Input validation (server + client), currency formatting, empty states.
- Permission checks (admin-only routes), rate limiting on auth/reset.
- Add minimal tests for: list paging, edit, reflection flow.

---

## 7) Known gaps / To‑watch
- **Orders totals** show “KES 0” for historical data; server aggregation pending.
- **Favicon** 404 in console (cosmetic).
- **Signup** shows “Database error” in some browser flows while curl succeeds → use the log hint above; we now translate duplicate emails to **409** and accept both JSON and urlencoded bodies.

---

## 8) Quick commands

```bash
# Diagnostics
curl -fsS http://127.0.0.1:3001/api/admin/_diag/ping
curl -fsS http://127.0.0.1:3001/api/admin/_diag/db | jq .

# Auth (replace values)
curl -fsS -X POST http://127.0.0.1:3001/api/signup \
  -H 'Content-Type: application/json' \
  -d '{"name":"demo","email":"demo@example.com","phone":"+254700000777","password":"Passw0rd!"}'

curl -fsS -X POST http://127.0.0.1:3001/api/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@example.com","password":"Passw0rd!"}'
```

---

## 9) How to run locally on a different port (dev only)

```bash
PORT=3010 SQLITE_DB=$PWD/data/dev/wattsun.dev.db \
DB_PATH_USERS=$PWD/data/dev/wattsun.dev.db \
node server.js
```

---

## 10) Next thread (Step 6.4 kickoff)

**Title:** Phase 6.4 — Customer Reflection (Orders Sync)

**Kickoff message (paste in new chat):**

> Implement Step 6.4. When admin saves an order, customer My Orders / Track Order should refresh immediately without reload.  
> **Deliver:**  
> 1) After successful PATCH in admin `orders-edit.js`, write `localStorage.ordersUpdatedAt=Date.now()` and `postMessage({type:'orders-updated'})`.  
> 2) In customer pages (`myorders.js`, `track.js`), add listeners for `focus`, `storage('ordersUpdatedAt')` and `message('orders-updated')` to refetch orders and re-render, preserving filters/pagination.  
> 3) Include minimal smoke tests and copy‑paste code blocks for each file.
