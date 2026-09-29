# PLAN.md — System Fixes & Mitigation Plan

> **Status**: APPROVED & IMPLEMENTATION IN PROGRESS  
> **Date**: 2026-08-01  

---

## 1. Item 1: Reconcile Schema Drift (Approved As-Is)
- **Artifacts**: [supabase_schema_v2.sql](file:///d:/IMMC%20v0.2/supabase_schema_v2.sql) and [SCHEMA_DRIFT_REPORT.md](file:///d:/IMMC%20v0.2/SCHEMA_DRIFT_REPORT.md).
- **Decision**: Approved as additive documentation. Captures ground-truth DDL for all 18 tables + RLS policies + 5 drift column additions (`machines.last_cleaning_done`, `machines.fai_approved`, `app_settings.active_supervisor_name`, `app_settings.print_labels`, `app_settings.outgoing_supervisor_email`).

---

## 2. Item 2: Pending Crates Pagination & Server-Side Filtering (Approved)

### Requirements & Architecture
- **Goal**: Resolve the 1,000-row Supabase PostgREST default query limit so all **1,549 pending crates** are accessible and searchable across pages.
- **Server-Side Filter & Sort Requirement**: Filters (`filterMachineId`, `filterBatch`, `filterDate`, `filterProduct`, `sortOrder`) must execute on the **Supabase PostgREST backend**, not in memory.
- **Count & Pagination**:
  - Exact total matching count queried using `{ count: 'exact' }`.
  - Pagination performed via Supabase `.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)` (PAGE_SIZE = 10).
  - UI warning banner displayed whenever total pending count > 900.

### Code Implementation Details

#### File: `src/components/InspectionPage.tsx`
- Move filtering & pagination to PostgREST query:
  ```ts
  let query = supabase
    .from('crates')
    .select('*', { count: 'exact' })
    .eq('status', 'Pending Inspection');

  if (filterMachineId) query = query.eq('machine_id', filterMachineId);
  if (filterBatch) query = query.or(`id.ilike.%${filterBatch}%,batch_id.ilike.%${filterBatch}%`);
  if (filterDate) query = query.gte('start_time', `${filterDate}T00:00:00`).lte('start_time', `${filterDate}T23:59:59`);
  if (filterProduct) {
    const matchedBatches = batchRecords.filter(b => b.productName === filterProduct).map(b => b.id);
    if (matchedBatches.length > 0) query = query.in('batch_id', matchedBatches);
  }
  query = query.order('end_time', { ascending: sortOrder === 'asc' });
  query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  ```
- Render warning banner when `totalPendingCount > 900`.
- Update pagination controls to drive page navigation across the server query.

---

## 3. Item 3: OEE Display (Option B Approved)
- **Decision**: Option B approved (label change only). Explicitly defer Option A (frontend estimation engine).
- **Code Changes**:
  - `src/App.tsx:1031`: Change `Plant OEE` display from `{avg}% Avg` to `N/A (Unconfigured)`.
  - `src/components/InspectionModal.tsx:118`: Remove/update misleading 0% mini meter display.

---

## 4. Item 4: Script Gating & Security Cleanup (Approved)
- **Actions Taken**:
  1. Created `/scripts/dangerous/wipe-data.js` and `/scripts/dangerous/fix-batches.js` with:
     - Dynamic URL hostname check (detects remote database without hardcoded project ref literals).
     - Required `--confirm-production` flag for remote execution.
     - Default `--dry-run` mode (requires `--execute` to write/delete).
  2. Deleted root-level un-gated scripts: `wipe-data.js`, `fix-batches.js`, `fix_batches.js`.
  3. **Security Note**: `fix_batches.js` in root previously contained a hardcoded JWT anon key token. It has been deleted. (The key was a public anon key, but key rotation in Supabase settings is recommended if strict key hygiene is required).

---

## 5. Item 5: Dead Code Cleanup (Deferred)
- **Decision**: Hold dead code deletion/repurposing for a separate follow-up pass.
- Unused components (`PacketLabelModal.tsx`, `BreakdownModalMUI.tsx`, `InspectionModalMUI.tsx`, `DashboardOverviewMUI.tsx`, `ShiftHandoverModal.tsx`) and types (`Batch`, `Packet`, `StoppageLog`) remain intact in the codebase for now.
