-- Run history for the scheduled and manual syncs.
--
-- Nothing recorded sync runs before this: session memberships sat stale from
-- 9 June with no visible trace, and the only way to tell whether the nightly
-- attendance cron was healthy was to group training_attendance.created_at by
-- hour. One row per logical run (not per batch) so the UI can answer "did this
-- run, when, and did it work".

CREATE TABLE IF NOT EXISTS sync_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job TEXT NOT NULL,                       -- 'memberships' | 'join-dates' | 'attendance' | 'scm' | 'rankings'
    status TEXT NOT NULL,                    -- 'success' | 'partial' | 'error'
    triggered_by TEXT,                       -- 'cron' | 'user'
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ DEFAULT NOW(),
    duration_ms INTEGER,
    summary JSONB,                           -- e.g. {"processed":300,"updated":298,"skipped":2}
    error TEXT
);

-- The dashboard only ever reads the newest run per job.
CREATE INDEX IF NOT EXISTS sync_runs_job_finished_idx ON sync_runs (job, finished_at DESC);

ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to sync_runs" ON sync_runs
    FOR SELECT USING (true);

CREATE POLICY "Allow service role full access to sync_runs" ON sync_runs
    FOR ALL USING (true) WITH CHECK (true);
