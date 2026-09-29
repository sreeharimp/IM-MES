# SCHEMA DRIFT REPORT

**Project**: IM-MES (Injection Moulding MES)  
**Live database**: `eelyuahpkpiwobchtuxv.supabase.co`  
**Introspection date**: 2026-08-01  
**Method**: Live PostgREST column-probe via `SELECT ?column&limit=0` — column existence confirmed by whether PostgREST returns HTTP 200 (column exists, even if RLS blocks rows) or HTTP 400 `column does not exist` (42703).  

---

## Summary of Findings

| Severity | Count | Description |
|---|---|---|
| 🔴 Critical | 5 | Columns that the application **reads/writes but do not exist in the database** |
| 🟡 Warning | 4 | Columns that **exist in the live DB but are absent from all schema files** (forward drift) |
| 🟠 Schema-file-only | 2 | Columns in old schema files that are **not in the live DB** (vestigial definitions) |
| ℹ️ Informational | 3 | Tables confirmed correct with no drift |

---

## 🔴 CRITICAL: App Reads/Writes Columns That Don't Exist in the Database

### 1. `machines.last_cleaning_done` — MISSING FROM DB

- **Status in live DB**: **DOES NOT EXIST** (confirmed)
- **In schema files**: Absent from `supabase_schema.sql`, `supabase_migration.sql`, and all migration files
- **Where used in app**:
  - `App.tsx:186` — read from `m.last_cleaning_done` on initial load
  - `App.tsx:195` — merged from `m.last_cleaning_done` in realtime handler
  - `App.tsx:429` — read on fetchData
  - `App.tsx:504` — merged in realtime machine UPDATE handler
- **Written by app**: **Never explicitly written** — only read. The value is always `undefined` (PostgreSQL returns `null` for missing columns but PostgREST omits them, so the value silently coerces to `undefined`).
- **Effect**: `machine.lastCleaningDone` is always `undefined`/`null` in the React state. The `JobSetupModal`'s cleaning checklist step is **purely local** — results are never persisted to the database.
- **Fix**: `ALTER TABLE machines ADD COLUMN IF NOT EXISTS last_cleaning_done BOOLEAN DEFAULT NULL;` ← included in `supabase_schema_v2.sql`

---

### 2. `machines.fai_approved` — MISSING FROM DB

- **Status in live DB**: **DOES NOT EXIST** (confirmed)
- **In schema files**: Absent from all schema files
- **Where used in app**:
  - `App.tsx:186`, `App.tsx:195`, `App.tsx:429`, `App.tsx:504` — read only, never written
- **Effect**: `machine.faiApproved` is always `undefined`/`null`. Any UI logic that checks FAI approval status silently treats it as false.
- **Fix**: `ALTER TABLE machines ADD COLUMN IF NOT EXISTS fai_approved BOOLEAN DEFAULT NULL;` ← included in `supabase_schema_v2.sql`

---

### 3. `app_settings.active_supervisor_name` — MISSING FROM ALL SCHEMA FILES

- **Status in live DB**: **EXISTS** ✅ (confirmed)
- **In schema files**: `supabase_schema.sql` has only 4 columns: `id, current_shift, pending_handover, last_handover_summary`. This column is absent.
- **Where used in app**:
  - `App.tsx:402` — read into `appSettings.activeSupervisorName`
  - `App.tsx:407` — used for auto-authorization logic
  - `App.tsx:548` — updated in realtime handler
  - `App.tsx:669` — **written**: `UPDATE app_settings SET active_supervisor_name = ...`
- **Effect**: Works correctly in the live DB. But a fresh deployment from the old schema files would break shift handover and supervisor tracking entirely.
- **Fix**: `ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS active_supervisor_name TEXT;` ← included in `supabase_schema_v2.sql`

---

### 4. `app_settings.print_labels` — MISSING FROM ALL SCHEMA FILES

