-- ==============================================================================
-- packing_migration.sql
-- Migration script to create packets table, storage bins, and store inwarding
-- ==============================================================================

-- 1. Create packets table if not exists
CREATE TABLE IF NOT EXISTS packets (
    id                    TEXT PRIMARY KEY,
    batch_id              TEXT NOT NULL,
    product_id            TEXT NOT NULL,
    product_name          TEXT,
    product_code          TEXT,
    quantity              INTEGER NOT NULL,
    crate_sources         JSONB NOT NULL DEFAULT '[]'::jsonb,
    packed_by             TEXT,
    packed_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    shift_id              TEXT,
    status                TEXT DEFAULT 'Packed',
    storage_bin_id        TEXT,
    location_status       TEXT DEFAULT 'WIP Storage',
    storage_bin_bound_at  TIMESTAMP WITH TIME ZONE,
    store_received_at     TIMESTAMP WITH TIME ZONE,
    store_received_by     TEXT,
    carton_id             TEXT
);

-- Ensure all storage bin and store inwarding columns exist on packets
ALTER TABLE packets ADD COLUMN IF NOT EXISTS storage_bin_id       TEXT;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS location_status      TEXT DEFAULT 'WIP Storage';
ALTER TABLE packets ADD COLUMN IF NOT EXISTS storage_bin_bound_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS store_received_at    TIMESTAMP WITH TIME ZONE;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS store_received_by    TEXT;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS carton_id            TEXT;

-- 2. Add packed_qty column to crates if not exists
ALTER TABLE crates ADD COLUMN IF NOT EXISTS packed_qty INTEGER DEFAULT 0;

-- 3. Create storage_bins table
CREATE TABLE IF NOT EXISTS storage_bins (
    id                  TEXT PRIMARY KEY, -- e.g. APBIN-01, APBIN-02
    current_location    TEXT DEFAULT 'WIP Warehouse', -- 'WIP Warehouse' | 'In Transit' | 'Main Store' | 'Empty'
    last_transferred_at TIMESTAMP WITH TIME ZONE,
    last_received_at    TIMESTAMP WITH TIME ZONE,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert common initial storage bins if they do not exist
INSERT INTO storage_bins (id, current_location)
VALUES 
    ('APBIN-01', 'WIP Warehouse'),
    ('APBIN-02', 'WIP Warehouse'),
    ('APBIN-03', 'WIP Warehouse'),
    ('APBIN-04', 'WIP Warehouse'),
    ('APBIN-05', 'WIP Warehouse'),
    ('APBIN-06', 'WIP Warehouse'),
    ('APBIN-07', 'WIP Warehouse'),
    ('APBIN-08', 'WIP Warehouse'),
    ('APBIN-09', 'WIP Warehouse'),
    ('APBIN-10', 'WIP Warehouse')
ON CONFLICT (id) DO NOTHING;

-- 4. Enable RLS and public access policies
ALTER TABLE packets ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_bins ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'packets'
          AND policyname = 'Allow all for packets'
    ) THEN
        CREATE POLICY "Allow all for packets" ON packets FOR ALL TO public USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'storage_bins'
          AND policyname = 'Allow all for storage_bins'
    ) THEN
        CREATE POLICY "Allow all for storage_bins" ON storage_bins FOR ALL TO public USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 5. Enable Realtime on packets and storage_bins tables
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname    = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename  = 'packets'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE packets;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname    = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename  = 'storage_bins'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE storage_bins;
    END IF;
END $$;

-- 6. Force schema cache reload
NOTIFY pgrst, 'reload schema';
