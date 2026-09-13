# IM-MES Workspace Rules

These rules apply to all agent sessions in this workspace (`d:\IMMC v0.2` and satellite apps).

## Branch & Commit Policy

- **Never commit or push directly to `main`.** All work must happen on a
  named feature or fix branch (e.g. `feature/xyz`, `fix/abc`) and be reviewed
  before merge. The only exception is emergency hotfixes, which still require a
  PR — just a fast-tracked one.

- **Branch naming convention:**
  - Features: `feature/<short-description>`
  - Bug fixes: `fix/<short-description>`
  - Migrations only: `migration/<description>`
  - Chores/tooling: `chore/<description>`

- **Never merge your own branches into main.** Stage the branch for review in
  the VCS panel and wait for explicit approval.

## Conventional Commits

All commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <short description>

[optional body]
[optional footer]
```

**Required types:**
- `feat:` — new user-facing feature
- `fix:` — bug fix
- `chore:` — tooling, config, dependency updates with no user impact
- `migration:` — database schema change (must accompany a migration file)
- `docs:` — documentation only
- `refactor:` — code change with no functional difference
- `test:` — adding or updating tests

**Examples:**
```
feat(admin): add is_active revocation toggle for user management
fix(scanner): resolve APBT26I12-IMM-A-9 barcode not found error
migration: add profiles.is_active and access_audit_log table
chore: bump vite to 8.0.2
docs: update CONTRIBUTING.md with branch strategy
```

**Scope is optional but encouraged** for cross-cutting changes
(e.g. `feat(packing):`, `fix(inspector):`, `migration(crates):`).

## Database Migration Policy

- **Every schema change must be a new timestamped file** under
  `supabase/migrations/YYYYMMDDHHMMSS_description.sql`.
- **Never hand-edit the live database** outside of a migration file.
- **Never run ad-hoc SQL against production** directly. Generate the migration
  file, commit it, then apply via Supabase CLI or dashboard migration runner.
- Migration files are **append-only** — never edit a migration that has already
  been applied to production. Create a new migration to correct it.
- **Naming format:** `20260913183000_add_profiles_is_active.sql`

## Dangerous Scripts Policy

- Any script under `/scripts/dangerous/` **must never be run automatically**
  or as part of CI/CD pipelines.
- These scripts require the `--confirm-production` flag to be explicitly passed
  by a human operator before execution.
- Before running any script in `/scripts/dangerous/`, confirm:
  1. You have a current database backup.
  2. You have tested the equivalent change in a staging environment.
  3. The change has been reviewed and approved.

## Secrets & Credentials Policy

- **No hardcoded secrets, keys, JWTs, or passwords in committed code.**
- The Supabase anon key and URL live in `.env` (git-ignored). Use
  `import.meta.env.VITE_*` in source code — never inline values.
- Before committing, scan for patterns that look like credentials:
  - JWT tokens (`eyJ...`)
  - Supabase project URLs (`*.supabase.co`)
  - Any string longer than 40 chars that looks like a key/token
- If you find a potential secret in code being committed, **stop and flag it**
  to the user before proceeding. Do not commit it.
- `.env.example` is the only env file that may be committed — it must contain
  only placeholder values, never real ones.

## Satellite App Policy

This workspace encompasses three apps that share the same Supabase backend:

| App | Directory | Repo |
|-----|-----------|------|
| Main MES | `d:\IMMC v0.2` | `sreeharimp/IM-MES` |
| QC Inspector | `d:\Inspector` | `sreeharimp/IM-Inspector` (separate) |
| Packing App | `d:\IMMC-Packing` | `sreeharimp/IM-Packing` (separate) |

- Schema changes that affect satellite apps must be noted in the migration
  file's comment header.
- Satellite apps share `supabase/migrations/` awareness — if you add a
  migration in the main repo that affects Inspector or Packing, note it.

## File Safety

- Flag any file you are unsure about changing — especially:
  - `src/lib/supabase.ts` (auth/client configuration)
  - `.env`, `.env.*` (secrets — should never be committed)
  - `android/` directory (native build artifacts)
  - `scripts/dangerous/*` (destructive scripts)
  - Any migration file already applied to production
