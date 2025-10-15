-- ============================================================
-- Migration: 2025-10-15_upgrade_loyalty_programs.sql
-- Goal: align loyalty_programs schema with QA / production
-- ============================================================

-- Add missing columns if they don't already exist
PRAGMA foreign_keys = OFF;

ALTER TABLE loyalty_programs ADD COLUMN description TEXT DEFAULT '';
ALTER TABLE loyalty_programs ADD COLUMN points_rate REAL DEFAULT 1.0;
ALTER TABLE loyalty_programs ADD COLUMN duration_months INTEGER DEFAULT 12;
ALTER TABLE loyalty_programs ADD COLUMN eligible_types TEXT DEFAULT 'Admin,Staff,Customer';
ALTER TABLE loyalty_programs ADD COLUMN start_date TEXT DEFAULT (date('now'));
ALTER TABLE loyalty_programs ADD COLUMN end_date TEXT DEFAULT (date('now','+12 month'));
ALTER TABLE loyalty_programs ADD COLUMN status TEXT DEFAULT 'Active';

PRAGMA foreign_keys = ON;

-- Verify
SELECT sql FROM sqlite_master WHERE type='table' AND name='loyalty_programs';
