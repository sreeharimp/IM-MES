-- MIGRATION SCRIPT: Force-align Schema for Traceability
-- This script ensures all tables AND columns exist.

-- 1. Create Tables (if missing)
CREATE TABLE IF NOT EXISTS moulds (id TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS raw_materials (id TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS approved_materials (
    product_id TEXT,
    material_id TEXT,
    PRIMARY KEY (product_id, material_id)
);
CREATE TABLE IF NOT EXISTS machines (id TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS operators (id TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS batch_records (id TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS breakdown_records (id TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS crates (id TEXT PRIMARY KEY);

-- 2. Ensure Moulds Columns
ALTER TABLE moulds ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE moulds ADD COLUMN IF NOT EXISTS cavities INTEGER DEFAULT 4;
ALTER TABLE moulds ADD COLUMN IF NOT EXISTS cycle_time INTEGER DEFAULT 20;
ALTER TABLE moulds ADD COLUMN IF NOT EXISTS standard_bin_qty INTEGER DEFAULT 4000;
ALTER TABLE moulds ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 3. Ensure Products Columns
ALTER TABLE products ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS mould_id TEXT REFERENCES moulds(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS item_code TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS bin_qty INTEGER DEFAULT 4000;
ALTER TABLE products ADD COLUMN IF NOT EXISTS std_pack_size INTEGER DEFAULT 1000;
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 4. Ensure Raw Materials Columns
ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS vendor TEXT;
ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 5. Ensure Approved Materials Columns
ALTER TABLE approved_materials ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE machines ADD COLUMN IF NOT EXISTS current_mould_id TEXT REFERENCES moulds(id);
ALTER TABLE machines ADD COLUMN IF NOT EXISTS active_product_id TEXT REFERENCES products(id);
ALTER TABLE machines ADD COLUMN IF NOT EXISTS current_material_id TEXT REFERENCES raw_materials(id);
ALTER TABLE machines ADD COLUMN IF NOT EXISTS material_grade TEXT;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS material_batch TEXT;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS active_batch_date TEXT;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS bin_target INTEGER;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Idle';
ALTER TABLE machines ADD COLUMN IF NOT EXISTS current_bin_number INTEGER DEFAULT 1;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS current_shift_production INTEGER DEFAULT 0;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS current_day_production INTEGER DEFAULT 0;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS cycle_time INTEGER;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS cavities INTEGER;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS bin_start_time BIGINT;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS active_batch_id TEXT;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS breakdown_start_time BIGINT;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS oee NUMERIC DEFAULT 0;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS availability NUMERIC DEFAULT 0;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS quality NUMERIC DEFAULT 0;

-- 5.1 Ensure Profiles Table
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT,
    role TEXT DEFAULT 'Supervisor',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS authorized_supervisors (
    email TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS machine_id TEXT;
ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS product_id TEXT;
ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS product_code TEXT;
ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS mould_id TEXT;
ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS material_id TEXT;
ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS material_grade TEXT;
ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS material_batch TEXT;
ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS operator_id TEXT;
ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS start_time TIMESTAMP WITH TIME ZONE;
ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS end_time TIMESTAMP WITH TIME ZONE;
ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS crates INTEGER DEFAULT 0;
ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS total_output INTEGER DEFAULT 0;
ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE batch_records ADD COLUMN IF NOT EXISTS batch_date DATE;

ALTER TABLE breakdown_records ADD COLUMN IF NOT EXISTS machine_id TEXT;
ALTER TABLE breakdown_records ADD COLUMN IF NOT EXISTS machine_name TEXT;
ALTER TABLE breakdown_records ADD COLUMN IF NOT EXISTS start_time TIMESTAMP WITH TIME ZONE;
ALTER TABLE breakdown_records ADD COLUMN IF NOT EXISTS end_time TIMESTAMP WITH TIME ZONE;
ALTER TABLE breakdown_records ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;
ALTER TABLE breakdown_records ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE breakdown_records ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE breakdown_records ADD COLUMN IF NOT EXISTS operator_id TEXT;
ALTER TABLE breakdown_records ADD COLUMN IF NOT EXISTS supervisor_name TEXT;
ALTER TABLE breakdown_records ADD COLUMN IF NOT EXISTS status TEXT;

-- 7. Enable RLS
ALTER TABLE moulds ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE approved_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE breakdown_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE crates ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 8. Policies (Idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for moulds') THEN
        CREATE POLICY "Allow all for moulds" ON moulds FOR ALL TO public USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for products') THEN
        CREATE POLICY "Allow all for products" ON products FOR ALL TO public USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for raw_materials') THEN
        CREATE POLICY "Allow all for raw_materials" ON raw_materials FOR ALL TO public USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for approved_materials') THEN
        CREATE POLICY "Allow all for approved_materials" ON approved_materials FOR ALL TO public USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for machines') THEN
        CREATE POLICY "Allow all for machines" ON machines FOR ALL TO public USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for batch_records') THEN
        CREATE POLICY "Allow all for batch_records" ON batch_records FOR ALL TO public USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for breakdown_records') THEN
        CREATE POLICY "Allow all for breakdown_records" ON breakdown_records FOR ALL TO public USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for operators') THEN
        CREATE POLICY "Allow all for operators" ON operators FOR ALL TO public USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for crates') THEN
        CREATE POLICY "Allow all for crates" ON crates FOR ALL TO public USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for profiles') THEN
        CREATE POLICY "Allow all for profiles" ON profiles FOR ALL TO public USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 9. Force Schema Cache Reload (Optional but recommended)
NOTIFY pgrst, 'reload schema';
