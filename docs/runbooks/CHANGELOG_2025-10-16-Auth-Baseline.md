# CHANGELOG — Authentication & Password Reset Baseline (2025-10-16)

## 🔖 Tag
`v2025.10.16-auth-baseline`

---

## 🎯 Summary
This release marks the **authentication baseline** for WattSun, introducing a unified, reliable, and environment-consistent login, signup, and password-reset workflow.

---

## 🧱 Core Enhancements

### 1️⃣ Shared Database Connection
- Added `db_users.js` — a shared persistent SQLite handle used across all authentication routes.
- Eliminated stale connection issues between `signup`, `login`, and `reset` routes.
- New signups and password resets are instantly visible in QA without restarting the backend.

### 2️⃣ Authentication Routes Updated
- **`routes/login.js`** — now uses `db_users.js` for consistent DB state.
- **`routes/signup.js`** — refactored to use persistent connection (replaces transient `withDb()`).
- **`routes/reset.js`** — updated to share the same handle and provide immediate password visibility.

### 3️⃣ Schema Safeguard
- **`scripts/loyalty_reset.sh`** updated to automatically ensure:
  ```sql
  ALTER TABLE users ADD COLUMN reset_token TEXT;
  ALTER TABLE users ADD COLUMN reset_expiry INTEGER;
  ```
- Guarantees password-reset compatibility across all environments (DEV + QA).

### 4️⃣ Verified Behavior
- ✅ Immediate login after signup (no restart required)
- ✅ Password reset success in both QA and DEV
- ✅ No more “Database error” or “Invalid credentials” after signup/reset
- ✅ Stable `users` schema parity in all environments

---

## 📅 Commit Summary
**Commit message:**
```
Baseline: unified authentication & password-reset system (shared DB handle, schema safeguard, instant visibility) [2025-10-16]
```

**Tag:**
```
v2025.10.16-auth-baseline
```

---

## 🧩 Impacted Files
| File | Purpose |
|------|----------|
| `/routes/login.js` | Uses shared `db_users` connection |
| `/routes/signup.js` | Refactored for shared handle |
| `/routes/reset.js` | Shares persistent handle for instant updates |
| `/db_users.js` | New centralized SQLite connector |
| `/scripts/loyalty_reset.sh` | Schema safeguard added |
| `/data/dev/wattsun.dev.db` & `/data/qa/wattsun.qa.db` | Verified with `reset_token` and `reset_expiry` columns |

---

## 🧪 Verification Checklist
| Test | Expected Result |
|------|------------------|
| Signup in QA → Immediate login | ✅ Success |
| Password reset (QA) → New login | ✅ Success |
| `loyalty_reset.sh dev/qa` | ✅ Adds reset columns automatically |
| `/api/login`, `/api/signup`, `/api/reset` | ✅ Consistent across QA + DEV |
| QA & DEV health check (`/api/health`) | ✅ HTTP 200 OK |

---

### ✅ This tag (`v2025.10.16-auth-baseline`) represents the **first fully synchronized authentication baseline** across all WattSun environments.
