-- IM-MES: Final Inspection Module Migration
-- Copy and run this script in the Supabase SQL Editor if remote table & RPC are needed.
-- (The application also provides full client-side execution with fallback.)

-- 1. Create final_inspections table
CREATE TABLE IF NOT EXISTS public.final_inspections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      TEXT NOT NULL,
    packet_id       TEXT NOT NULL,
    plan_id         UUID REFERENCES public.production_plans(id) ON DELETE SET NULL,
    product_id      TEXT,
    product_name    TEXT,
    batch_code      TEXT,
    quantity        INTEGER NOT NULL DEFAULT 0,
    inspector_id    TEXT NOT NULL,
    inspector_name  TEXT NOT NULL,
    inspector_role  TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'PASSED' CHECK (status IN ('PASSED', 'REJECTED', 'HELD')),
    defect_notes    TEXT,
    device_info     TEXT,
    inspected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure columns exist
ALTER TABLE public.final_inspections
    ADD COLUMN IF NOT EXISTS session_id      TEXT,
    ADD COLUMN IF NOT EXISTS packet_id       TEXT,
    ADD COLUMN IF NOT EXISTS plan_id         UUID,
    ADD COLUMN IF NOT EXISTS product_id      TEXT,
    ADD COLUMN IF NOT EXISTS product_name    TEXT,
    ADD COLUMN IF NOT EXISTS batch_code      TEXT,
    ADD COLUMN IF NOT EXISTS quantity        INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS inspector_id    TEXT,
    ADD COLUMN IF NOT EXISTS inspector_name  TEXT,
    ADD COLUMN IF NOT EXISTS inspector_role  TEXT,
    ADD COLUMN IF NOT EXISTS status          TEXT DEFAULT 'PASSED',
    ADD COLUMN IF NOT EXISTS defect_notes    TEXT,
    ADD COLUMN IF NOT EXISTS device_info     TEXT,
    ADD COLUMN IF NOT EXISTS inspected_at    TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS created_at      TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_final_inspections_packet_id ON public.final_inspections(packet_id);
CREATE INDEX IF NOT EXISTS idx_final_inspections_session ON public.final_inspections(session_id);
CREATE INDEX IF NOT EXISTS idx_final_inspections_inspected_at ON public.final_inspections(inspected_at DESC);

-- Enable Row Level Security
ALTER TABLE public.final_inspections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read on final_inspections" ON public.final_inspections;
CREATE POLICY "Allow read on final_inspections" ON public.final_inspections FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow insert on final_inspections" ON public.final_inspections;
CREATE POLICY "Allow insert on final_inspections" ON public.final_inspections FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update on final_inspections" ON public.final_inspections;
CREATE POLICY "Allow update on final_inspections" ON public.final_inspections FOR UPDATE USING (true) WITH CHECK (true);