- **Status in live DB**: **EXISTS** ✅ (confirmed)
- **In schema files**: Absent
- **Where used in app**:
  - `App.tsx:403` — read into `appSettings.printLabels`
  - `App.tsx:549` — updated in realtime handler
  - `AdminDashboard.tsx:90-98` — **written**: `UPDATE app_settings SET print_labels = {production_slip: labels}`
  - `printService.ts:55` — read to customize thermal print slip field names
- **Effect**: Works in live DB. Fresh deployment from old schema would silently break thermal printer label customization (all labels would revert to hardcoded defaults).
- **Fix**: `ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS print_labels JSONB;` ← included in `supabase_schema_v2.sql`

---

### 5. `app_settings.outgoing_supervisor_email` — MISSING FROM ALL SCHEMA FILES

- **Status in live DB**: **EXISTS** ✅ (confirmed)
- **In schema files**: Absent. The column appears in `App.tsx:401` as `appData.last_handover_summary?.outgoing_supervisor_email`, suggesting it was originally planned as a JSONB key within `last_handover_summary`. It was later also added as a top-level column.
- **Where used in app**:
  - `App.tsx:401` — read (but reads from JSONB sub-key primarily)
  - `App.tsx:1129` — `appSettings.lastHandoverSummary?.outgoing_supervisor_email` (reads from JSONB, not the column directly)
- **Effect**: Mildly duplicated. The column exists but the app actually reads the email from the JSONB blob, not this column. Low risk but still undocumented.
- **Fix**: `ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS outgoing_supervisor_email TEXT;` ← included in `supabase_schema_v2.sql`

---

## 🟡 WARNING: Columns in Live DB Not in Any Schema File

These columns exist in the live database but were never captured in any SQL file. They represent undocumented manual additions.

### `products` table — 3 undocumented columns

| Column | Live DB | Schema Files |
|---|---|---|
| `batch_identifier` | **EXISTS** ✅ | Missing from `supabase_schema.sql`. Present in `supabase_migration.sql` only as `ALTER TABLE products ADD COLUMN IF NOT EXISTS` with no type — **wait, it's not there either**. It was added manually. |
| `part_number` | **EXISTS** ✅ | Absent from all files. Not used by frontend code. |
| `product_code` | **EXISTS** ✅ | Absent from all files. Not used by frontend code (the app uses `item_code`, not `product_code` on products). Confusingly, `product_code` exists on `batch_records` too, where it *is* used. |
| `approved_grades` | **EXISTS** ✅ | Absent from all files. Not used by frontend code. |

**Risk**: If the DB is ever restored from schema files, these 3 columns would be missing. `batch_identifier` would break batch ID generation for all products.

---

## 🟠 SCHEMA-FILE-ONLY: Columns in Old Files But NOT in Live DB

These are in the old SQL files but confirmed absent from the live database.

| Table | Column | In File | In Live DB | Notes |
|---|---|---|---|---|
| `crates` | `created_at` | `supabase_migration.sql` mentions adding it | **DOES NOT EXIST** | Never actually added. Low impact — not read by app. |
| `batch_records` | `created_at` | Implicitly expected | **DOES NOT EXIST** | Not used by app. |
| `shift_settings` | `created_at` | `supabase_migration.sql` adds other timestamps | **DOES NOT EXIST** | Not used by app. |

---

## ℹ️ Tables Verified With No Drift

The following tables match exactly between old schema files and live DB:

| Table | Confirmed Correct |
|---|---|
| `moulds` | ✅ All columns match |
| `operators` | ✅ All columns match |
| `breakdown_records` | ✅ All columns match |
| `shift_summaries` | ✅ All columns match (including remarks, incoming_supervisor_name from migration) |
| `activity_logs` | ✅ All columns match |
| `defect_types` | ✅ All columns match |
| `breakdown_reasons` | ✅ All columns match |
| `cleaning_tasks` | ✅ All columns match |
| `authorized_supervisors` | ✅ All columns match |

---

## Crate Count Audit (Item 2 from Request)

Queried live at 2026-08-01:

