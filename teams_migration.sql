-- Migration: Add teams and team_members tables for operator roster management
-- Preserves roster membership history over time

-- 1. Create teams table
CREATE TABLE IF NOT EXISTS teams (
    id            TEXT PRIMARY KEY,
    supervisor_id TEXT NOT NULL,
    name          TEXT NOT NULL,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create team_members table
CREATE TABLE IF NOT EXISTS team_members (
    id          TEXT PRIMARY KEY,
    team_id     TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    operator_id TEXT NOT NULL REFERENCES operators(id),
    added_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    removed_at  TIMESTAMP WITH TIME ZONE DEFAULT NULL  -- NULL = currently active on this team
);

-- 3. Enable RLS
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies (Allow all for public, consistent with existing tables)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for teams') THEN
        CREATE POLICY "Allow all for teams" ON teams FOR ALL TO public USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for team_members') THEN
        CREATE POLICY "Allow all for team_members" ON team_members FOR ALL TO public USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 5. Add to realtime publication for live updates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'teams'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE teams;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'team_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE team_members;
  END IF;
END $$;

-- 6. Atomic Operator Reassignment Function (Prevents race conditions / orphan states)
CREATE OR REPLACE FUNCTION reassign_operator_to_team(p_operator_id TEXT, p_new_team_id TEXT)
RETURNS TEXT AS $$
DECLARE
    v_member_id TEXT;
    v_now TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
    -- Close out any active team memberships for this operator
    UPDATE team_members
    SET removed_at = v_now
    WHERE operator_id = p_operator_id 
      AND removed_at IS NULL;

    -- Generate unique member ID and insert new active membership
    v_member_id := 'TM-' || extract(epoch from v_now)::bigint || '-' || substring(md5(random()::text) from 1 for 6);

    INSERT INTO team_members (id, team_id, operator_id, added_at, removed_at)
    VALUES (v_member_id, p_new_team_id, p_operator_id, v_now, NULL);

    RETURN v_member_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Force PostgREST schema reload
NOTIFY pgrst, 'reload schema';
