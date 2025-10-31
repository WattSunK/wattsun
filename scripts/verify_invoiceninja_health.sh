#!/bin/bash
echo "🔍 Checking Invoice Ninja API..."
curl -fsS http://127.0.0.1:9000/api/v1/ping && echo "✅ OK" || echo "❌ Failed"
