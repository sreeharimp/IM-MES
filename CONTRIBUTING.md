# Contributing to IM-MES

## Repository Structure

This workspace covers three separate apps that share a Supabase backend:

| App | Directory | GitHub |
|-----|-----------|--------|
| Main MES | `d:\IMMC v0.2` | `sreeharimp/IM-MES` |
| QC Inspector | `d:\Inspector` | `sreeharimp/IM-Inspector` |
| Packing App | `d:\IMMC-Packing` | `sreeharimp/IM-Packing` |

---

## Branch Strategy

```
main           ← production-ready only. No direct commits.
  └── feature/xyz       ← all feature work
  └── fix/abc           ← all bug fixes
  └── migration/xyz     ← migration-only branches
  └── chore/xyz         ← tooling, deps, config
```

**Workflow:**
1. Branch off `main`: `git checkout -b feature/my-feature`
2. Commit work following Conventional Commits (see below)
3. Push branch and open a PR / stage for review in VCS panel
4. Wait for review before merging — **never self-merge to main**

---

## Commit Message Format (Conventional Commits)

```
<type>[optional scope]: <short description>
```

| Type | Use for |
|------|---------|
| `feat` | New user-facing feature |
| `fix` | Bug fix |
| `chore` | Deps, config, tooling (no user impact) |
| `migration` | DB schema change (always with a migration file) |
| `docs` | Documentation only |
| `refactor` | Internal restructure, no functional change |

**Examples:**
```
feat(admin): add user access revocation with audit log
fix(scanner): resolve barcode not recognized for new Unit ID format
migration(profiles): add is_active, last_seen_at, revoked_reason
chore: update vite to 8.0.2
docs: add satellite app policy to RULES.md
```

---

## Database Changes

All schema changes go in `supabase/migrations/` — see
[supabase/migrations/README.md](supabase/migrations/README.md) for the full
naming convention and rules.

**Never:**
- Run raw SQL directly against the production database
- Edit a migration file that has already been applied
- Skip creating a migration file and just change the schema in the dashboard

---

## Environment Setup

```bash
# 1. Copy env template
cp .env.example .env

# 2. Fill in real Supabase values (from Supabase Dashboard > Settings > API)
# Edit .env — never commit it

# 3. Install dependencies
npm install

# 4. Start dev server
npm run dev
```

---

## Secret / Credential Policy

- Secrets live in `.env` (git-ignored). Use `import.meta.env.VITE_*` in code.
- If you spot anything that looks like a token or key in code being committed,
  stop and report it before pushing.
- See `.env.example` for required variables.

---

## Dangerous Scripts

Scripts in `scripts/dangerous/` are destructive and require:
```bash
node scripts/dangerous/wipe-data.js --confirm-production
```
Never run these automatically or in CI. Always have a DB backup first.
