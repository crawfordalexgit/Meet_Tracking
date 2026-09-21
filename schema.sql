-- Drop existing tables if they exist (Be careful in production!)
-- DROP TABLE IF EXISTS results, meets, swimmers, coach_squads, profiles, squads;

-- 1. Squads Table
CREATE TABLE public.squads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    is_squad BOOLEAN DEFAULT false,
    target_meets INTEGER DEFAULT 0
);
ALTER TABLE public.squads ENABLE ROW LEVEL SECURITY;
-- Squads are readable by all authenticated users
CREATE POLICY "Admins and Headcoaches can view all squads." 
ON public.squads FOR SELECT 
TO authenticated 
USING ( (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'headcoach') );

CREATE POLICY "Coaches can view assigned squads." 
ON public.squads FOR SELECT 
TO authenticated 
USING ( 
    EXISTS (
        SELECT 1 FROM public.coach_squads cs 
        WHERE cs.coach_id = auth.uid() AND cs.squad_id = squads.id
    )
);

-- 2. Profiles Table (extends auth.users)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'headcoach', 'coach')) DEFAULT 'coach'
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
-- Profiles are viewable by all authenticated users (or restrict to self + admins)
CREATE POLICY "Profiles are viewable by authenticated users." 
ON public.profiles FOR SELECT 
TO authenticated 
USING (true);
CREATE POLICY "Admins can update profiles." 
ON public.profiles FOR UPDATE 
TO authenticated 
USING ( (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' );

-- Automatically create a profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (new.id, new.email, 'coach');
  RETURN new;
END;
$$;
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 3. Coach_Squads Junction Table
CREATE TABLE public.coach_squads (
    coach_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    squad_id UUID REFERENCES public.squads(id) ON DELETE CASCADE,
    PRIMARY KEY (coach_id, squad_id)
);
ALTER TABLE public.coach_squads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coach_squads viewable by all." 
ON public.coach_squads FOR SELECT 
TO authenticated 
USING (true);

-- 4. Swimmers Table
CREATE TABLE public.swimmers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id TEXT UNIQUE NOT NULL,
    scm_numeric_id INTEGER,
    full_name TEXT NOT NULL,
    squad_id UUID REFERENCES public.squads(id) ON DELETE SET NULL,
    squad_join_date DATE DEFAULT '2025-09-01', -- Default to start of season
    year_of_birth INTEGER, -- Year only for GDPR compliance
    gender TEXT, -- 'M' or 'F' from SCM competitionGender
    is_exempt BOOLEAN DEFAULT false,
    last_synced_scm TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.swimmers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and Headcoaches can view all swimmers." 
ON public.swimmers FOR SELECT 
TO authenticated 
USING ( (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'headcoach') );
CREATE POLICY "Coaches can view assigned swimmers." 
ON public.swimmers FOR SELECT 
TO authenticated 
USING ( 
    EXISTS (
        SELECT 1 FROM public.coach_squads cs 
        WHERE cs.coach_id = auth.uid() AND cs.squad_id = swimmers.squad_id
    )
);

-- 5. Meets Table
CREATE TABLE public.meets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meet_code TEXT UNIQUE NOT NULL,
    license TEXT,
    name TEXT NOT NULL,
    date DATE NOT NULL,
    year INTEGER NOT NULL,
    type TEXT DEFAULT 'open', -- 'open' or 'team'
    course TEXT CHECK (course IN ('SC', 'LC')),
    level TEXT -- 'L1', 'L2', 'L3', 'L4' etc.
);
ALTER TABLE public.meets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Meets are viewable by everyone." 
ON public.meets FOR SELECT 
TO authenticated 
USING (true);

-- 6. Results Table
CREATE TABLE public.results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    swimmer_id UUID REFERENCES public.swimmers(id) ON DELETE CASCADE,
    meet_id UUID REFERENCES public.meets(id) ON DELETE CASCADE,
    event TEXT NOT NULL,
    time TEXT NOT NULL,
    round TEXT,
    wa_pts INTEGER,
    course TEXT CHECK (course IN ('SC', 'LC')),
    is_pb BOOLEAN DEFAULT false
);
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and Headcoaches can view all results." 
ON public.results FOR SELECT 
TO authenticated 
USING ( (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'headcoach') );
CREATE POLICY "Coaches can view results of assigned swimmers." 
ON public.results FOR SELECT 
TO authenticated 
USING ( 
    EXISTS (
        SELECT 1 FROM public.swimmers s
        JOIN public.coach_squads cs ON s.squad_id = cs.squad_id
        WHERE s.id = results.swimmer_id AND cs.coach_id = auth.uid()
    )
);

