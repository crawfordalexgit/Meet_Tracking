-- ============================================================================
-- 2026-07-27 · Lookup indexes (pre-launch audit, Deliverable 1a)
--
-- Run this in the Supabase SQL editor against the live project.
-- Safe to re-run: every statement is IF NOT EXISTS.
--
-- WHAT WAS WRONG
--   schema.sql and rankings_schema.sql contained ZERO CREATE INDEX statements.
--   Every hot query in lib/analytics-utils.js and lib/ai-context.js filters on
--   exactly the columns below, so each one was a sequential scan. This is a
--   direct contributor to the ~40s /squads and /swimmers loads recorded in
--   tests/HANDOFF-2026-07-08.md.
--
-- CONCURRENTLY is deliberately NOT used: it cannot run inside a transaction
-- block, and these tables are small enough (tens of thousands of rows) that a
-- brief lock during a maintenance window is fine. If you need to apply this to
-- a busy production database, run each statement separately with
-- CREATE INDEX CONCURRENTLY instead.
-- ============================================================================

BEGIN;

-- results: filtered by swimmer, by meet, and by date window on every page.
CREATE INDEX IF NOT EXISTS idx_results_swimmer_id ON public.results (swimmer_id);
CREATE INDEX IF NOT EXISTS idx_results_meet_id    ON public.results (meet_id);
CREATE INDEX IF NOT EXISTS idx_results_date       ON public.results (date DESC);
-- Composite for "this swimmer's results in this period", the single most
-- common shape (calculateReliability, getSwimmerDNA, swimmer detail page).
CREATE INDEX IF NOT EXISTS idx_results_swimmer_date ON public.results (swimmer_id, date DESC);

-- training_attendance: always read as "this swimmer, this date range".
CREATE INDEX IF NOT EXISTS idx_attendance_swimmer_date ON public.training_attendance (swimmer_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_date         ON public.training_attendance (date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_session_id   ON public.training_attendance (session_id);

-- swimmer_pbs: joined per swimmer on the meet report and relay builder.
CREATE INDEX IF NOT EXISTS idx_swimmer_pbs_swimmer_id ON public.swimmer_pbs (swimmer_id);

-- rankings: filtered by swimmer and by snapshot on the dashboard and predictor.
CREATE INDEX IF NOT EXISTS idx_rankings_swimmer_id    ON public.rankings (swimmer_id);
CREATE INDEX IF NOT EXISTS idx_rankings_snapshot_date ON public.rankings (snapshot_date DESC);

-- swimmers: squad rosters, and the SCM sync's numeric-id lookup.
CREATE INDEX IF NOT EXISTS idx_swimmers_squad_id      ON public.swimmers (squad_id);
CREATE INDEX IF NOT EXISTS idx_swimmers_scm_numeric   ON public.swimmers (scm_numeric_id);

-- session_memberships: the "source of truth" for a swimmer's scheduled days.
CREATE INDEX IF NOT EXISTS idx_memberships_swimmer_id ON public.session_memberships (swimmer_id);
CREATE INDEX IF NOT EXISTS idx_memberships_session_id ON public.session_memberships (session_id);

-- meets: date-windowed on nearly every page.
CREATE INDEX IF NOT EXISTS idx_meets_date      ON public.meets (date DESC);
CREATE INDEX IF NOT EXISTS idx_meets_parent_id ON public.meets (parent_id);

-- ai_reports / swimmer_insights: always "latest for this subject".
CREATE INDEX IF NOT EXISTS idx_ai_reports_squad_created   ON public.ai_reports (squad_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insights_swimmer_created   ON public.swimmer_insights (swimmer_id, created_at DESC);

COMMIT;

-- ============================================================================
-- Verification:
--   SELECT tablename, indexname FROM pg_indexes
--   WHERE schemaname = 'public' AND indexname LIKE 'idx_%'
--   ORDER BY tablename, indexname;
--
-- To confirm a scan actually uses one:
--   EXPLAIN ANALYZE SELECT * FROM results
--   WHERE swimmer_id = '<uuid>' AND date >= '2025-01-01';
-- ============================================================================
