#!/bin/bash
echo "🌱 Seeding Invoice Ninja demo data..."
docker exec invoiceninja php artisan ninja:create-test-data
