-- Migration: 20260913183000_reconcile_schema_drift
-- Author: Antigravity (reviewed by admin)
-- Affects: Main MES, QC Inspector (profiles/access_audit_log)
-- Description: Reconciles all known schema drift between live DB and app source.
--              Adds missing columns that the app already reads/writes, documents
--              undocumented live-DB-only columns, and creates the access_audit_log
--              table added during this session's user management work.
--
-- SAFE TO RUN MULTIPLE TIMES: all statements use IF NOT EXISTS / idempotent guards.
-- DO NOT apply to production without reviewing the Stage 3 audit report first.
--
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. machines: Critical missing columns ────────────────────────────────────
-- App reads these on every load; always null in live DB currently.

ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS last_cleaning_done BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fai_approved       BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN machines.last_cleaning_done IS
  'Whether last cleaning was completed. Set by JobSetupModal cleaning checklist.';
COMMENT ON COLUMN machines.fai_approved IS
  'First-Article Inspection approval flag. Set manually by supervisor.';

-- ── 2. app_settings: Document undocumented live-DB columns ───────────────────
-- These already exist in the live DB but are absent from all schema files.
-- Using IF NOT EXISTS so this is a no-op if already present.

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS active_supervisor_name   TEXT,
  ADD COLUMN IF NOT EXISTS print_labels             JSONB,
  ADD COLUMN IF NOT EXISTS outgoing_supervisor_email TEXT,
  ADD COLUMN IF NOT EXISTS role_permissions         JSONB;

COMMENT ON COLUMN app_settings.active_supervisor_name IS
  'Name of the currently active supervisor (set on shift handover).';
COMMENT ON COLUMN app_settings.print_labels IS
  'Thermal printer label field customization (JSON config for production slips).';
COMMENT ON COLUMN app_settings.role_permissions IS
  'RBAC module access matrix (JSON). Keys are role names, values are allowed tab IDs.';

-- ── 3. products: Document undocumented live-DB columns ───────────────────────

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS batch_identifier TEXT,
  ADD COLUMN IF NOT EXISTS part_number      TEXT,
  ADD COLUMN IF NOT EXISTS approved_grades  TEXT[];

COMMENT ON COLUMN products.batch_identifier IS
  'Short code used to build batch IDs (e.g. "APB"). Critical for batch tracking.';
COMMENT ON COLUMN products.part_number IS
  'Customer-facing part number. Not currently used by frontend.';
COMMENT ON COLUMN products.approved_grades IS
  'List of approved raw material grades for this product.';

-- ── 4. profiles: User management columns (added this session) ─────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_seen_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_reason TEXT;

COMMENT ON COLUMN profiles.is_active IS
  'Access control flag. FALSE = account revoked; user is signed out immediately via Realtime.';
COMMENT ON COLUMN profiles.last_seen_at IS
  'Timestamp updated every 5 minutes by the app heartbeat while user is active.';
COMMENT ON COLUMN profiles.revoked_reason IS
  'Optional reason entered by admin when revoking access (shown in audit log).';

-- ── 5. access_audit_log: New table for user management audit trail ────────────

CREATE TABLE IF NOT EXISTS access_audit_log (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  target_user_name  TEXT,
  action            TEXT        NOT NULL,   -- 'revoke' | 'restore' | 'role_changed'
  performed_by_id   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  performed_by_name TEXT,
  old_value         TEXT,
  new_value         TEXT,
  reason            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE access_audit_log IS
  'Immutable audit trail for all user access changes: revocations, restorations, role changes.';

-- Index for fast lookup by user and time
CREATE INDEX IF NOT EXISTS idx_audit_log_target_user
  ON access_audit_log (target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
  ON access_audit_log (created_at DESC);

-- ── 6. Enable RLS on access_audit_log ────────────────────────────────────────
-- Only Admins should be able to read this table.
-- Adjust the policy to match your actual role column/check.

ALTER TABLE access_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read audit log" ON access_audit_log;
CREATE POLICY "Admins can read audit log"
  ON access_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'Admin'
    )
  );

DROP POLICY IF EXISTS "App can insert audit events" ON access_audit_log;
CREATE POLICY "App can insert audit events"
  ON access_audit_log
  FOR INSERT
  WITH CHECK (TRUE);   -- inserts are controlled by app logic, not row-level

-- ─────────────────────────────────────────────────────────────────────────────
-- End of migration 20260913183000_reconcile_schema_drift
-- ─────────────────────────────────────────────────────────────────────────────
