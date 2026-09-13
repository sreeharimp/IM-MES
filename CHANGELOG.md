# Changelog

All notable changes to IM-MES will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **From v0.3.1 onwards**, this file is generated from
> [Conventional Commits](https://www.conventionalcommits.org/) via
> `npm run changelog`. See `package.json` scripts for details.
> Entries before v0.3.1 are hand-written from git history.

---

## [Unreleased] — feature/versioning-stage1

### Added
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
