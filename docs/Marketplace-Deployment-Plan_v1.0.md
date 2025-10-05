Marketplace-Deployment-Plan_v1.0.md
# Tenant–Landlord Marketplace — Deployment Plan (v1.0)

**Project:** Tenant–Landlord Marketplace  
**Environment:** Synology NAS (shared with WattSun)  
**Primary Domain:** https://boma.wattsun.co.ke  
**Date:** October 2025  
**Status:** Approved for Implementation  
**Version:** 1.0  

---

## 1. Overview

This document defines the deployment plan for the **Tenant–Landlord Marketplace**, a modular platform integrating four open-source components:

| Layer | Technology | Purpose |
|-------|-------------|----------|
| Marketplace | **Cocorico (PHP/Symfony)** | Handles listings, searches, applications, and tenant–landlord interactions. |
| Property Ops | **Condo (Node.js / Express)** | Manages leases, tenants, maintenance, and invoices. |
| Billing Engine | **Kill Bill (Java)** | Handles billing, subscriptions, payments, and ledgers. |
| Connector | **Node.js Microservice** | Orchestrates data flow and synchronization among systems. |
| Persistence | **PostgreSQL + Redis** | Relational database and job queue/cache. |

Deployment reuses the **WattSun production infrastructure**, including Cloudflare Tunnel, SSL, and Synology NAS runtime.

---

## 2. Unified Domain Strategy

All services will operate under the same HTTPS hostname:


https://boma.wattsun.co.ke/

├── /api/connector/... → Connector microservice
├── /billing/... → Kill Bill UI/API
├── /condo/... → Property management (Condo)
├── /cocorico/... → Marketplace web frontend
└── /monitoring/... → Health, logs, and metrics


This configuration minimizes SSL and DNS changes and uses a single Cloudflare Tunnel.

---

## 3. Infrastructure Architecture

**Deployment Target:**  
Synology NAS running Docker, with persistent volumes under `/volume1/web/marketplace/`.

### 3.1 Directory Layout


/volume1/web/marketplace/
├── docker-compose.yml
├── .env
├── connector/
├── cocorico/
├── condo/
├── killbill/
├── postgres/
├── redis/
├── scripts/
│ ├── start_all.sh
│ ├── stop_all.sh
│ ├── backup_postgres.sh
│ ├── healthcheck.sh
│ └── logs/
└── docs/


### 3.2 Network Diagram (Mermaid Placeholder)

