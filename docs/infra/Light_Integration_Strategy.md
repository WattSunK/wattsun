# Light Integration Strategy — Kill Bill, Condo, and Cocorico
_Date: 08 Oct 2025_

## 🎯 Purpose
Simplify the integration of external platforms (**Kill Bill**, **Condo**, and **Cocorico**) by treating them as **microservice adapters** rather than fully embedded systems.  
This approach preserves system modularity, reduces migration risk, and keeps the Marketplace as the *single source of truth* for data.

---

## 🧩 Integration Philosophy

| Principle | Description |
|------------|--------------|
| **1. API-First Bridge** | Use REST or Webhook communication between Marketplace and external services. No direct DB joins. |
| **2. Container Isolation** | Each third-party app runs in its own Docker container. Communication via internal API gateway (`http://killbill_service:8080`). |
| **3. Identity Federation** | Marketplace issues JWT tokens for tenants/landlords/admins; external systems validate using shared public key. |
| **4. Sync Instead of Replace** | Core data (leases, payments, invoices) remains local; external apps receive periodic sync data snapshots. |
| **5. Single Dashboard UX** | All analytics and status views surface through Marketplace Admin UI using REST calls to external adapters. |

---

## ⚙️ Implementation Model

| Layer | Approach | Benefit |
|--------|-----------|----------|
| **Kill Bill** | Deploy via Docker; use REST adapter `/services/killbill-sync.js` to mirror invoices/payments. | Avoids rewriting billing logic; adds audit-grade ledger. |
| **Condo** | Use scheduled REST sync job `scripts/sync_condo_units.sh` to import maintenance tickets and sync units. | Leverages Condo ticketing without schema conflicts. |
| **Cocorico** | Expose `/api/listings` endpoint consuming Cocorico REST API; embed selected fields into public property portal. | Integrates public marketplace features with minimal backend load. |

---

## 🧱 Container Setup Overview

Docker Compose snippet (simplified):
```yaml
services:
  marketplace:
    build: .
    ports: ["3101:3101"]
    depends_on: [postgres]
    environment:
      - NODE_ENV=production
  killbill_service:
    image: killbill/killbill:latest
    ports: ["8080:8080"]
  condo_service:
    image: condo/condo:latest
    ports: ["8090:80"]
  cocorico_service:
    image: cocolabs/cocorico:latest
    ports: ["8091:80"]
```

All services share a secure internal Docker network (`bridge:marketplace-net`).

---

## 🔐 Identity & Security Model

| Feature | Mechanism |
|----------|------------|
| JWT Issuance | Marketplace `/api/auth/login` returns JWT with `role` + `tenant_id`. |
| Shared Validation | External containers read the Marketplace public key `/infra/keys/public.pem`. |
| Session Refresh | Renewed via Marketplace OAuth endpoint `/api/auth/refresh`. |
| Webhook Authentication | Signed HMAC headers from each service; verified with shared secret. |

---

## 🔄 Data Sync Jobs

| Job | Description | Frequency |
|------|--------------|------------|
| `sync_killbill.sh` | Push new invoices and receipts to Kill Bill via REST API. | Daily |
| `sync_condo_units.sh` | Fetch Condo maintenance tickets and unit updates. | Nightly |
| `sync_cocorico_listings.sh` | Import approved Cocorico listings into Marketplace `/api/properties`. | Every 6 hours |

Each sync script logs to `/logs/integration/` and reports metrics to `/api/health`.

---

## 🧪 Verification Steps

| Step | Action | Expected Result |
|------|---------|-----------------|
| 1 | Run `docker-compose up -d` | All containers start successfully. |
| 2 | Run `bash scripts/sync_killbill.sh` | Invoices synced; Kill Bill shows correct totals. |
| 3 | Run `bash scripts/sync_condo_units.sh` | Maintenance tickets appear in `/api/maintenance`. |
| 4 | Run `bash scripts/sync_cocorico_listings.sh` | Public listings populated in `/api/properties`. |
| 5 | Check `/api/health` | Integration metrics (`killbill_sync_ok`, `condo_sync_ok`, `cocorico_sync_ok`) true. |

---

## 🧭 Effort and Timeline (Optimized)

| Component | Workload | Duration | Deliverables |
|------------|-----------|-----------|---------------|
| **Kill Bill Adapter** | REST connector + sync script | ~2 weeks | `/services/killbill-sync.js`, `/scripts/sync_killbill.sh` |
| **Condo Adapter** | REST sync + maintenance import | ~1 week | `/scripts/sync_condo_units.sh` |
| **Cocorico Adapter** | Listing import/export bridge | ~2 weeks | `/scripts/sync_cocorico_listings.sh` + UI hooks |
| **Dashboard Merge** | REST aggregation for analytics | ~1 week | Unified `/admin/system-status` panel |

Total estimated effort: **4–6 weeks**, fully parallelizable.

---

## 🏁 Definition of Done (for Light Integration)
☑ All three containers start under Docker Compose.  
☑ Marketplace `/api/health` reports green sync metrics.  
☑ Sync scripts execute successfully.  
☑ Admin dashboard displays external module data.  
☑ No dependency conflicts or duplicate identity records.  

---

### 📘 References
- Kill Bill REST API: [https://killbill.io/doc/latest/](https://killbill.io/doc/latest/)  
- Condo API: [https://github.com/CondoApps](https://github.com/CondoApps)  
- Cocorico API: [https://github.com/Cocolabs-SAS/cocorico](https://github.com/Cocolabs-SAS/cocorico)  
- Docker Compose Docs: [https://docs.docker.com/compose/](https://docs.docker.com/compose/)