-- 7. Swimmer Personal Bests (Official from Swim England)
CREATE TABLE public.swimmer_pbs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    swimmer_id UUID REFERENCES public.swimmers(id) ON DELETE CASCADE,
    event TEXT NOT NULL,
    course TEXT NOT NULL, -- 'S' or 'L'
    time TEXT NOT NULL,
    time_seconds FLOAT,
    date DATE,
    gala TEXT,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    splits JSONB,
    level TEXT,
    UNIQUE(swimmer_id, event, course)
);
ALTER TABLE public.swimmer_pbs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "PBs are viewable by all authenticated." 
ON public.swimmer_pbs FOR SELECT 
TO authenticated 
USING (true);

-- 7b. Relay Lineups (Kent Relays team picker — saved team selections)
CREATE TABLE IF NOT EXISTS public.relay_lineups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meet_code TEXT NOT NULL,            -- e.g. 'KT26'
    event_key TEXT NOT NULL,            -- '13U-F-MEDLEY'
    team_letter TEXT NOT NULL,          -- 'A' | 'B' | 'C' ...
    legs JSONB NOT NULL,                -- [{ stroke, swimmer_id, time_seconds }] ordered by leg
    entry_time_seconds FLOAT,
    is_locked BOOLEAN DEFAULT false,    -- locked teams are never touched by "auto-optimise all"
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(meet_code, event_key, team_letter)
);
ALTER TABLE public.relay_lineups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Relay lineups readable by authenticated."
ON public.relay_lineups FOR SELECT
TO authenticated
USING (true);
-- Writes go through the service-role API route (pages/api/relay-lineups.js).

-- --- TRAINING ATTENDANCE SYSTEM ---

-- Add advanced training targets to squads
ALTER TABLE public.squads ADD COLUMN IF NOT EXISTS target_training_percent INTEGER DEFAULT 75;
ALTER TABLE public.squads ADD COLUMN IF NOT EXISTS target_sessions_per_week INTEGER DEFAULT 0;
ALTER TABLE public.squads ADD COLUMN IF NOT EXISTS target_hours_per_week FLOAT DEFAULT 0;
ALTER TABLE public.squads ADD COLUMN IF NOT EXISTS require_weekend BOOLEAN DEFAULT false;
ALTER TABLE public.squads ADD COLUMN IF NOT EXISTS use_or_logic BOOLEAN DEFAULT true; -- true = Sessions OR Hours, false = Sessions AND Hours
ALTER TABLE public.squads ADD COLUMN IF NOT EXISTS swimmers_per_lane INTEGER DEFAULT 8;

-- Add custom pathway transition targets to squads (NULL defaults to global AI settings fallback)
ALTER TABLE public.squads ADD COLUMN IF NOT EXISTS struggling_consistency_threshold INTEGER DEFAULT NULL;
ALTER TABLE public.squads ADD COLUMN IF NOT EXISTS struggling_volume_threshold INTEGER DEFAULT NULL;
ALTER TABLE public.squads ADD COLUMN IF NOT EXISTS min_wa_points_threshold INTEGER DEFAULT NULL;
ALTER TABLE public.squads ADD COLUMN IF NOT EXISTS exempt_volume_offset BOOLEAN DEFAULT NULL;


-- Create sessions table
CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scm_guid UUID UNIQUE NOT NULL,
    name TEXT NOT NULL,
    day_of_week TEXT,
    start_time TEXT,
    end_time TEXT,
    location TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create training attendance table
