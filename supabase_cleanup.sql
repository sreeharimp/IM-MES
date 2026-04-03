-- Supabase Cleanup Script
-- DANGER: This will delete all production data!
-- Preserves Products, Operators, Moulds, and Supervisor accounts.

-- 1. Delete Transactional Data
TRUNCATE TABLE crates CASCADE;
TRUNCATE TABLE batch_records CASCADE;
TRUNCATE TABLE breakdown_records CASCADE;
TRUNCATE TABLE activity_logs CASCADE;
TRUNCATE TABLE shift_summaries CASCADE;

-- 2. Reset Machine States
UPDATE machines SET 
  status = 'Idle',
  current_mould_id = NULL,
  current_operator_id = NULL,
  active_product_id = NULL,
  current_material_id = NULL,
  material_grade = NULL,
  material_batch = NULL,
  current_bin_number = 1,
  current_shift_production = 0,
  current_day_production = 0,
  bin_start_time = NULL,
  active_batch_id = NULL,
  active_batch_date = NULL,
  breakdown_start_time = NULL,
  oee = 0,
  availability = 0,
  quality = 0,
  last_updated = NOW();

-- 3. Reset Global App Settings
UPDATE app_settings SET 
  pending_handover = false,
  last_handover_summary = NULL,
  outgoing_supervisor_email = NULL;

-- 4. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

PRINT 'Cleanup complete. Production data cleared, configuration preserved.';
