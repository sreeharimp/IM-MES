-- ==============================================================================
-- IM-MES: Admin Password Reset & Force Password Change Migration
-- ==============================================================================
-- Description:
--   1. Enables pgcrypto extension for bcrypt password hashing.
--   2. Adds `must_change_password` boolean column to `profiles`.
--   3. Adds RPC function `admin_reset_user_password` to allow Admins to reset
--      an individual user's password.
--   4. Adds RPC function `admin_bulk_reset_passwords` to allow Admins to set a
--      temporary password for all users (or non-admin users).
--   5. Idempotent: Safe to run repeatedly in Supabase SQL Editor.
-- ==============================================================================

-- 1. Ensure pgcrypto extension is installed
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
EXCEPTION WHEN OTHERS THEN
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
END $$;

-- 2. Add must_change_password column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;

-- 3. Ensure profiles is part of the realtime publication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'profiles'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
    END IF;
END $$;

-- 4. RPC Function: admin_reset_user_password
CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
    target_user_id UUID,
    new_password TEXT,
    require_change BOOLEAN DEFAULT TRUE,
    admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    caller_role TEXT;
    caller_id UUID;
    v_user_email TEXT;
BEGIN
    caller_id := COALESCE(auth.uid(), admin_id);

    -- If caller_id is available, check that caller has Admin role in profiles
    IF caller_id IS NOT NULL THEN
        SELECT role INTO caller_role FROM public.profiles WHERE id = caller_id;
        IF caller_role IS NOT NULL AND caller_role != 'Admin' THEN
            RAISE EXCEPTION 'Access denied. Only Administrators can reset user passwords.';
        END IF;
    END IF;

    -- Validate password length
    IF new_password IS NULL OR length(new_password) < 6 THEN
        RAISE EXCEPTION 'Password must be at least 6 characters long.';
    END IF;

    -- Verify target user exists in auth.users
    SELECT email INTO v_user_email FROM auth.users WHERE id = target_user_id;
    IF v_user_email IS NULL THEN
        RAISE EXCEPTION 'Target user not found in authentication system.';
    END IF;

    -- Update password in auth.users using bcrypt
    UPDATE auth.users
    SET encrypted_password = crypt(new_password, gen_salt('bf', 10)),
        updated_at = NOW()
    WHERE id = target_user_id;

    -- Update must_change_password in public.profiles
    UPDATE public.profiles
    SET must_change_password = require_change,
        updated_at = NOW()
    WHERE id = target_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', target_user_id,
        'email', v_user_email,
        'must_change_password', require_change
    );
END;
$$;

-- 5. RPC Function: admin_bulk_reset_passwords
CREATE OR REPLACE FUNCTION public.admin_bulk_reset_passwords(
    new_password TEXT,
    exclude_admins BOOLEAN DEFAULT TRUE,
    require_change BOOLEAN DEFAULT TRUE,
    admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    caller_role TEXT;
    caller_id UUID;
    affected_count INT := 0;
BEGIN
    caller_id := COALESCE(auth.uid(), admin_id);

    -- Check caller is Admin if caller_id is available
    IF caller_id IS NOT NULL THEN
        SELECT role INTO caller_role FROM public.profiles WHERE id = caller_id;
        IF caller_role IS NOT NULL AND caller_role != 'Admin' THEN
            RAISE EXCEPTION 'Access denied. Only Administrators can reset user passwords.';
        END IF;
    END IF;

    IF new_password IS NULL OR length(new_password) < 6 THEN
        RAISE EXCEPTION 'Password must be at least 6 characters long.';
    END IF;

    IF exclude_admins THEN
        -- Update all non-admin users
        UPDATE auth.users
        SET encrypted_password = crypt(new_password, gen_salt('bf', 10)),
            updated_at = NOW()
        WHERE id IN (
            SELECT id FROM public.profiles 
            WHERE role != 'Admin' AND (caller_id IS NULL OR id != caller_id)
        );

        UPDATE public.profiles
        SET must_change_password = require_change,
            updated_at = NOW()
        WHERE role != 'Admin' AND (caller_id IS NULL OR id != caller_id);

        GET DIAGNOSTICS affected_count = ROW_COUNT;
    ELSE
        -- Update all users except caller
        UPDATE auth.users
        SET encrypted_password = crypt(new_password, gen_salt('bf', 10)),
            updated_at = NOW()
        WHERE id IN (
            SELECT id FROM public.profiles 
            WHERE (caller_id IS NULL OR id != caller_id)
        );

        UPDATE public.profiles
        SET must_change_password = require_change,
            updated_at = NOW()
        WHERE (caller_id IS NULL OR id != caller_id);

        GET DIAGNOSTICS affected_count = ROW_COUNT;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'count', affected_count,
        'must_change_password', require_change
    );
END;
$$;

-- 6. Permissions
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(UUID, TEXT, BOOLEAN, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(UUID, TEXT, BOOLEAN, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(UUID, TEXT, BOOLEAN, UUID) TO anon;

GRANT EXECUTE ON FUNCTION public.admin_bulk_reset_passwords(TEXT, BOOLEAN, BOOLEAN, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bulk_reset_passwords(TEXT, BOOLEAN, BOOLEAN, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_bulk_reset_passwords(TEXT, BOOLEAN, BOOLEAN, UUID) TO anon;

NOTIFY pgrst, 'reload schema';