CREATE TABLE IF NOT EXISTS public.training_attendance (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    swimmer_id UUID REFERENCES public.swimmers(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status TEXT DEFAULT 'present', -- 'present', 'absent', 'excused'
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(swimmer_id, session_id, date)
);

-- RLS Policies
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on sessions" ON public.sessions FOR SELECT USING (true);
CREATE POLICY "Allow public read on training_attendance" ON public.training_attendance FOR SELECT USING (true);
CREATE POLICY "Allow service role all on sessions" ON public.sessions FOR ALL USING (true);
CREATE POLICY "Allow service role all on training_attendance" ON public.training_attendance FOR ALL USING (true);

-- 8. Technical Intel Feedback (The Training Loop)
CREATE TABLE IF NOT EXISTS public.swimmer_ai_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    swimmer_id UUID REFERENCES public.swimmers(id) ON DELETE CASCADE,
    coach_id UUID REFERENCES public.profiles(id),
    original_insight JSONB,
    coach_correction TEXT,
    is_positive BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.swimmer_ai_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coaches can manage their own feedback." 
ON public.swimmer_ai_feedback FOR ALL 
TO authenticated 
USING (auth.uid() = coach_id);

-- 9. Swimmer Insights Archive (Foresight Tracking)
CREATE TABLE IF NOT EXISTS public.swimmer_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    swimmer_id UUID REFERENCES public.swimmers(id) ON DELETE CASCADE,
    headline TEXT,
    full_report JSONB,
    risk_level TEXT,
    flag TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.swimmer_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Insights are viewable by all authenticated." 
ON public.swimmer_insights FOR SELECT TO authenticated USING (true);
GRANT ALL ON public.swimmer_insights TO service_role;
GRANT ALL ON public.swimmer_insights TO authenticated;

-- 10. AI Reports Archive
CREATE TABLE public.ai_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    swimmer_id UUID REFERENCES public.swimmers(id) ON DELETE CASCADE,
    squad_id UUID REFERENCES public.squads(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'weekly', 'monthly', 'meet'
    meet_id UUID REFERENCES public.meets(id) ON DELETE CASCADE,
    content JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.ai_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reports are viewable by all authenticated." 
ON public.ai_reports FOR SELECT TO authenticated USING (true);
GRANT ALL ON public.ai_reports TO service_role;
GRANT ALL ON public.ai_reports TO authenticated;

-- 11. Pathway Benchmarks (County/Regional/National QTs)
CREATE TABLE public.benchmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL, -- 'County', 'Regional', 'National'
    year INTEGER NOT NULL,
    gender TEXT NOT NULL, -- 'Male', 'Female'
    age_group INTEGER NOT NULL, -- The age (e.g., 10, 11, 12...)
    event TEXT NOT NULL, -- '50m Freestyle', etc.
    course TEXT NOT NULL, -- 'SC', 'LC'
    time_standard TEXT NOT NULL, -- The qualifying time string
    time_seconds FLOAT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(category, year, gender, age_group, event, course)
);
ALTER TABLE public.benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Benchmarks are viewable by all authenticated." 
ON public.benchmarks FOR SELECT TO authenticated USING (true);
GRANT ALL ON public.benchmarks TO service_role;
GRANT ALL ON public.benchmarks TO authenticated;

-- 12. Club Exemptions & Shutdowns
CREATE TABLE public.club_exemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    type TEXT NOT NULL DEFAULT 'exempt', -- 'exempt' (skip week) or 'credit' (100% attendance)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.club_exemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Exemptions are viewable by all authenticated." 
ON public.club_exemptions FOR SELECT TO authenticated USING (true);
GRANT ALL ON public.club_exemptions TO service_role;
GRANT ALL ON public.club_exemptions TO authenticated;

-- 13. User Issues Table
CREATE TABLE public.user_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.user_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Issues can be inserted by authenticated users."
ON public.user_issues FOR INSERT
TO authenticated
WITH CHECK (true);
CREATE POLICY "Issues can be viewed by authenticated users."
ON public.user_issues FOR SELECT
TO authenticated
USING (true);
GRANT ALL ON public.user_issues TO service_role;
GRANT ALL ON public.user_issues TO authenticated;

-- Add upvotes column to user_issues table
ALTER TABLE public.user_issues ADD COLUMN IF NOT EXISTS upvotes INTEGER DEFAULT 0;

-- 14. Issue Upvotes Table
CREATE TABLE IF NOT EXISTS public.issue_upvotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES public.user_issues(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (issue_id, user_id)
);
ALTER TABLE public.issue_upvotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Upvotes can be inserted by authenticated users."
ON public.issue_upvotes FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Upvotes can be viewed by authenticated users."
ON public.issue_upvotes FOR SELECT
TO authenticated
USING (true);

GRANT ALL ON public.issue_upvotes TO service_role;
GRANT ALL ON public.issue_upvotes TO authenticated;

-- 15. AI Brain Settings Table
CREATE TABLE IF NOT EXISTS public.ai_brain_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.ai_brain_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for all authenticated" ON public.ai_brain_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow all for admins/headcoaches" ON public.ai_brain_settings FOR ALL TO authenticated USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'headcoach')
);
GRANT ALL ON public.ai_brain_settings TO service_role;
GRANT ALL ON public.ai_brain_settings TO authenticated;
INSERT INTO public.ai_brain_settings (key, value)
VALUES ('pathway_transition', '{"struggling_consistency_threshold": 60, "struggling_volume_threshold": 90, "min_wa_points_threshold": 250, "exempt_volume_offset": true}')
ON CONFLICT (key) DO NOTHING;



