-- Migration: 20260920020000_add_cancelled_status
-- Description: Expands the production_plan_labels status check constraint to include
--              'cancelled' (used when a label is removed from the print queue) and
--              'voided' (used for discarded/invalidated labels).

-- Drop the existing constraint (whatever values it currently allows)
ALTER TABLE production_plan_labels
  DROP CONSTRAINT IF EXISTS production_plan_labels_status_check;

-- Recreate with the full set of valid statuses
ALTER TABLE production_plan_labels
  ADD CONSTRAINT production_plan_labels_status_check
  CHECK (status IN ('unprinted', 'printed', 'in_progress', 'cancelled', 'voided', 'reprinted'));
