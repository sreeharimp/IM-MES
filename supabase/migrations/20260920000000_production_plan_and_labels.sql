-- ==============================================================================
-- Migration: 20260920000000_production_plan_and_labels.sql
-- Description: Reconciles Production Plans, Labels, Paper Stock Types, Print Jobs,
--              and Audit Trails to match the live Supabase schema perfectly.
-- Idempotent: Safe to run repeatedly in Supabase SQL Editor without column conflicts.
-- ==============================================================================

-- ── 0. Audit Log Table (system_changes) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_changes (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    changed_by_id    TEXT,
    changed_by_name  TEXT        NOT NULL,
    changed_by_role  TEXT,
    changed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    module           TEXT        NOT NULL,
    table_name       TEXT,
    record_id        TEXT,
    field_changed    TEXT,
    old_value        TEXT,
    new_value        TEXT,
    action           TEXT        NOT NULL,
    reason           TEXT,
    change_request   TEXT
);

CREATE INDEX IF NOT EXISTS idx_system_changes_changed_at 
    ON system_changes (changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_changes_module_changed_at 
    ON system_changes (module, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_changes_table_record 
    ON system_changes (table_name, record_id);

ALTER TABLE system_changes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read on system_changes" ON system_changes;
CREATE POLICY "Allow read on system_changes" ON system_changes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow insert on system_changes" ON system_changes;
CREATE POLICY "Allow insert on system_changes" ON system_changes FOR INSERT WITH CHECK (true);

-- ── 1. Ensure products table packing columns ──────────────────────────────────
ALTER TABLE products 
    ADD COLUMN IF NOT EXISTS standard_packing_qty INTEGER DEFAULT 1000;

UPDATE products 
SET standard_packing_qty = COALESCE(std_pack_size, 1000)
WHERE standard_packing_qty IS NULL;

-- ── 2. label_paper_types ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS label_paper_types (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    rows            INTEGER NOT NULL CHECK (rows > 0),
    columns         INTEGER NOT NULL CHECK (columns > 0),
    page_width_mm   NUMERIC(6, 2) NOT NULL CHECK (page_width_mm > 0),
    page_height_mm  NUMERIC(6, 2) NOT NULL CHECK (page_height_mm > 0),
    label_width_mm  NUMERIC(6, 2) NOT NULL CHECK (label_width_mm > 0),
    label_height_mm NUMERIC(6, 2) NOT NULL CHECK (label_height_mm > 0),
    margin_top_mm   NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (margin_top_mm >= 0),
    margin_left_mm  NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (margin_left_mm >= 0),
    gutter_x_mm     NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (gutter_x_mm >= 0),
    gutter_y_mm     NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (gutter_y_mm >= 0),
    fill_order      TEXT NOT NULL DEFAULT 'row-major' CHECK (fill_order IN ('row-major', 'column-major')),
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default Avery paper formats if empty
INSERT INTO label_paper_types (name, rows, columns, page_width_mm, page_height_mm, label_width_mm, label_height_mm, margin_top_mm, margin_left_mm, gutter_x_mm, gutter_y_mm, fill_order)
SELECT 'Avery 24-Up (70 x 37mm)', 8, 3, 210, 297, 70, 37, 0.5, 0, 0, 0, 'row-major'
WHERE NOT EXISTS (SELECT 1 FROM label_paper_types WHERE name = 'Avery 24-Up (70 x 37mm)');

INSERT INTO label_paper_types (name, rows, columns, page_width_mm, page_height_mm, label_width_mm, label_height_mm, margin_top_mm, margin_left_mm, gutter_x_mm, gutter_y_mm, fill_order)
SELECT 'Avery 18-Up (63.5 x 46.6mm)', 6, 3, 210, 297, 63.5, 46.6, 8.7, 7.2, 2.5, 0, 'row-major'
WHERE NOT EXISTS (SELECT 1 FROM label_paper_types WHERE name = 'Avery 18-Up (63.5 x 46.6mm)');

INSERT INTO label_paper_types (name, rows, columns, page_width_mm, page_height_mm, label_width_mm, label_height_mm, margin_top_mm, margin_left_mm, gutter_x_mm, gutter_y_mm, fill_order)
SELECT 'Avery 21-Up (63.5 x 38.1mm)', 7, 3, 210, 297, 63.5, 38.1, 15.15, 7.25, 2.5, 0, 'row-major'
WHERE NOT EXISTS (SELECT 1 FROM label_paper_types WHERE name = 'Avery 21-Up (63.5 x 38.1mm)');

ALTER TABLE label_paper_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read on label_paper_types" ON label_paper_types;
CREATE POLICY "Allow read on label_paper_types" ON label_paper_types FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow modify on label_paper_types" ON label_paper_types;
CREATE POLICY "Allow modify on label_paper_types" ON label_paper_types FOR ALL USING (true) WITH CHECK (true);

-- ── 3. product_label_types (Product <-> Paper Type mappings) ───────────────────
CREATE TABLE IF NOT EXISTS product_label_types (
    product_id          TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    label_paper_type_id UUID NOT NULL REFERENCES label_paper_types(id) ON DELETE CASCADE,
    is_default          BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (product_id, label_paper_type_id)
);

ALTER TABLE product_label_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read on product_label_types" ON product_label_types;
CREATE POLICY "Allow read on product_label_types" ON product_label_types FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow modify on product_label_types" ON product_label_types;
CREATE POLICY "Allow modify on product_label_types" ON product_label_types FOR ALL USING (true) WITH CHECK (true);

-- ── 4. label_print_jobs (Queue Execution & Reprint Log) ─────────────────────────
CREATE TABLE IF NOT EXISTS label_print_jobs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label_paper_type_id UUID REFERENCES label_paper_types(id) ON DELETE SET NULL,
    sheet_count         INTEGER NOT NULL DEFAULT 1,
    job_type            TEXT NOT NULL DEFAULT 'initial',
    total_labels        INTEGER NOT NULL DEFAULT 0,
    is_reprint          BOOLEAN NOT NULL DEFAULT false,
    reprint_reason      TEXT,
    reviewed_by         TEXT,
    printed_by          TEXT NOT NULL,
    printed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_print_jobs_paper ON label_print_jobs(label_paper_type_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_printed_at ON label_print_jobs(printed_at DESC);

ALTER TABLE label_print_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read on label_print_jobs" ON label_print_jobs;
CREATE POLICY "Allow read on label_print_jobs" ON label_print_jobs FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow modify on label_print_jobs" ON label_print_jobs;
CREATE POLICY "Allow modify on label_print_jobs" ON label_print_jobs FOR ALL USING (true) WITH CHECK (true);

-- ── 5. production_plans (Reconciled with live columns) ──────────────────────────
CREATE TABLE IF NOT EXISTS production_plans (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_date          DATE NOT NULL DEFAULT CURRENT_DATE,
    product_id         TEXT NOT NULL REFERENCES products(id),
    batch_code         TEXT NOT NULL,
    planned_quantity   INTEGER NOT NULL DEFAULT 0,
    crates_planned     INTEGER NOT NULL DEFAULT 1,
    remainder_quantity INTEGER NOT NULL DEFAULT 0,
    machine_id         TEXT,
    shift              TEXT DEFAULT 'A',
    status             TEXT NOT NULL DEFAULT 'confirmed',
    notes              TEXT,
    created_by         TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure all reconciled columns exist on production_plans if table existed previously
ALTER TABLE production_plans
    ADD COLUMN IF NOT EXISTS plan_date DATE NOT NULL DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS batch_code TEXT,
    ADD COLUMN IF NOT EXISTS planned_quantity INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS crates_planned INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS remainder_quantity INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS machine_id TEXT,
    ADD COLUMN IF NOT EXISTS shift TEXT DEFAULT 'A',
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed',
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS created_by TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_production_plans_plan_date ON production_plans(plan_date);
CREATE INDEX IF NOT EXISTS idx_production_plans_product ON production_plans(product_id);
CREATE INDEX IF NOT EXISTS idx_production_plans_status ON production_plans(status);
CREATE INDEX IF NOT EXISTS idx_production_plans_batch ON production_plans(batch_code);

ALTER TABLE production_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read on production_plans" ON production_plans;
CREATE POLICY "Allow read on production_plans" ON production_plans FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow modify on production_plans" ON production_plans;
CREATE POLICY "Allow modify on production_plans" ON production_plans FOR ALL USING (true) WITH CHECK (true);

-- ── 6. production_plan_labels (Sequential Case Labels) ───────────────────────────
CREATE TABLE IF NOT EXISTS production_plan_labels (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id           UUID NOT NULL REFERENCES production_plans(id) ON DELETE CASCADE,
    sequence_number   INTEGER NOT NULL,
    expected_quantity INTEGER NOT NULL,
    is_partial        BOOLEAN NOT NULL DEFAULT false,
    qr_payload        TEXT NOT NULL,
    print_job_id      UUID REFERENCES label_print_jobs(id) ON DELETE SET NULL,
    status            TEXT NOT NULL DEFAULT 'unprinted',
    void_reason       TEXT,
    scanned_at        TIMESTAMPTZ,
    scanned_by        TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure all reconciled columns exist on production_plan_labels if table existed previously
ALTER TABLE production_plan_labels
    ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES production_plans(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sequence_number INTEGER,
    ADD COLUMN IF NOT EXISTS expected_quantity INTEGER,
    ADD COLUMN IF NOT EXISTS is_partial BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS qr_payload TEXT,
    ADD COLUMN IF NOT EXISTS print_job_id UUID REFERENCES label_print_jobs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'unprinted',
    ADD COLUMN IF NOT EXISTS void_reason TEXT,
    ADD COLUMN IF NOT EXISTS scanned_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS scanned_by TEXT;

CREATE INDEX IF NOT EXISTS idx_plan_labels_plan_id ON production_plan_labels(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_labels_qr ON production_plan_labels(qr_payload);
CREATE INDEX IF NOT EXISTS idx_plan_labels_status ON production_plan_labels(status);
CREATE INDEX IF NOT EXISTS idx_plan_labels_print_job ON production_plan_labels(print_job_id);

ALTER TABLE production_plan_labels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read on production_plan_labels" ON production_plan_labels;
CREATE POLICY "Allow read on production_plan_labels" ON production_plan_labels FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow modify on production_plan_labels" ON production_plan_labels;
CREATE POLICY "Allow modify on production_plan_labels" ON production_plan_labels FOR ALL USING (true) WITH CHECK (true);

-- ── 7. Stored Procedure: execute_queue_print_job ───────────────────────────────
CREATE OR REPLACE FUNCTION execute_queue_print_job(
    p_label_paper_type_id UUID,
    p_label_ids UUID[],
    p_printed_by TEXT,
    p_is_reprint BOOLEAN DEFAULT false,
    p_reprint_reason TEXT DEFAULT NULL,
    p_supervisor_pin TEXT DEFAULT NULL,
    p_reviewed_by TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_print_job_id UUID;
    v_paper RECORD;
    v_label_count INTEGER;
    v_sheet_capacity INTEGER;
    v_sheet_count INTEGER;
BEGIN
    v_label_count := array_length(p_label_ids, 1);
    IF v_label_count IS NULL OR v_label_count = 0 THEN
        RAISE EXCEPTION 'No label IDs provided for print job.';
    END IF;

    SELECT * INTO v_paper FROM label_paper_types WHERE id = p_label_paper_type_id;
    IF FOUND THEN
        v_sheet_capacity := v_paper.rows * v_paper.columns;
        v_sheet_count := ceil(v_label_count::NUMERIC / v_sheet_capacity::NUMERIC)::INTEGER;
    ELSE
        v_sheet_count := 1;
    END IF;

    v_print_job_id := gen_random_uuid();

    -- Record the print job
    INSERT INTO label_print_jobs (
        id,
        label_paper_type_id,
        sheet_count,
        job_type,
        total_labels,
        is_reprint,
        reprint_reason,
        reviewed_by,
        printed_by,
        printed_at
    ) VALUES (
        v_print_job_id,
        p_label_paper_type_id,
        COALESCE(v_sheet_count, 1),
        CASE WHEN p_is_reprint THEN 'reprint' ELSE 'initial' END,
        v_label_count,
        p_is_reprint,
        p_reprint_reason,
        p_reviewed_by,
        COALESCE(p_printed_by, 'Operator'),
        NOW()
    );

    -- Update label status
    UPDATE production_plan_labels
    SET 
        status = 'printed',
        print_job_id = v_print_job_id
    WHERE id = ANY(p_label_ids);

    -- Audit trail log
    INSERT INTO system_changes (
        changed_by_name,
        module,
        table_name,
        record_id,
        action,
        reason,
        new_value
    ) VALUES (
        COALESCE(p_printed_by, 'Operator'),
        'Production Planner',
        'production_plan_labels',
        v_print_job_id::TEXT,
        CASE WHEN p_is_reprint THEN 'REPRINT' ELSE 'PRINT_JOB' END,
        COALESCE(p_reprint_reason, 'Printed ' || v_label_count || ' case labels'),
        jsonb_build_object(
            'print_job_id', v_print_job_id,
            'label_count', v_label_count,
            'paper_id', p_label_paper_type_id,
            'is_reprint', p_is_reprint
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'print_job_id', v_print_job_id,
        'label_count', v_label_count,
        'sheets', v_sheet_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 8. Enable Realtime Publications (Safe / Idempotent) ─────────────────────────
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE production_plans;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE production_plan_labels;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE label_print_jobs;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE product_label_types;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;

NOTIFY pgrst, 'reload schema';
