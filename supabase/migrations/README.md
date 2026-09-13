# Database Migrations

All schema changes to the IM-MES Supabase database must be managed as
migration files in this directory.

## Naming Convention

```
YYYYMMDDHHMMSS_short_description.sql
```

**Examples:**
```
20260912130000_add_profiles_is_active.sql
20260913183000_add_access_audit_log_table.sql
20260914090000_add_machines_fai_approved.sql
```

Use the timestamp of when you **create** the file (UTC or IST, but be consistent).

## Rules

1. **Append-only**: Never edit a migration file that has already been applied
   to production. Create a new migration to correct mistakes.

2. **Idempotent where possible**: Use `IF NOT EXISTS`, `IF EXISTS`, `DO $$`
   guards so migrations can be re-run safely during testing.

3. **One concern per file**: Don't bundle unrelated schema changes in one file.

4. **Include a header comment** in every file:
   ```sql
   -- Migration: 20260913183000_add_access_audit_log_table
   -- Author: <your name>
   -- Affects: Main MES, QC Inspector (read-only)
   -- Description: Creates the access_audit_log table for user management audit trail.
   ```

5. **Commit message must use `migration:` type:**
   ```
   migration(profiles): add is_active and revoked_reason columns
   ```

6. **Never run raw SQL against production** outside of this migration system.
   If you need an emergency fix, still create the file, apply it, then commit.

## Required DB Migrations (Pending — from SCHEMA_DRIFT_REPORT.md)

The following migrations have been identified as needed but not yet applied.
See Stage 3 audit for full details:

- `profiles.is_active` — access revocation flag
- `profiles.last_seen_at` — heartbeat timestamp
- `profiles.revoked_reason` — reason for revocation
- `access_audit_log` — full audit trail table
- `machines.fai_approved` — FAI approval flag (read by app, may be missing from DB)
- `machines.last_cleaning_done` — read by app, may be missing from DB

> These are documented for awareness. Do not apply until Stage 3 audit is complete.
