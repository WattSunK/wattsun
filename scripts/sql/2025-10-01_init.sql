-- 2025-10-01_init.sql
-- Baseline schema for Tenant–Landlord Marketplace (Dev)
PRAGMA foreign_keys = ON;

-- Users (minimal for bootstrap)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'tenant',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

-- Seed a lightweight admin for smoke tests (password intentionally omitted at this stage)
INSERT OR IGNORE INTO users (email, role) VALUES ('admin@example.com', 'admin');
