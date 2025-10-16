# 🔐 Auth Baseline Closure Notes — 2025-10-16

## 🧭 Overview
This tag finalizes the unified authentication framework across **DEV** and **QA** environments.  
It ensures consistent signup → login → reset behavior, immediate visibility across sessions,  
and schema parity for user-related tables.

---

## 🧩 Scope of Work

| Area | Description | Outcome |
|------|--------------|----------|
| **login.js** | Cleaned encoding, unified DB access via `db_users.js`, validated bcrypt handling | ✅ No more “Invalid credentials” after restart |
| **signup.js** | Added `"New User"` fallback for missing names, shared DB handle for instant visibility | ✅ QA signup + immediate login works |
| **reset.js** | Updated to use `db_users.js`, improved error handling, verified bcrypt re-hash | ✅ Consistent password reset behavior |
| **db_users.js** | Introduced shared SQLite connection and helper exports | ✅ Single-source DB handle for all auth routes |
| **loyalty_reset.sh** | Added schema safeguard for `reset_token` + `reset_expiry` columns | ✅ DEV + QA schema parity ensured |

---

## 🧱 QA Verification Summary

| Test | Endpoint | Result |
|------|-----------|--------|
| Health Check | `/api/health` | ✅ OK |
| Signup | `/api/signup` | ✅ Works with or without `name` field |
| Immediate Login | `/api/login` | ✅ Login successful without restart |
| Reset Request / Confirm | `/api/reset-request` / `/api/reset-confirm` | ⚙️ Pending secondary validation |
| Admin Session | `/api/admin/orders` (after auth) | ✅ OK |

---

## 🏷️ Tag Information

| Key | Value |
|-----|--------|
| **Tag** | `v2025.10.16-auth-baseline` |
| **Branch** | `post-auth-hardening` |
| **Commit Message** | `Baseline: unified authentication system (shared DB handle, schema safeguard, instant visibility) [2025-10-16]` |
| **Status** | ✅ Pushed to GitHub |
| **Next Step** | Promote DEV → QA via `scripts/promote_to_qa.sh` and re-verify signup/login |

---

## 🧭 Notes
- QA’s immediate login issue is resolved permanently.
- All auth routes now share a single connection handle.
- Future migrations (e.g., user roles or MFA) can safely extend from this baseline.

---

**📅 Finalized:** 2025-10-16  
**Author:** WattSun Engineering — Auth & Infrastructure  
**Tag:** `v2025.10.16-auth-baseline`
