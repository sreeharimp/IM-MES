-- ==============================================================================
-- supabase_schema_v2.sql
-- Ground-truth idempotent schema for IM-MES Supabase project
-- Generated: 2026-08-01 by live introspection of eelyuahpkpiwobchtuxv.supabase.co
--
-- USAGE: Run this in Supabase SQL Editor on a fresh project.
-- All statements are CREATE TABLE IF NOT EXISTS + ALTER TABLE ADD COLUMN IF NOT EXISTS
-- so they are safe to re-run on an existing database without data loss.
-- ==============================================================================


-- ==============================================================================
-- TABLE: moulds  (must precede products and machines due to FK references)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS moulds (
    id                TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    cavities          INTEGER          DEFAULT 4,
    cycle_time        INTEGER          DEFAULT 20,
    standard_bin_qty  INTEGER          DEFAULT 4000,
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE moulds ADD COLUMN IF NOT EXISTS cavities         INTEGER DEFAULT 4;
ALTER TABLE moulds ADD COLUMN IF NOT EXISTS cycle_time       INTEGER DEFAULT 20;
ALTER TABLE moulds ADD COLUMN IF NOT EXISTS standard_bin_qty INTEGER DEFAULT 4000;
ALTER TABLE moulds ADD COLUMN IF NOT EXISTS created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW();


-- ==============================================================================
-- TABLE: machines
-- Live columns confirmed 2026-08-01:
--   id, name, model, status, current_mould_id, current_operator_id,
--   active_product_id, current_material_id, material_grade, material_batch,
--   current_bin_number, current_shift_production, current_day_production,
--   cycle_time, cavities, bin_target, bin_start_time, active_batch_id,
--   active_batch_date, breakdown_start_time, oee, availability, quality,
--   last_updated
-- DRIFT COLUMNS ADDED HERE (do not exist in live DB yet):
--   last_cleaning_done, fai_approved
-- ==============================================================================
CREATE TABLE IF NOT EXISTS machines (
    id                          TEXT PRIMARY KEY,
    name                        TEXT NOT NULL,
    model                       TEXT,
    status                      TEXT    DEFAULT 'Idle',
    current_mould_id            TEXT    REFERENCES moulds(id),
    current_operator_id         TEXT,
    active_product_id           TEXT,
    current_material_id         TEXT,
    material_grade              TEXT,
    material_batch              TEXT,
    current_bin_number          INTEGER DEFAULT 1,
    current_shift_production    INTEGER DEFAULT 0,
    current_day_production      INTEGER DEFAULT 0,
    cycle_time                  INTEGER,
    cavities                    INTEGER,
    bin_target                  INTEGER,
    bin_start_time              BIGINT,
    active_batch_id             TEXT,
    active_batch_date           TEXT,
    breakdown_start_time        BIGINT,
    oee                         NUMERIC DEFAULT 0,
    availability                NUMERIC DEFAULT 0,
    quality                     NUMERIC DEFAULT 0,
    last_updated                TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- DRIFT FIX: columns read by app but missing from DB
    last_cleaning_done          BOOLEAN DEFAULT NULL,
    fai_approved                BOOLEAN DEFAULT NULL
);

ALTER TABLE machines ADD COLUMN IF NOT EXISTS current_material_id       TEXT;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS material_grade            TEXT;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS material_batch            TEXT;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS active_batch_id           TEXT;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS active_batch_date         TEXT;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS bin_start_time            BIGINT;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS breakdown_start_time      BIGINT;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS oee                       NUMERIC DEFAULT 0;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS availability              NUMERIC DEFAULT 0;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS quality                   NUMERIC DEFAULT 0;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS last_updated              TIMESTAMP WITH TIME ZONE DEFAULT NOW();
-- DRIFT FIX: add the two missing columns
ALTER TABLE machines ADD COLUMN IF NOT EXISTS last_cleaning_done BOOLEAN DEFAULT NULL;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS fai_approved        BOOLEAN DEFAULT NULL;


-- ==============================================================================
-- TABLE: profiles  (linked to Supabase Auth)
-- Live columns confirmed: id, full_name, email, role, updated_at, employee_code
-- ==============================================================================
CREATE TABLE IF NOT EXISTS profiles (
    id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name     TEXT,
    email         TEXT,
    role          TEXT DEFAULT 'Supervisor',
    employee_code TEXT,
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS employee_code TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW();


-- ==============================================================================
-- TABLE: authorized_supervisors  (sign-up whitelist)
-- Live columns confirmed: email, full_name, created_at, employee_code
-- ==============================================================================
CREATE TABLE IF NOT EXISTS authorized_supervisors (
    email         TEXT PRIMARY KEY,
    full_name     TEXT NOT NULL,
    employee_code TEXT,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE authorized_supervisors ADD COLUMN IF NOT EXISTS employee_code TEXT;
ALTER TABLE authorized_supervisors ADD COLUMN IF NOT EXISTS created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW();


-- ==============================================================================
-- TABLE: products
-- Live columns confirmed: id, name, mould_id, item_code, bin_qty, std_pack_size,
--   batch_identifier, part_number, product_code, approved_grades, created_at
-- DRIFT: batch_identifier was missing from supabase_schema.sql but exists in live DB
-- NOTE: part_number, product_code, approved_grades exist in live DB but are NOT
--   in any schema file and NOT used by the application frontend code.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS products (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    mould_id         TEXT REFERENCES moulds(id),
    item_code        TEXT,
    batch_identifier TEXT,
    bin_qty          INTEGER DEFAULT 4000,
    std_pack_size    INTEGER DEFAULT 1000,
    part_number      TEXT,
    product_code     TEXT,
    approved_grades  TEXT,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS batch_identifier TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS bin_qty          INTEGER DEFAULT 4000;
ALTER TABLE products ADD COLUMN IF NOT EXISTS std_pack_size    INTEGER DEFAULT 1000;
ALTER TABLE products ADD COLUMN IF NOT EXISTS part_number      TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_code     TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS approved_grades  TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW();


-- ==============================================================================
-- TABLE: raw_materials
-- Live columns confirmed: id, name, vendor, created_at
-- ==============================================================================
CREATE TABLE IF NOT EXISTS raw_materials (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    vendor     TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS vendor     TEXT;
ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();


-- ==============================================================================
-- TABLE: approved_materials  (junction: product x raw_material)
-- Live columns confirmed: product_id, material_id, created_at
-- ==============================================================================
CREATE TABLE IF NOT EXISTS approved_materials (
    product_id  TEXT REFERENCES products(id)      ON DELETE CASCADE,
    material_id TEXT REFERENCES raw_materials(id) ON DELETE CASCADE,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (product_id, material_id)
);

ALTER TABLE approved_materials ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();


-- ==============================================================================
-- TABLE: operators
-- Live columns confirmed: id, name, employee_id, is_certified
-- ==============================================================================
CREATE TABLE IF NOT EXISTS operators (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    employee_id  TEXT,
    is_certified BOOLEAN DEFAULT TRUE
);


-- ==============================================================================
-- TABLE: batch_records
-- Live columns confirmed: id, machine_id, product_id, product_name, product_code,
--   mould_id, material_id, material_grade, material_batch, operator_id,
--   start_time, end_time, crates, total_output, status, batch_date
-- NOT in live DB: created_at, shift_id, remarks
-- ==============================================================================
CREATE TABLE IF NOT EXISTS batch_records (
    id            TEXT PRIMARY KEY,
    machine_id    TEXT REFERENCES machines(id),
    product_id    TEXT,
    product_name  TEXT,
    product_code  TEXT,
    mould_id      TEXT,
    material_id   TEXT,
    material_grade TEXT,
    material_batch TEXT,
    operator_id   TEXT,
    start_time    TIMESTAMP WITH TIME ZONE,
    end_time      TIMESTAMP WITH TIME ZONE,
    crates        INTEGER DEFAULT 0,
    total_output  INTEGER DEFAULT 0,
    status        TEXT,
    batch_date    DATE
);

ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS machine_id    TEXT;
ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS product_id    TEXT;
ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS product_name  TEXT;
ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS product_code  TEXT;
ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS mould_id      TEXT;
ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS material_id   TEXT;
ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS material_grade TEXT;
ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS material_batch TEXT;
ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS operator_id   TEXT;
ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS start_time    TIMESTAMP WITH TIME ZONE;
ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS end_time      TIMESTAMP WITH TIME ZONE;
ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS crates        INTEGER DEFAULT 0;
ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS total_output  INTEGER DEFAULT 0;
ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS status        TEXT;
ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS batch_date    DATE;


-- ==============================================================================
-- TABLE: breakdown_records
-- Live columns confirmed: id, machine_id, machine_name, start_time, end_time,
--   duration_minutes, reason, remarks, operator_id, supervisor_name, status
-- ==============================================================================
CREATE TABLE IF NOT EXISTS breakdown_records (
    id               TEXT PRIMARY KEY,
    machine_id       TEXT REFERENCES machines(id),
    machine_name     TEXT,
    start_time       TIMESTAMP WITH TIME ZONE,
    end_time         TIMESTAMP WITH TIME ZONE,
    duration_minutes INTEGER,
    reason           TEXT,
    remarks          TEXT,
    operator_id      TEXT,
    supervisor_name  TEXT,
    status           TEXT
);

ALTER TABLE breakdown_records ADD COLUMN IF NOT EXISTS machine_id       TEXT;
ALTER TABLE breakdown_records ADD COLUMN IF NOT EXISTS machine_name     TEXT;
ALTER TABLE breakdown_records ADD COLUMN IF NOT EXISTS start_time       TIMESTAMP WITH TIME ZONE;
ALTER TABLE breakdown_records ADD COLUMN IF NOT EXISTS end_time         TIMESTAMP WITH TIME ZONE;
ALTER TABLE breakdown_records ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;
ALTER TABLE breakdown_records ADD COLUMN IF NOT EXISTS reason           TEXT;
ALTER TABLE breakdown_records ADD COLUMN IF NOT EXISTS remarks          TEXT;
ALTER TABLE breakdown_records ADD COLUMN IF NOT EXISTS operator_id      TEXT;
ALTER TABLE breakdown_records ADD COLUMN IF NOT EXISTS supervisor_name  TEXT;
ALTER TABLE breakdown_records ADD COLUMN IF NOT EXISTS status           TEXT;


-- ==============================================================================
-- TABLE: crates
-- Live columns confirmed: id, batch_id, machine_id, bin_number, start_time,
--   end_time, gross_qty, startup_scrap, qc_sample, net_qty, rejected_qty,
--   rejection_details, operator_id, supervisor_id, inspected_by, inspected_at,
--   mould_id, material_batch, shift_id, status
-- NOT in live DB: created_at, is_archived, qr_code
-- ==============================================================================
CREATE TABLE IF NOT EXISTS crates (
    id                TEXT PRIMARY KEY,
    batch_id          TEXT,
    machine_id        TEXT REFERENCES machines(id),
    bin_number        INTEGER,
    start_time        TIMESTAMP WITH TIME ZONE,
    end_time          TIMESTAMP WITH TIME ZONE,
    gross_qty         INTEGER,
    startup_scrap     INTEGER DEFAULT 0,
    qc_sample         INTEGER DEFAULT 0,
    net_qty           INTEGER,
    rejected_qty      INTEGER DEFAULT 0,
    rejection_details JSONB,
    operator_id       TEXT,
    supervisor_id     TEXT,
    inspected_by      TEXT,
    inspected_at      TIMESTAMP WITH TIME ZONE,
    mould_id          TEXT,
    material_batch    TEXT,
    shift_id          TEXT,
    status            TEXT
);

ALTER TABLE crates ADD COLUMN IF NOT EXISTS rejected_qty      INTEGER DEFAULT 0;
ALTER TABLE crates ADD COLUMN IF NOT EXISTS rejection_details JSONB;
ALTER TABLE crates ADD COLUMN IF NOT EXISTS inspected_by      TEXT;
ALTER TABLE crates ADD COLUMN IF NOT EXISTS inspected_at      TIMESTAMP WITH TIME ZONE;
ALTER TABLE crates ADD COLUMN IF NOT EXISTS mould_id          TEXT;
ALTER TABLE crates ADD COLUMN IF NOT EXISTS material_batch    TEXT;
ALTER TABLE crates ADD COLUMN IF NOT EXISTS shift_id          TEXT;


-- ==============================================================================
-- TABLE: app_settings  (singleton, id = 'global')
-- Live columns confirmed: id, current_shift, pending_handover,
--   last_handover_summary, active_supervisor_name, print_labels,
--   outgoing_supervisor_email
-- DRIFT: active_supervisor_name, print_labels, outgoing_supervisor_email
--   were missing from ALL existing schema files but exist in live DB
-- ==============================================================================
CREATE TABLE IF NOT EXISTS app_settings (
    id                        TEXT PRIMARY KEY,
    current_shift             TEXT,
    pending_handover          BOOLEAN DEFAULT FALSE,
    last_handover_summary     JSONB,
    active_supervisor_name    TEXT,
    print_labels              JSONB,
    outgoing_supervisor_email TEXT
);

-- DRIFT FIX: Add the three undocumented columns
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS active_supervisor_name    TEXT;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS print_labels              JSONB;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS outgoing_supervisor_email TEXT;

-- Ensure the singleton row exists
INSERT INTO app_settings (id, current_shift, pending_handover, last_handover_summary)
VALUES ('global', 'A', false, null)
ON CONFLICT (id) DO NOTHING;


-- ==============================================================================
-- TABLE: shift_settings
-- Live columns confirmed: id, name, start_time, end_time
-- NOT in live DB: created_at
-- ==============================================================================
CREATE TABLE IF NOT EXISTS shift_settings (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    start_time TIME NOT NULL,
    end_time   TIME NOT NULL
);

INSERT INTO shift_settings (id, name, start_time, end_time)
VALUES
    ('A', 'Shift A', '06:00', '14:00'),
    ('B', 'Shift B', '14:00', '22:00'),
    ('C', 'Shift C', '22:00', '06:00')
ON CONFLICT (id) DO NOTHING;


-- ==============================================================================
-- TABLE: shift_summaries
-- Live columns confirmed: id, shift_date, shift_id, supervisor_name,
--   total_output, running_machines, pending_crates, handover_time,
--   remarks, incoming_supervisor_name
-- ==============================================================================
CREATE TABLE IF NOT EXISTS shift_summaries (
    id                       TEXT PRIMARY KEY,
    shift_date               DATE NOT NULL,
    shift_id                 TEXT NOT NULL,
    supervisor_name          TEXT,
    total_output             INTEGER DEFAULT 0,
    running_machines         INTEGER DEFAULT 0,
    pending_crates           INTEGER DEFAULT 0,
    handover_time            TIMESTAMP WITH TIME ZONE,
    remarks                  TEXT,
    incoming_supervisor_name TEXT
);

ALTER TABLE shift_summaries ADD COLUMN IF NOT EXISTS remarks                  TEXT;
ALTER TABLE shift_summaries ADD COLUMN IF NOT EXISTS incoming_supervisor_name TEXT;


-- ==============================================================================
-- TABLE: activity_logs
-- Live columns confirmed: id, timestamp, event_type, machine_id, operator_id,
--   supervisor_name, details, qty
-- ==============================================================================
CREATE TABLE IF NOT EXISTS activity_logs (
    id              TEXT PRIMARY KEY,
    timestamp       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    event_type      TEXT NOT NULL,
    machine_id      TEXT NOT NULL,
    operator_id     TEXT,
    supervisor_name TEXT,
    details         TEXT,
    qty             INTEGER
);


-- ==============================================================================
-- TABLE: defect_types
-- Live columns confirmed: id, name, created_at
-- ==============================================================================
CREATE TABLE IF NOT EXISTS defect_types (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO defect_types (id, name) VALUES
    ('D1', 'Flash / Burrs'),
    ('D2', 'Short Shot'),
    ('D3', 'Burn Marks'),
    ('D4', 'Silver Streaks'),
    ('D5', 'Dimensional Out')
ON CONFLICT (id) DO NOTHING;


-- ==============================================================================
-- TABLE: breakdown_reasons
-- Live columns confirmed: id, name, created_at
-- ==============================================================================
CREATE TABLE IF NOT EXISTS breakdown_reasons (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO breakdown_reasons (id, name) VALUES
    ('B1', 'Nozzle Jam / Blockage'),
    ('B2', 'Heater / Thermocouple Failure'),
    ('B3', 'Mould Damage / Stuck Part'),
    ('B4', 'Material Shortage / Feed Issue'),
    ('B5', 'Power / Electrical Fluctuation'),
    ('B6', 'Hydraulic / Oil Leak'),
    ('B7', 'Robotic / Ejector Failure'),
    ('B8', 'Cooling / Water Temp Issue')
ON CONFLICT (id) DO NOTHING;


-- ==============================================================================
-- TABLE: cleaning_tasks
-- Live columns confirmed: id, label, created_at
-- ==============================================================================
CREATE TABLE IF NOT EXISTS cleaning_tasks (
    id         TEXT PRIMARY KEY,
    label      TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO cleaning_tasks (id, label) VALUES
    ('C1', 'Hopper Cleaned & Inspected'),
    ('C2', 'Barrel & Screw Purged'),
    ('C3', 'Nozzle Obstruction Check'),
    ('C4', 'Mould Platen Surfaces Cleaned'),
    ('C5', 'First Article Inspection (FAI) Done')
ON CONFLICT (id) DO NOTHING;


-- ==============================================================================
-- ROW LEVEL SECURITY
-- All tables use "Allow all for public" consistent with the live database.
-- ==============================================================================

ALTER TABLE moulds                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE machines               ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE authorized_supervisors ENABLE ROW LEVEL SECURITY;
ALTER TABLE products               ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_materials          ENABLE ROW LEVEL SECURITY;
ALTER TABLE approved_materials     ENABLE ROW LEVEL SECURITY;
ALTER TABLE operators              ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_records          ENABLE ROW LEVEL SECURITY;
ALTER TABLE breakdown_records      ENABLE ROW LEVEL SECURITY;
ALTER TABLE crates                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_summaries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE defect_types           ENABLE ROW LEVEL SECURITY;
ALTER TABLE breakdown_reasons      ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaning_tasks         ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl TEXT;
    pol TEXT;
BEGIN
    FOR tbl, pol IN VALUES
        ('moulds',                 'Allow all for moulds'),
        ('machines',               'Allow all for machines'),
        ('profiles',               'Allow all for profiles'),
        ('authorized_supervisors', 'Allow all for authorized_supervisors'),
        ('products',               'Allow all for products'),
        ('raw_materials',          'Allow all for raw_materials'),
        ('approved_materials',     'Allow all for approved_materials'),
        ('operators',              'Allow all for operators'),
        ('batch_records',          'Allow all for batch_records'),
        ('breakdown_records',      'Allow all for breakdown_records'),
        ('crates',                 'Allow all for crates'),
        ('app_settings',           'Allow all for app_settings'),
        ('shift_settings',         'Allow all for shift_settings'),
        ('shift_summaries',        'Allow all for shift_summaries'),
        ('activity_logs',          'Allow all for activity_logs'),
        ('defect_types',           'Allow all for defect_types'),
        ('breakdown_reasons',      'Allow all for breakdown_reasons'),
        ('cleaning_tasks',         'Allow all for cleaning_tasks')
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename  = tbl
              AND policyname = pol
        ) THEN
            EXECUTE format(
                'CREATE POLICY %I ON %I FOR ALL TO public USING (true) WITH CHECK (true)',
                pol, tbl
            );
        END IF;
    END LOOP;
END $$;


-- ==============================================================================
-- TABLES: teams & team_members  (Operator Roster Management)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS teams (
    id            TEXT PRIMARY KEY,
    supervisor_id TEXT NOT NULL,
    name          TEXT NOT NULL,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
    id          TEXT PRIMARY KEY,
    team_id     TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    operator_id TEXT NOT NULL REFERENCES operators(id),
    added_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    removed_at  TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

ALTER TABLE teams        ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Atomic Operator Reassignment Function (Guarantees Single Active Membership Rule)
CREATE OR REPLACE FUNCTION reassign_operator_to_team(p_operator_id TEXT, p_new_team_id TEXT)
RETURNS TEXT AS $$
DECLARE
    v_member_id TEXT;
    v_now TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
    UPDATE team_members
    SET removed_at = v_now
    WHERE operator_id = p_operator_id 
      AND removed_at IS NULL;

    v_member_id := 'TM-' || extract(epoch from v_now)::bigint || '-' || substring(md5(random()::text) from 1 for 6);

    INSERT INTO team_members (id, team_id, operator_id, added_at, removed_at)
    VALUES (v_member_id, p_new_team_id, p_operator_id, v_now, NULL);

    RETURN v_member_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==============================================================================
-- REALTIME PUBLICATIONS
-- ==============================================================================
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN VALUES
        ('machines'), ('moulds'), ('products'), ('raw_materials'),
        ('approved_materials'), ('batch_records'), ('breakdown_records'),
        ('profiles'), ('authorized_supervisors'), ('app_settings'),
        ('shift_settings'), ('activity_logs'), ('defect_types'),
        ('breakdown_reasons'), ('cleaning_tasks'), ('teams'), ('team_members')
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname    = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename  = tbl
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', tbl);
        END IF;
    END LOOP;
END $$;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