-- 2. Stored Procedure: submit_final_inspection
CREATE OR REPLACE FUNCTION public.submit_final_inspection(
    p_session_id TEXT,
    p_packets JSONB,
    p_inspector_id TEXT,
    p_inspector_name TEXT,
    p_inspector_role TEXT,
    p_status TEXT DEFAULT 'PASSED',
    p_notes TEXT DEFAULT NULL,
    p_device_info TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_item JSONB;
    v_packet_id TEXT;
    v_qty INTEGER;
    v_prod_id TEXT;
    v_prod_name TEXT;
    v_batch TEXT;
    v_plan_id UUID;
    v_label_status TEXT;
    v_errors JSONB := '[]'::JSONB;
    v_inserted_count INTEGER := 0;
    v_total_qty INTEGER := 0;
    v_existing_check RECORD;
BEGIN
    -- Security Validation
    IF p_inspector_role NOT IN ('QC', 'Admin', 'PowerUser', 'Supervisor') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unauthorized: Role "' || COALESCE(p_inspector_role, 'Unknown') || '" is not authorized for Final Inspection.'
        );
    END IF;

    IF p_packets IS NULL OR jsonb_array_length(p_packets) = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No packets provided in submission.'
        );
    END IF;

    -- Validation Phase
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_packets)
    LOOP
        v_packet_id := TRIM(v_item->>'packet_id');
        v_qty := COALESCE((v_item->>'quantity')::INTEGER, 0);

        IF v_packet_id IS NULL OR v_packet_id = '' THEN
            v_errors := v_errors || jsonb_build_object('packet_id', 'UNKNOWN', 'reason', 'Invalid packet identifier');
            CONTINUE;
        END IF;

        -- Check already inspected
        SELECT id, inspector_name, inspected_at INTO v_existing_check
        FROM public.final_inspections
        WHERE packet_id = v_packet_id AND status = 'PASSED'
        LIMIT 1;

        IF v_existing_check.id IS NOT NULL THEN
            v_errors := v_errors || jsonb_build_object(
                'packet_id', v_packet_id,
                'reason', 'Already finally inspected by ' || v_existing_check.inspector_name || ' on ' || TO_CHAR(v_existing_check.inspected_at, 'YYYY-MM-DD HH24:MI')
            );
            CONTINUE;
        END IF;

        -- Check if void
        SELECT status INTO v_label_status
        FROM public.production_plan_labels
        WHERE qr_payload = v_packet_id
        LIMIT 1;

        IF v_label_status = 'void' THEN
            v_errors := v_errors || jsonb_build_object('packet_id', v_packet_id, 'reason', 'Packet label is void');
            CONTINUE;
        END IF;
    END LOOP;

    IF jsonb_array_length(v_errors) > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'One or more packets failed validation',
            'errors', v_errors
        );
    END IF;

    -- Insertion & Status Update Phase
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_packets)
    LOOP
        v_packet_id := TRIM(v_item->>'packet_id');
        v_qty := COALESCE((v_item->>'quantity')::INTEGER, 0);
        v_prod_id := v_item->>'product_id';
        v_prod_name := v_item->>'product_name';
        v_batch := v_item->>'batch_code';

        IF v_qty <= 0 OR v_prod_name IS NULL THEN
            SELECT 
                l.plan_id, l.expected_quantity, p.product_id, p.batch_code, prod.name
            INTO
                v_plan_id, v_qty, v_prod_id, v_batch, v_prod_name
            FROM public.production_plan_labels l
            LEFT JOIN public.production_plans p ON p.id = l.plan_id
            LEFT JOIN public.products prod ON prod.id = p.product_id
            WHERE l.qr_payload = v_packet_id
            LIMIT 1;
        END IF;

        IF v_prod_name IS NULL THEN
            SELECT pkt.quantity, pkt.product_id, pkt.product_name, pkt.batch_id
            INTO v_qty, v_prod_id, v_prod_name, v_batch
            FROM public.packets pkt
            WHERE pkt.id = v_packet_id
            LIMIT 1;
        END IF;

        INSERT INTO public.final_inspections (
            session_id, packet_id, plan_id, product_id, product_name, batch_code,
            quantity, inspector_id, inspector_name, inspector_role, status,
            defect_notes, device_info, inspected_at
        ) VALUES (
            p_session_id, v_packet_id, v_plan_id, v_prod_id, v_prod_name, v_batch,
            COALESCE(v_qty, 0), p_inspector_id, p_inspector_name, p_inspector_role,
            p_status, p_notes, p_device_info, NOW()
        );

        UPDATE public.production_plan_labels
        SET status = 'inspected', scanned_at = NOW(), scanned_by = p_inspector_name
        WHERE qr_payload = v_packet_id;

        UPDATE public.packets
        SET status = 'Final Inspected'
        WHERE id = v_packet_id;

        v_inserted_count := v_inserted_count + 1;
        v_total_qty := v_total_qty + COALESCE(v_qty, 0);
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'count', v_inserted_count,
        'total_quantity', v_total_qty,
        'session_id', p_session_id,
        'inspector', p_inspector_name,
        'timestamp', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
