# WattSun Admin Email Templates — Proposal

**Status:** Draft • **Date:** 2025-10-29  
**Author:** MK & Project Team  
**Applies To:** WattSun Monorepo (`/volume1/web/wattsun`)  
**Domain:** `notifications`  
**Related ADRs:** ADR-001 (API Contracts & Domain Ownership)

---

## 🧩 1. Functional Overview

| Feature | Description | Audience |
|----------|--------------|-----------|
| **Email Templates** | Admin can create, edit, preview, and save HTML/text templates with variable placeholders (e.g. `{{customerName}}`, `{{orderNumber}}`). | Admin |
| **Template Storage** | Templates stored in `notifications_templates` table in the Users DB (`wattsun.dev.db`, `wattsun.qa.db`). | Backend |
| **Admin Send Action** | From Admin “Settings → Email” tab, trigger sending a template to:<br>• A specific email<br>• All users of a given type (Customer, Driver, etc.)<br>• One user selected from dropdown. | Admin |
| **History & Logging** | Each send recorded in `notifications_queue` with status (`Pending`, `Sent`, `Failed`) for traceability. | Backend |

---

## 🗄️ 2. Database Additions

To be created via migration (`scripts/sql/2025-10-XX_add_notifications_templates.sql`):

```sql
CREATE TABLE IF NOT EXISTS notifications_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  placeholders TEXT,                -- comma-separated list of {{vars}}
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER,
  to_email TEXT NOT NULL,
  payload_json TEXT,                -- key/value substitutions
  status TEXT DEFAULT 'Pending',
  sent_at TEXT,
  FOREIGN KEY(template_id) REFERENCES notifications_templates(id)
);
```

---

## 🌐 3. New Admin API Endpoints (Domain: `notifications`)

| Endpoint | Method | Description |
|-----------|--------|-------------|
| `/api/admin/notifications/templates` | `GET` | List all templates |
| `/api/admin/notifications/templates` | `POST` | Create new template |
| `/api/admin/notifications/templates/:id` | `PUT` | Update existing template |
| `/api/admin/notifications/templates/:id` | `DELETE` | Delete template (soft delete optional) |
| `/api/admin/notifications/send` | `POST` | Trigger send action (single user, all users of type, or arbitrary email) |
| `/api/admin/notifications/queue` | `GET` | List send history with filters (`status`, `templateId`) |

> All endpoints require `role = Admin`.  
> Sending action enqueues into `notifications_queue`; the **existing** worker script `scripts/notifications_worker.js` will be **updated** to handle these queued sends via SMTP.

---

## 🖥️ 4. Admin Frontend Additions

### New Tab: **Settings → Email Templates**
**File:** `public/partials/admin-email-templates.html`

Sections:

1. **Template List Table** — name, subject, last updated, edit/delete buttons  
2. **Template Editor Modal** — form for subject + HTML body (`<textarea>` or CodeMirror)  
3. **Send Test / Bulk Send** — panel to select user type or enter an email

**Supporting Script:** `public/admin/js/email-templates.js`
- Fetches `/api/admin/notifications/templates`
- Handles create/update/delete actions
- Calls `/api/admin/notifications/send` with payloads
- Displays toasts or status messages

Integrate into `dashboard.html` sidebar as:

> **Settings → Email Templates**

---

## ⚙️ 5. Backend Integration Flow

1. **Admin creates a template** → stored in `notifications_templates`.  
2. **Admin triggers send** → backend inserts rows in `notifications_queue` (one per recipient).  
3. **Worker processes queue** → sends via SMTP, updates status.  
4. **Admin views history** → `/api/admin/notifications/queue` table.

---

## 🧱 6. Worker Script Update (`scripts/notifications_worker.js`)

The worker already exists and will be **extended** to support the new workflow:

- Poll every 30 s for `status='Pending'`
- Use Nodemailer + `.env` SMTP credentials  
- Render template variables dynamically:
  ```js
  body = body_html.replace(/{{(\w+)}}/g, (_, key) => payload[key] || '');
  ```
- Update queue status to `Sent` or `Failed` in `notifications_queue`
- Add logging and optional retry attempts

Example run:

```bash
node scripts/notifications_worker.js --env=dev
```

---

## 🔒 7. Security & Access Controls

- All `/api/admin/notifications/*` routes protected by `requireAdmin`.
- Validate and sanitize HTML input; enforce length limits.
- Optional rate-limit on `/send` endpoint (e.g. ≤ 5 per minute).
- Future option: preview-only mode for non-super admins.

---

## 🧭 8. Phase Integration Plan

| Phase | Action | Deliverable |
|--------|---------|-------------|
| **7.0** | DB migration + basic CRUD routes | Template management backend |
| **7.1** | Admin partial + JS controller | Frontend editor |
| **7.2** | Add `/api/admin/notifications/send` | Admin send capability |
| **7.3** | Update `notifications_worker.js` | Queue processing |
| **7.4** | QA test (`qa.wattsun.co.ke`) | End-to-end verification |
| **7.5** | Optional: digest / bulk campaigns | Scheduled notifications |

---

## ✅ 9. Deliverables Summary

| File | Purpose |
|------|----------|
| `/routes/admin-notifications.js` | Express routes for templates & send actions |
| `/scripts/sql/2025-10-XX_add_notifications_templates.sql` | SQL migration |
| `/public/partials/admin-email-templates.html` | Frontend UI partial |
| `/public/admin/js/email-templates.js` | JS controller |
| `/scripts/notifications_worker.js` | **Updated** worker script for queued sends |
| `/docs/WattSun_Admin_Email_Templates_Proposal.md` | This document |

---

## 📚 10. Notes & Future Enhancements

- Extend template engine to support Markdown or MJML (optional).
- Support attachments for invoices or summaries.
- Integrate with `/api/internal/notify` for internal triggers.
- Add “Preview in Browser” function using sample payload.

---

*End of Document*
