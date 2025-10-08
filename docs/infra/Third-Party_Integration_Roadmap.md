# Third-Party Integration Roadmap — Tenant–Landlord Marketplace
_Date: 08 Oct 2025_

## 🎯 Objective
Define the integration roadmap for external open‑source and enterprise components—**Kill Bill**, **Condo**, **Cocorico**, and **Wattsun Reuse Modules**—to extend the Marketplace beyond core S1 functionality.  
This roadmap bridges your internal sprints (S1–S3) with external systems for billing, property management, and listing capabilities.

---

## 🧭 Integration Overview

| Component | Type | License | Role in Marketplace | Integration Start |
|------------|------|----------|---------------------|------------------|
| **Kill Bill** | Billing engine | Apache 2.0 | Invoicing, recurring billing, and payments reconciliation | S2‑T1 |
| **Condo** | Property management | MIT / Apache | Maintenance, service requests, building data sync | S2‑T4 |
| **Cocorico** | Marketplace portal | MIT | Listings, bookings, public property portal | S2‑T6 |
| **Wattsun Reuse Modules** | Internal toolkit | Proprietary | Shared dashboard, analytics, and notifications | S3‑T3 |

---

## 🧱 Phase‑by‑Phase Integration

### 🔹 **Phase S2‑T1 → S2‑T3 – Kill Bill Integration**
| Area | Description |
|------|--------------|
| **Objective** | Replace manual invoice/receipt creation with Kill Bill billing cycles. |
| **APIs Mapped** | `/api/invoices` ↔ `KillBill.Invoice`<br>`/api/receipts` ↔ `KillBill.Payment` |
| **Data Flow** | Lease → Invoice → Payment → Kill Bill Account Sync |
| **Dependencies** | PostgreSQL migration (S2‑T0), stable invoices & receipts tables (S1‑T6). |
| **Deliverables** | Kill Bill sandbox connector, webhook listener, health metrics (`billing_sync_ok`). |

---

### 🔹 **Phase S2‑T4 → S2‑T5 – Condo Integration**
| Area | Description |
|------|--------------|
| **Objective** | Introduce maintenance & property‑management capabilities. |
| **APIs Mapped** | `/api/units`, `/api/leases`, `/api/maintenance` ↔ `Condo.Unit`, `Condo.Contract`, `Condo.Ticket` |
| **Data Flow** | Property & unit sync → lease assignment → maintenance ticket ingestion. |
| **Dependencies** | Verified lease & unit schema (S1‑T4), tenant roles, landlord dashboard. |
| **Deliverables** | Condo adapter microservice + nightly sync job (`cron/sync_condo_units.sh`). |

---

### 🔹 **Phase S2‑T6 → S2‑T8 – Cocorico Integration**
| Area | Description |
|------|--------------|
| **Objective** | Expose public property listings and rental requests. |
| **APIs Mapped** | `/api/properties`, `/api/leases` ↔ `Cocorico.Listing`, `Cocorico.Booking` |
| **Data Flow** | Admin‑approved properties published → tenant inquiries → booking confirmation. |
| **Dependencies** | Role‑based permissions, property status, pricing fields. |
| **Deliverables** | Cocorico listing front‑end bridge (`portal.wattsun.co.ke`) and booking import cron. |

---

### 🔹 **Phase S3‑T1 → S3‑T2 – Kill Bill Deep Billing Integration**
| Area | Description |
|------|--------------|
| **Objective** | Enable production‑grade billing automation and reconciliation. |
| **APIs Mapped** | `/api/invoices`, `/api/receipts`, `/api/payments` ↔ Kill Bill `Invoice`, `Payment`, `Account` endpoints. |
| **Dependencies** | PostgreSQL backend, Cloudflare SSL/HTTPS proxy, invoice aging logic (S2). |
| **Deliverables** | Auto‑billing cycles, payment reconciliation jobs, admin billing dashboard. |

---

### 🔹 **Phase S3‑T3 → S3‑T4 – Wattsun Reuse Pack Integration**
| Area | Description |
|------|--------------|
| **Objective** | Merge analytics and dashboarding modules from the Wattsun platform. |
| **APIs Mapped** | `/api/system/status`, `/api/health`, `/api/admin/*` → unified dashboard widgets. |
| **Dependencies** | Complete tenant/landlord/invoice datasets, stable event logs. |
| **Deliverables** | Shared analytics UI, performance telemetry, notifications hub. |

---

## ⚙️ Core Dependencies Summary

| Dependency | Purpose | Status |
|-------------|----------|---------|
| **PostgreSQL Migration** | Required for Kill Bill backend support | ⏳ Planned (S2‑T0) |
| **Cloudflare Tunnel + HTTPS** | Secure cross‑service integration | ✅ Active |
| **Session & Role Model** | Shared identity between modules | ✅ Implemented |
| **Invoices/Receipts API** | Core for billing & Kill Bill mapping | 🏗️ In progress (S1‑T6) |
| **Maintenance Schema** | Needed for Condo ticketing | ⏳ S2‑T4 |
| **Listing/Booking API** | Needed for Cocorico integration | ⏳ S2‑T6 |

---

## 🧪 Verification & Testing Plan

| Layer | Test | Tool |
|--------|------|------|
| Billing | API contract between `/api/invoices` and Kill Bill sandbox | cURL + Postman |
| Property Mgmt | Condo → Marketplace unit/lease sync | cron logs + SQL diff |
| Marketplace | Cocorico booking imports | API probe script |
| Shared Dashboards | Wattsun data bridge | WebSocket telemetry |
| Security | OAuth token and CORS checks | `tests/security_integrations.sh` |

---

## 🏁 Definition of Done (for integration phase)
- [ ] PostgreSQL backend operational.  
- [ ] Kill Bill sandbox connected and syncing invoices.  
- [ ] Condo sync verified for units and maintenance tickets.  
- [ ] Cocorico listings visible and mappable to Marketplace properties.  
- [ ] Wattsun analytics integrated into the admin dashboard.  
- [ ] End‑to‑end billing and property flows pass all tests.  

---

### 📅 Tentative Timeline Overview

| Quarter | Milestone |
|----------|------------|
| **Q4 2025** | Finish S1‑T6 → S1‑T8 (Invoices, Notifications, Reconciliation) |
| **Q1 2026** | Integrate Kill Bill sandbox (billing microservice) |
| **Q2 2026** | Add Condo module (maintenance sync) |
| **Q3 2026** | Integrate Cocorico public listing portal |
| **Q4 2026** | Merge Wattsun analytics and dashboards |

---

### 📘 References
- Kill Bill Docs: [https://killbill.io/documentation/](https://killbill.io/documentation/)  
- Condo: [https://github.com/CondoApps](https://github.com/CondoApps)  
- Cocorico: [https://github.com/Cocolabs-SAS/cocorico](https://github.com/Cocolabs-SAS/cocorico)  
- Wattsun Reuse Pack (internal): `/infra/reusepack/README.md`