| Metric | Value |
|---|---|
| **Total crates in DB** | 2,161 |
| **Pending Inspection** | **1,549** |
| **Crates invisible to UI** (beyond top-1000 by `end_time`) | **549** |
| Oldest invisible pending crate | `APBS26E25-IMM-A-1` — 2026-05-25 11:23 UTC |
| Most recent date of invisible crates | ~2026-06-xx (estimated cutoff) |

**Confirmed**: 549 production bins that were never inspected are currently invisible in the Inspections tab. They cannot be found or acted upon through the current UI.

---

## OEE Audit (Item 3 from Request)

### Columns: `machines.oee`, `machines.availability`, `machines.quality`

**Confirmed live values**: All 4 machines have `oee = 0`, `availability = 0`, `quality = 0` in the live database as of 2026-08-01.

**Code audit results**:

| Location | Operation | Details |
|---|---|---|
| `App.tsx:186` | READ | `oee: m.oee \|\| 0` on initial fetch |
| `App.tsx:195` | READ (merge) | `oee: m.oee ?? old.oee` in realtime UPDATE |
| `App.tsx:429` | READ | Same as initial fetch |
| `App.tsx:503` | READ (merge) | `oee: m.oee ?? mach.oee` in realtime channel |
| `App.tsx:1031` | DISPLAY | `Math.round(machines.reduce((acc, m) => acc + (m.oee \|\| 0), 0) / machines.length)` |
| `types.ts:25-27` | TYPED | `oee?: number`, `availability?: number`, `quality?: number` |

**Verdict**: **🚫 OEE is never written by the application.** No `supabase.from('machines').update({ oee: ... })` call exists anywhere in the codebase. The `availability` and `quality` fields are typed in `types.ts` and read from the DB on load/realtime updates, but **never displayed or written**.

The Plant OEE displayed on the Overview tab is the arithmetic mean of all machines' `oee` values from the database — which are all 0. **The displayed OEE percentage is always 0% and is meaningless.**

**Root cause**: OEE calculation was planned as a future feature (possibly to be computed by a Supabase Edge Function or background job), but was never implemented.

---

## Dead Code Summary (Item 5 from Request)

| Component / Type | Import in App.tsx | Used in JSX | Assessment |
|---|---|---|---|
| `PacketLabelModal.tsx` | ❌ Never imported | ❌ | **Fully unreferenced.** 68 lines. Standalone component for carton/packet label printing. Print button is wired to `window.print()` only. No database integration. Safe to delete or integrate. |
| `BreakdownModalMUI.tsx` | ❌ Never imported | ❌ | **Fully unreferenced.** MUI-styled duplicate of `BreakdownModal.tsx`. No functional difference observed. Safe to delete. |
| `InspectionModalMUI.tsx` | ❌ Never imported | ❌ | **Fully unreferenced.** MUI-styled duplicate of `InspectionModal.tsx`. No functional difference. Safe to delete. |
| `DashboardOverviewMUI.tsx` | ❌ Never imported | ❌ | **Fully unreferenced.** Complete MUI replacement for the Overview tab inline JSX. Takes `machines, products, pendingCrates, batchRecords` props. If wired in, would replace the current Overview tab with a richer MUI grid layout. Could be repurposed rather than deleted. |
| `ShiftHandoverModal.tsx` | ❌ Never imported | ❌ | **Fully unreferenced.** Older modal-based handover UI. The current flow uses `ShiftHandoverPage` (full-screen page) instead. Safe to delete. |
| `Batch` type (`types.ts:70-81`) | ❌ Not imported anywhere | ❌ | **Fully unreferenced type.** Represents a "grandparent" batch concept above `BatchRecord`. Never used in any component or API call. Safe to remove. |
| `Packet` type (`types.ts:108-115`) | ❌ Not imported anywhere | ❌ | **Fully unreferenced type.** Planned sub-unit after QC inspection for carton packing. No DB table exists. `PacketLabelModal` would use this if integrated. |
| `StoppageLog` type (`types.ts:136-144`) | ❌ Not imported anywhere | ❌ | **Fully unreferenced type.** Planned per-bin downtime log. No DB table exists. No UI or API calls reference it. |