```mermaid
graph TD
  subgraph Cloudflare
    CF[Cloudflare Tunnel (HTTPS Reverse Proxy)]
  end

  subgraph NAS
    A[Connector Service] -->|REST APIs| B[(PostgreSQL)]
    A --> C[(Redis)]
    D[Cocorico] --> A
    E[Condo] --> A
    F[Kill Bill] --> A
  end

  CF --> D
  CF --> E
  CF --> F
  CF --> A

4. Environment Configuration
4.1 .env Example
DOMAIN=https://boma.wattsun.co.ke
PORT_CONNECTOR=3101
PORT_CONDO=3102
PORT_KILLBILL=3103
PORT_COCORICO=3104
POSTGRES_DB=marketplace
POSTGRES_USER=marketuser
POSTGRES_PASSWORD=strongpassword
POSTGRES_HOST=postgres
REDIS_URL=redis://redis:6379
CLOUDFLARE_TUNNEL_TOKEN=REDACTED

4.2 Docker Compose (Extract)
services:
  postgres:
    image: postgres:16
    volumes:
      - ./postgres/data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: marketplace
      POSTGRES_USER: marketuser
      POSTGRES_PASSWORD: strongpassword

  redis:
    image: redis:alpine

  connector:
    build: ./connector
    ports: ["3101:3101"]
    env_file: .env
    depends_on: [postgres, redis]

  condo:
    build: ./condo
    ports: ["3102:3102"]
    env_file: .env
    depends_on: [postgres, redis]

  killbill:
    image: killbill/killbill
    ports: ["3103:8080"]
    environment:
      - KILLBILL_DAO_URL=jdbc:postgresql://postgres/marketplace

  cocorico:
    build: ./cocorico
    ports: ["3104:80"]
    env_file: .env

5. Cloudflare & Reverse Proxy
5.1 Existing Cloudflare Tunnel

The existing cloudflared container from WattSun is reused:

docker ps | grep cloudflared
cloudflared    running    exposing: https://boma.wattsun.co.ke → localhost:3000

5.2 Extended Configuration

Modify Cloudflare Tunnel config (/volume1/web/cloudflared/config.yml):

tunnel: wattsun-prod
credentials-file: /etc/cloudflared/wattsun.json
ingress:
  - hostname: boma.wattsun.co.ke
    service: http://localhost:3104
  - hostname: boma.wattsun.co.ke
    path: /api/*
    service: http://localhost:3101
  - hostname: boma.wattsun.co.ke
    path: /condo/*
    service: http://localhost:3102
  - hostname: boma.wattsun.co.ke
    path: /billing/*
    service: http://localhost:3103
  - service: http_status:404


Restart tunnel:

sudo docker restart cloudflared

6. Auto-Start Configuration

Reuse WattSun’s Task Scheduler entry.
Script: /volume1/web/marketplace/scripts/start_all.sh

#!/bin/bash
cd /volume1/web/marketplace
docker compose up -d


Add to DSM Task Scheduler:

On Boot → root → run /volume1/web/marketplace/scripts/start_all.sh

7. Backup & Monitoring
7.1 Backups
bash scripts/backup_postgres.sh

#!/bin/bash
TIMESTAMP=$(date +%F-%H%M)
pg_dump -U marketuser marketplace > /volume1/backups/marketplace_${TIMESTAMP}.sql

7.2 Health Checks

Health endpoint exposed at:

https://boma.wattsun.co.ke/api/health


Sample response:

{ "ok": true, "db": true, "redis": true, "uptime": 10234 }

8. Deployment Procedure

Clone repo → /volume1/web/marketplace

Copy .env.example → .env and edit credentials

Run docker compose up -d

Run smoke tests:

curl -s https://boma.wattsun.co.ke/api/health
curl -s https://boma.wattsun.co.ke/condo/health


Confirm SSL padlock via Cloudflare

Confirm admin dashboard loads on /cocorico/admin

9. Update & Rollback
Update
cd /volume1/web/marketplace
git pull
docker compose build
docker compose up -d

Rollback
docker compose down
git checkout <last_good_commit>
docker compose up -d

10. Definition of Done

✅ Cloudflare Tunnel running and accessible via https://boma.wattsun.co.ke
✅ PostgreSQL and Redis containers operational
✅ Connector responding to /api/health
✅ Cocorico frontend reachable
✅ Condo backend reachable
✅ Kill Bill admin UI accessible
✅ Admin login and sample tenant/landlord onboarded

Appendix — Open-Source Licensing & Technology Policy
Component	License	Type	Compliance Note
Cocorico	MIT	Open Source	No subscription required. Developed by Cocolabs for rental/service marketplaces.
Condo	MIT / Apache 2.0	Open Source	Fully self-hosted; community version sufficient for property management features.
Kill Bill	Apache 2.0	Open Source	Enterprise-grade billing platform; open-source core, optional paid plugins ignored.
PostgreSQL	PostgreSQL License	Open Source	Fully compatible for commercial use.
Redis	BSD 3-Clause	Open Source	Used for queues and caching; no license conflicts.
Node.js	MIT	Open Source	Runtime for Connector microservice.
Docker / Compose	Apache 2.0	Open Source	Core engine; no SaaS dependency.
Cloudflare Tunnel	Free tier	Proprietary (service)	Used only for routing; no cost at current scale.
Synology DSM	Proprietary	Appliance	Existing infrastructure; no additional licensing required.
Compliance Summary

All core technologies are open-source under permissive licenses (MIT, Apache, BSD, PostgreSQL).
No subscription or vendor lock-in applies except optional services (Cloudflare free tier, Synology firmware).
System is deployable entirely on-premises without recurring license fees.

End of Document


