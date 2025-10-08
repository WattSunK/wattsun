# Tenant–Landlord Marketplace – Unified Roadmap (S1–S3)
_Date: 08 Oct 2025_

## 🎯 Objective
Provide a single, authoritative roadmap linking all sprint documents, integration strategies, and infrastructure layers for the Marketplace project.  
This file merges internal (S1) and external (S2–S3) developments to prevent duplication and maintain synchronization across all documentation.

---

## 🧱 Documentation Hierarchy

| Level | Path | Description |
|--------|------|-------------|
| **L0** | `Marketplace-Structure-and-Ops-README_v1.1` | System architecture and deployment overview (canonical source). |
| **L1** | `/docs/roadmap/Overall_Roadmap.md` | Unified timeline (this file). |
| **L2** | `/docs/infra/Third-Party_Integration_Roadmap.md` | Detailed external component mapping (Kill Bill, Condo, Cocorico). |
| **L3** | `/docs/infra/Light_Integration_Strategy.md` | Microservice adapter implementation details. |
| **L4** | `/docs/sprints/S1-Tx_*.md` | Per‑sprint kickoff and update notes. |

---

## Phase S1 – Core Financial Foundation

| Sprint | Deliverable | Status | Reference |
|---------|-------------|---------|------------|
| S1‑T1 → T4 | Schema, properties, units, and joins | ✅ Complete | `/docs/sprints/S1-T4_Kickoff_Notes.md` |
| S1‑T5 | Lease–Payment linkage & derived totals | ✅ Complete (`S1‑T5-complete` tag) | `/docs/sprints/S1-T5_Kickoff_Notes.md`, `/docs/sprints/S1-T5_Update_Notes.md` |
| S1‑T6 | Invoices & Receipts Layer | 🏗️ In Progress | `/docs/sprints/S1-T6_Kickoff_Notes.md` |
| S1‑T7 → T8 | Notifications, Reconciliation, Reports | 🔜 Planned | (to be created) |

---

## Phase S2 – Third‑Party & Microservice Integrations

| Sprint | Component | Integration Mode | Dependency | Reference |
|---------|------------|------------------|-------------|------------|
| S2‑T0 | PostgreSQL Migration | Backend prep for Kill Bill | Requires S1‑T6 | `/docs/infra/Third-Party_Integration_Roadmap.md` |
| S2‑T1 → T3 | **Kill Bill** (Billing Engine) | Docker microservice adapter (REST bridge) | Requires S1‑T6 completion | `/docs/infra/Light_Integration_Strategy.md#kill-bill` |
| S2‑T4 → T5 | **Condo** (Property Mgmt) | Maintenance sync job via REST | Depends on S1‑T7 tables | `/docs/infra/Light_Integration_Strategy.md#condo` |
| S2‑T6 → T8 | **Cocorico** (Public Listings) | Listing import/export adapter | Depends on S1‑T8 properties API | `/docs/infra/Light_Integration_Strategy.md#cocorico` |

---

## Phase S3 – Cross‑System Analytics & Unified Dashboard

| Sprint | Integration | Objective | Reference |
|---------|-------------|-----------|------------|
| S3‑T1 → T2 | Kill Bill Deep Billing | Production billing automation & reconciliation | `/docs/infra/Third-Party_Integration_Roadmap.md` |
| S3‑T3 → T4 | Wattsun Reuse Pack | Analytics + shared dashboard integration | `/docs/infra/Third-Party_Integration_Roadmap.md#wattsun-reuse-pack` |

---

## 🔁 Synchronization Workflow

1. **Sprint completion** → Add summary to this roadmap.  
2. **Integration dependency added** → Update `/docs/infra/Third-Party_Integration_Roadmap.md`.  
3. **Implementation detail** → Append only to `/docs/infra/Light_Integration_Strategy.md`.  
4. **Execution evidence (tests, SQL)** → Logged under `/docs/sprints/`.  
5. **Repo tagging** → `git tag -a Sx-Ty-complete -m "Description"` and push.  

---

## 🧩 Verification References

| File | Purpose |
|------|----------|
| `/docs/sprints/S1-T5_Update_Notes.md` | Confirms linkage verification |
| `/docs/infra/Third-Party_Integration_Roadmap.md` | Defines external module phasing |
| `/docs/infra/Light_Integration_Strategy.md` | Specifies Docker + REST adapter setup |
| `/docs/roadmap/Overall_Roadmap.md` | Controls milestone synchronization |

---

## 🏁 Maintenance Guidelines

- Edit only this file for global milestone tracking.  
- Reference (link) other documents instead of restating their content.  
- Verify all Markdown links resolve correctly (`grep -R "Kill Bill" docs/ | wc -l`).  
- Commit and tag after each verified sprint.

---

### 📅 Timeline Snapshot

| Quarter | Key Focus | Status |
|----------|------------|--------|
| **Q4 2025** | S1‑T6 → S1‑T8 – Invoices + Reconciliation | 🏗️ Active |
| **Q1 2026** | S2‑T1 → S2‑T3 – Kill Bill Adapter Integration | 🔜 Planned |
| **Q2 2026** | S2‑T4 → S2‑T5 – Condo Module Sync | ⏳ Upcoming |
| **Q3 2026** | S2‑T6 → S2‑T8 – Cocorico Portal Bridge | ⏳ Upcoming |
| **Q4 2026** | S3 – Wattsun Analytics & Dashboard Integration | Future |

---

**Author:** Project Engineering Team (Marketplace & Infra)  
**Maintained by:** `Marketplace-Structure-and-Ops-README_v1.1` canonical configuration.

