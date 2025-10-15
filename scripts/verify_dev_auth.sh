#!/bin/bash
# ===========================================
# 🟩 WattSun DEV Auth Verification Script
# ===========================================

PORT=3001
BASE_URL="http://127.0.0.1:$PORT"
EMAIL="dev_autotest@example.com"
PHONE="+254799000111"
PASS="Pass123"
TMP="/tmp/dev_auth_test.json"

echo "==========================================================="
echo "[dev] WattSun DEV Authentication Test"
echo "Target: $BASE_URL"
echo "==========================================================="

# Health check
echo -n "[dev] Checking /api/health ... "
if curl -sf "$BASE_URL/api/health" >/dev/null; then
  echo "✅ OK"
else
  echo "❌ FAIL"
  exit 1
fi

# Signup
echo -n "[dev] Testing /api/signup ... "
curl -s -X POST "$BASE_URL/api/signup" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"AutoDevUser\",\"email\":\"$EMAIL\",\"phone\":\"$PHONE\",\"password\":\"$PASS\"}" > "$TMP"

if grep -q '"success": *true' "$TMP"; then
  echo "✅ Signup successful"
else
  if grep -q '"code": *"DUPLICATE_EMAIL"' "$TMP"; then
    echo "⚠️ Already exists (OK)"
  else
    echo "❌ Signup failed"
    cat "$TMP"
    exit 1
  fi
fi

# Login
echo -n "[dev] Testing /api/login ... "
curl -s -X POST "$BASE_URL/api/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" > "$TMP"

if grep -q '"success": *true' "$TMP"; then
  echo "✅ Login successful"
else
  echo "❌ Login failed"
  cat "$TMP"
  exit 1
fi

echo "==========================================================="
echo "[dev] ✅ DEV authentication routes verified successfully."
