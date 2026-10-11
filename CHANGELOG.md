# Changelog

All notable changes to IM-MES will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **From v0.3.1 onwards**, this file is generated from
> [Conventional Commits](https://www.conventionalcommits.org/) via
> `npm run changelog`. See `package.json` scripts for details.
> Entries before v0.3.1 are hand-written from git history.

---

## [0.3.1] — 2026-10-11

### Added
- **Strict Role-Based Access Control (RBAC):**
  - Blocked non-admin and PowerUser bypasses to Admin Console (`Machines`) across sidebar navigation and route rendering.
  - Restricted Access Management tab strictly to `Admin` with active access denial cards for unauthorized roles.
  - Unified localStorage cache keys (`mes_role_permissions` and `immc_role_permissions`) and added live `mes_permissions_updated` window event synchronization.
- **Traceability & Timestamps in Batch Log:**
  - Added inspection timestamp display for visual inspection and final inspection crate records.
- **Production Planner & Paper Templates:**
  - Fixed blank page issue on Paper Template Management.
  - Added comprehensive B-Tree composite indexes across hot tables (`crates`, `batch_records`, `packets`, `storage_bins`, `production_plans`) to resolve Supabase Disk IO budget exhaustion.
  - Optimized Realtime subscriptions with debouncing and added visibility state pauses across Live Dashboard, Packing, Store Inwarding, and Stock pages.
- **Database Security:**
  - Added migration `20261011210000_enable_rls_all_public_tables.sql` resolving Supabase `rls_disabled_in_public` vulnerability.
  - Added migration `20261011213000_optimize_disk_io_indexes.sql` to optimize database disk read throughput.
- `.agents/rules/RULES.md` — Antigravity workspace rules (branch policy,
  conventional commits, migration discipline, secrets hygiene)
- `supabase/migrations/` directory with naming convention README
- `.env.example` — safe env template with placeholder values
- `CONTRIBUTING.md` — full developer workflow guide
- Git worktree setup: `D:\Inspector` → `apps/inspector` branch,
  `D:\IMMC-Packing` → `apps/packing` branch (single `.git` repository)
- Build-time version injection via `vite.config.ts` (`__APP_VERSION__`,
  `__APP_BUILD_DATE__` globals from `package.json`)
- System Info panel in Admin Console showing version, build date, backend,
  stack, and satellite app versions
- `src/vite-env.d.ts` — TypeScript declarations for build-time constants
- User access revocation: `is_active` flag on profiles, real-time session
  termination via Supabase Realtime when admin revokes mid-session
- `access_audit_log` table tracking all role changes and access revocations
- `last_seen_at` heartbeat (every 5 min) and 45-minute idle auto sign-out
- User management UI: Status badge (Active/Revoked), Last Active column,
  Revoke/Restore toggle with confirmation modal, full Audit Log view
- `parseScannedUnitId` barcode normalization utility in `batchUtils.ts`
- QC Inspector barcode fix: multi-step DB fallback (exact id → normalized →
  batch_id+bin_number → ilike) resolving "not recognized" errors

---

## [0.3.0] — 2026-07 (ver 0.3.0)

### Added
- Enhanced Batch Log with bin-level tree view
- About page
- Thermal label printing via Bluetooth printer (Capacitor native plugin)
- QC Inspection updates with crate-level tracking
- Machine hygiene registry (cleaning schedule, FAI approval)
- Mobile-responsive UI: bottom navigation, drawer sidebar
- Optimized Inspection modals for mobile

### Changed
- Major UI overhaul with dark theme and component library

---

## [0.2.0] — 2026-06 (ver 0.2)

### Added
- ISO 13485 traceability features
- Admin user management with role-based access control (RBAC)
- PowerUser role
- Topbar redesign with Google Blue theme

---

## [0.1.0] — 2026 (initial)

### Added
- Initial commit — core MES features
- User management and supervisor roles
- Basic batch/shift logging
