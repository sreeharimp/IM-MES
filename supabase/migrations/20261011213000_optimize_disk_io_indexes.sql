-- ==============================================================================
-- Migration: 20261011213000_optimize_disk_io_indexes.sql
-- Description: Resolves Supabase "Depleting Disk IO Budget" issue.
--              Adds high-efficiency B-tree composite indices on hot query paths.
--              Eliminates expensive full-table sequential disk scans across
--              crates, batch_records, packets, storage_bins, and production_plans.
-- Idempotent: Uses IF NOT EXISTS, safe to run repeatedly.
-- ==============================================================================

-- ── 1. Crates Hot-Query Indices (Top Disk IO Consumer) ─────────────────────────
-- Optimizes: App.tsx (Pending Inspection crates ordered by start_time)
CREATE INDEX IF NOT EXISTS idx_crates_status_start_time 
  ON public.crates (status, start_time DESC);

-- Optimizes: LiveDashboardPage.tsx (Completed crates inspected today)
CREATE INDEX IF NOT EXISTS idx_crates_status_inspected_at 
  ON public.crates (status, inspected_at DESC);

-- Optimizes: BatchLogPage & Shop Floor lookups
CREATE INDEX IF NOT EXISTS idx_crates_batch_id 
  ON public.crates (batch_id);

CREATE INDEX IF NOT EXISTS idx_crates_machine_id 
  ON public.crates (machine_id);

CREATE INDEX IF NOT EXISTS idx_crates_end_time 
  ON public.crates (end_time DESC);


-- ── 2. Batch Records Indices ───────────────────────────────────────────────────
-- Optimizes: App.tsx & BatchLogPage (Latest 60 batches ordered by start_time)
CREATE INDEX IF NOT EXISTS idx_batch_records_start_time 
  ON public.batch_records (start_time DESC);

CREATE INDEX IF NOT EXISTS idx_batch_records_status 
  ON public.batch_records (status);

CREATE INDEX IF NOT EXISTS idx_batch_records_machine_id 
  ON public.batch_records (machine_id);


-- ── 3. Packets & Storage Bins Indices ──────────────────────────────────────────
-- Optimizes: PackingPage, StoreInwardingPage & Final Inspection queries
CREATE INDEX IF NOT EXISTS idx_packets_status_bin 
  ON public.packets (status, storage_bin_id);

CREATE INDEX IF NOT EXISTS idx_packets_batch_id 
  ON public.packets (batch_id);

CREATE INDEX IF NOT EXISTS idx_packets_packed_at 
  ON public.packets (packed_at DESC);

CREATE INDEX IF NOT EXISTS idx_storage_bins_location 
  ON public.storage_bins (current_location);


-- ── 4. Breakdown & Maintenance Records Indices ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_breakdown_records_machine_start 
  ON public.breakdown_records (machine_id, start_time DESC);

CREATE INDEX IF NOT EXISTS idx_breakdown_records_status 
  ON public.breakdown_records (status);


-- ── 5. Shift Summaries Indices ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_shift_summaries_date_id 
  ON public.shift_summaries (shift_date DESC, shift_id);


-- ── 6. Production Plans & Labels Indices ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_production_plans_status_date 
  ON public.production_plans (status, plan_date DESC);

CREATE INDEX IF NOT EXISTS idx_production_plan_labels_plan_status 
  ON public.production_plan_labels (plan_id, status);


-- ── 7. Analyze Tables to Refresh Query Planner Statistics ─────────────────────
ANALYZE public.crates;
ANALYZE public.batch_records;
ANALYZE public.packets;
ANALYZE public.storage_bins;
ANALYZE public.breakdown_records;
ANALYZE public.shift_summaries;
ANALYZE public.production_plans;
ANALYZE public.production_plan_labels;

NOTIFY pgrst, 'reload schema';