-- 16. Squad Restructuring / Pool Time Scenario Planner
-- Scenarios are a collection (listed, duplicated, compared), so they get a table
-- rather than an ai_brain_settings key. The deciding factor is PDF export: the
-- Puppeteer route re-renders the page from a URL, so a scenario must be
-- addressable as /restructure?scenario=<uuid>&view=print. Unsaved React state
-- cannot survive that round trip.
CREATE TABLE IF NOT EXISTS public.planning_scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    -- Full editable input set: candidate slots, proposed squads, coach roster,
    -- constraint policy, growth assumptions, solver weights. Everything the
    -- solver needs, so a solve never silently depends on live tables shifting
    -- underneath a saved scenario.
    inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Last computed solver output, cached so list and comparison views do not
    -- re-solve every scenario on every page load. Always re-derivable.
    last_result JSONB,
    baseline_captured_at TIMESTAMPTZ,
    is_baseline BOOLEAN DEFAULT false,
    is_archived BOOLEAN DEFAULT false,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS planning_scenarios_updated_idx
    ON public.planning_scenarios (is_archived, updated_at DESC);
ALTER TABLE public.planning_scenarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read for all authenticated" ON public.planning_scenarios;
CREATE POLICY "Allow read for all authenticated" ON public.planning_scenarios FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Allow all for admins/headcoaches" ON public.planning_scenarios;
CREATE POLICY "Allow all for admins/headcoaches" ON public.planning_scenarios FOR ALL TO authenticated USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'headcoach')
);
GRANT ALL ON public.planning_scenarios TO service_role;
GRANT ALL ON public.planning_scenarios TO authenticated;

INSERT INTO public.ai_brain_settings (key, value)
VALUES ('restructure_defaults', '{"maxLanesPerCoach": 3, "minCoachesPerSquadSession": 1, "minCoachesPerSquadSessionUnder14": 2, "defaultSwimmersPerLane": 8, "ltadTable": "unified", "venueTransitMinutes": 30, "weeksPerYear": 46}')
ON CONFLICT (key) DO NOTHING;

-- 17. Coach profiles (shared roster for the scenario planner)
-- public.profiles carries only id, email and role, so a coach's name, level,
-- lane limit, weekly hours and availability have nowhere to live. Scenarios can
-- hold them, but a roster typed into five scenarios drifts into five different
-- answers. This is the shared copy the planner loads from and saves back to.
-- Field names mirror the scenario blob so moving between the two is a mapping,
-- not a translation.
CREATE TABLE IF NOT EXISTS public.coach_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Null for a hypothetical coach invented for a recruitment what-if.
    profile_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    level TEXT,                                  -- 'head' | 'L2' | 'L1' | 'volunteer'
    max_lanes INTEGER DEFAULT 3,
    max_hours_per_week NUMERIC,
    -- [{ day: 'Monday', from: '17:00', to: '21:00' }]. An empty list means
    -- "not stated", which the solver reads as available.
    availability JSONB DEFAULT '[]'::jsonb,
    venues JSONB DEFAULT '[]'::jsonb,
    -- Coaches are retired rather than deleted, so a saved scenario that still
    -- references one does not lose their details.
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coach_profiles_active_idx ON public.coach_profiles (is_active);
ALTER TABLE public.coach_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read for all authenticated" ON public.coach_profiles;
CREATE POLICY "Allow read for all authenticated" ON public.coach_profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Allow all for admins/headcoaches" ON public.coach_profiles;
CREATE POLICY "Allow all for admins/headcoaches" ON public.coach_profiles FOR ALL TO authenticated USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'headcoach')
);
GRANT ALL ON public.coach_profiles TO service_role;
GRANT ALL ON public.coach_profiles TO authenticated;
