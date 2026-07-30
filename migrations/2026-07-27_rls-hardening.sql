-- ============================================================================
-- 2026-07-27 · RLS hardening (pre-launch audit P0-2 / P0-3)
--
-- Run this in the Supabase SQL editor against the live project.
-- It is idempotent: every policy is dropped before being recreated.
--
-- WHAT WAS WRONG
--   sessions, training_attendance and rankings each carried a policy named
--   "Allow service role ..." declared as `FOR ALL USING (true)` with no `TO`
--   clause. A policy with no role applies to PUBLIC, which includes `anon`.
--   The anon key ships in the client bundle, so anyone could DELETE every row
--   in those tables. The policy names claimed the opposite of what they did.
--
--   Their SELECT policies were likewise `USING (true)` with no `TO` clause,
--   exposing minors' attendance history and rankings to unauthenticated
--   readers.
--
--   profiles was readable in full by every authenticated user (email + role).
--
--   user_issues / issue_upvotes INSERT used `WITH CHECK (true)`, so any user
--   could forge rows attributed to another user.
--
-- NOTE ON service_role
--   The Supabase service_role bypasses RLS entirely. It never needed a policy;
--   the GRANTs below are what actually give it access. Dropping the bogus
--   "service role" policies therefore does not affect any server-side route
--   that uses getServiceSupabase().
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Helper: read the caller's role without recursing through profiles' RLS.
--    Needed because a profiles policy that selects from profiles raises
--    "infinite recursion detected in policy for relation profiles".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

-- ---------------------------------------------------------------------------
-- 1. sessions
--    SELECT  -> authenticated only
--    UPDATE  -> authenticated (lane allocation on /capacity is a coach task)
--    INSERT/DELETE -> admin + headcoach only. This makes the client-side gate
--                     in pages/settings.js a real database gate.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow public read on sessions" ON public.sessions;
DROP POLICY IF EXISTS "Allow service role all on sessions" ON public.sessions;

CREATE POLICY "Sessions readable by authenticated"
ON public.sessions FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Sessions updatable by authenticated"
ON public.sessions FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Sessions insertable by admins"
ON public.sessions FOR INSERT
TO authenticated
WITH CHECK (public.current_user_role() IN ('admin', 'headcoach'));

CREATE POLICY "Sessions deletable by admins"
ON public.sessions FOR DELETE
TO authenticated
USING (public.current_user_role() IN ('admin', 'headcoach'));

GRANT ALL ON public.sessions TO service_role;

-- ---------------------------------------------------------------------------
-- 2. training_attendance
--    Read-only for authenticated users. Every write goes through a server
--    route on the service_role client (sync-attendance, import-attendance).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow public read on training_attendance" ON public.training_attendance;
DROP POLICY IF EXISTS "Allow service role all on training_attendance" ON public.training_attendance;

CREATE POLICY "Attendance readable by authenticated"
ON public.training_attendance FOR SELECT
TO authenticated
USING (true);

GRANT ALL ON public.training_attendance TO service_role;

-- ---------------------------------------------------------------------------
-- 3. rankings
--    Read-only for authenticated users. Written only by scrape-rankings.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow public read access to rankings" ON public.rankings;
DROP POLICY IF EXISTS "Allow service role full access to rankings" ON public.rankings;

CREATE POLICY "Rankings readable by authenticated"
ON public.rankings FOR SELECT
TO authenticated
USING (true);

GRANT ALL ON public.rankings TO service_role;

-- ---------------------------------------------------------------------------
-- 4. profiles
--    Self + admin/headcoach. Every client read is self-scoped except the
--    roster on pages/settings.js, which is already an admin-only page.
--    Also rewrites the UPDATE policy to use current_user_role(), removing the
--    recursive profiles-selects-profiles subquery it had before.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users." ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles." ON public.profiles;

CREATE POLICY "Profiles viewable by self or admins"
ON public.profiles FOR SELECT
TO authenticated
USING (
    id = auth.uid()
    OR public.current_user_role() IN ('admin', 'headcoach')
);

CREATE POLICY "Profiles updatable by admins"
ON public.profiles FOR UPDATE
TO authenticated
USING (public.current_user_role() = 'admin')
WITH CHECK (public.current_user_role() = 'admin');

-- ---------------------------------------------------------------------------
-- 5. user_issues / issue_upvotes
--    Bind the inserted row to the caller so attribution cannot be forged.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Issues can be inserted by authenticated users." ON public.user_issues;
CREATE POLICY "Issues can be inserted by their author"
ON public.user_issues FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Upvotes can be inserted by authenticated users." ON public.issue_upvotes;
CREATE POLICY "Upvotes can be inserted by their author"
ON public.issue_upvotes FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

COMMIT;

-- ============================================================================
-- Verification (run after COMMIT; every row should show a non-null role list
-- and no policy should be scoped to {public} on these tables):
--
--   SELECT tablename, policyname, roles, cmd
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('sessions','training_attendance','rankings',
--                       'profiles','user_issues','issue_upvotes')
--   ORDER BY tablename, policyname;
-- ============================================================================
