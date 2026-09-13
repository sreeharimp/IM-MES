-- Migration: 20260913185500_create_system_changes
-- Author: Antigravity (reviewed by admin)
-- Description: Creates the system_changes audit table for tracking administrative, 
--              configuration, and master data changes with actor attribution,
--              old/new value tracking, and optional change request references.

-- ── 1. Create system_changes table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_changes (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- WHO
  changed_by_id    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  changed_by_name  TEXT        NOT NULL,
  changed_by_role  TEXT,                        -- 'Admin', 'Supervisor', 'PowerUser', etc.

  -- WHEN
  changed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- WHAT
  module           TEXT        NOT NULL,         -- 'Products', 'Shift Config', 'Cleaning Checklist', 'User Access', etc.
  table_name       TEXT,                         -- 'products', 'shift_settings', 'cleaning_tasks', etc.
  record_id        TEXT,                         -- Affected row ID
  field_changed    TEXT,                         -- Field name or summary of changed attributes
  old_value        TEXT,                         -- Previous value (stringified or JSON)
  new_value        TEXT,                         -- Updated value (stringified or JSON)
  action           TEXT        NOT NULL,         -- 'CREATE' | 'UPDATE' | 'DELETE' | 'CONFIG'

  -- WHY
  reason           TEXT,                         -- Reason / rationale for change

  -- LINK (optional)
  change_request   TEXT                          -- e.g. 'CR-2026-001', ticket reference
);

COMMENT ON TABLE system_changes IS
  'Immutable operational audit log for master data, configuration, and administrative updates.';

-- ── 2. Indices for fast lookup & filtering ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_system_changes_changed_at 
  ON system_changes (changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_changes_module_changed_at 
  ON system_changes (module, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_changes_table_record 
  ON system_changes (table_name, record_id);

-- ── 3. Row Level Security (RLS) ──────────────────────────────────────────────
ALTER TABLE system_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read on system_changes" ON system_changes;
CREATE POLICY "Allow authenticated read on system_changes"
  ON system_changes
  FOR SELECT
  TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "Allow app insert on system_changes" ON system_changes;
CREATE POLICY "Allow app insert on system_changes"
  ON system_changes
  FOR INSERT
  WITH CHECK (TRUE);

-- ─────────────────────────────────────────────────────────────────────────────
-- End of migration 20260913185500_create_system_changes
-- ─────────────────────────────────────────────────────────────────────────────
