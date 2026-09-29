-- ==============================================================================
-- CONSOLIDATED DATABASE UPDATE SCHEMA
-- Run this entire script in your Supabase SQL Editor.
-- Safe & idempotent: checks IF NOT EXISTS on all tables, columns, and policies.
-- ==============================================================================

-- 1. Add standard packaging size to products table (if not exists)
ALTER TABLE products ADD COLUMN IF NOT EXISTS std_pack_size INTEGER DEFAULT 2000;

-- 2. Add packed quantity tracking to crates table (if not exists)
ALTER TABLE crates ADD COLUMN IF NOT EXISTS packed_qty INTEGER DEFAULT 0;

-- 3. Create packets table for Box / Packet packing & traceability
CREATE TABLE IF NOT EXISTS packets (
    id                    TEXT PRIMARY KEY,                         -- Bound Pre-Printed QR Code or Packet ID
    batch_id              TEXT NOT NULL,                            -- Target Batch ID
    product_id            TEXT NOT NULL,                            -- Product ID
    product_name          TEXT,                                     -- Product Name
    product_code          TEXT,                                     -- Product Item Code
    quantity              INTEGER NOT NULL,                         -- Box Pieces Quantity
    crate_sources         JSONB NOT NULL DEFAULT '[]'::jsonb,       -- Traceability: [{crateId, binNumber, qty}]
    packed_by             TEXT,                                     -- Packer Name
    packed_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),   -- Packing Timestamp
    shift_id              TEXT,                                     -- Shift (A/B/C)
    status                TEXT DEFAULT 'Packed',                    -- 'Packed' | 'Despatched'
    storage_bin_id        TEXT,                                     -- Reusable Storage Bin (e.g. APBIN-01)
    location_status       TEXT DEFAULT 'WIP Storage',               -- 'WIP Storage' | 'In Transit' | 'Main Store' | 'Carton Packed'
    storage_bin_bound_at  TIMESTAMP WITH TIME ZONE,                 -- Timestamp when placed in storage bin
    store_received_at     TIMESTAMP WITH TIME ZONE,                 -- Timestamp when received in Main Store
    store_received_by     TEXT,                                     -- Store Receiver Name
    carton_id             TEXT                                      -- Master Carton Box ID (e.g. CTN-20260825-01)
);

-- Ensure all columns exist on packets even if table was previously created
ALTER TABLE packets ADD COLUMN IF NOT EXISTS product_name          TEXT;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS product_code          TEXT;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS crate_sources         JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS storage_bin_id        TEXT;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS location_status       TEXT DEFAULT 'WIP Storage';
ALTER TABLE packets ADD COLUMN IF NOT EXISTS storage_bin_bound_at  TIMESTAMP WITH TIME ZONE;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS store_received_at     TIMESTAMP WITH TIME ZONE;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS store_received_by     TEXT;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS carton_id             TEXT;

-- 4. Create storage_bins table for WIP warehouse asset bins
CREATE TABLE IF NOT EXISTS storage_bins (
    id                  TEXT PRIMARY KEY,                           -- Asset code: APBIN-01, APBIN-02, etc.
    current_location    TEXT DEFAULT 'WIP Warehouse',               -- 'WIP Warehouse' | 'In Transit' | 'Main Store' | 'Empty'
    last_transferred_at TIMESTAMP WITH TIME ZONE,
    last_received_at    TIMESTAMP WITH TIME ZONE,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed initial storage bins (APBIN-01 to APBIN-10)
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

-- 5. Enable Row Level Security (RLS) and public access policies
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

-- 6. Enable Realtime Publications
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

-- 7. Force Supabase PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
