-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create the rankings table to store Kent and SE Region times
CREATE TABLE IF NOT EXISTS rankings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    swimmer_id UUID REFERENCES swimmers(id) ON DELETE CASCADE,
    district TEXT NOT NULL, -- 'Kent' or 'South East'
    pool TEXT NOT NULL, -- 'L' (Long Course) or 'S' (Short Course)
    gender TEXT NOT NULL, -- 'M' or 'F'
    age INTEGER NOT NULL,
    stroke TEXT NOT NULL, -- Event Name e.g. '50 Free'
    time TEXT NOT NULL,
    rank INTEGER,
    date DATE,
    meet_name TEXT,
    venue TEXT,
    fina_points INTEGER,
    snapshot_date DATE DEFAULT CURRENT_DATE,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(swimmer_id, district, pool, stroke, age, snapshot_date) -- Prevent duplicates for the same athlete/event/age in a single snapshot
);

-- Enable RLS
ALTER TABLE rankings ENABLE ROW LEVEL SECURITY;

-- Authenticated read only. A policy with no TO clause applies to PUBLIC
-- (including anon, whose key ships in the client bundle) — see
-- migrations/2026-07-27_rls-hardening.sql.
CREATE POLICY "Rankings readable by authenticated" ON rankings
    FOR SELECT TO authenticated USING (true);

-- service_role bypasses RLS; it needs the GRANT, not a policy.
GRANT ALL ON rankings TO service_role;

-- Indexes (added 2026-07-27; see migrations/2026-07-27_indexes.sql).
CREATE INDEX IF NOT EXISTS idx_rankings_swimmer_id    ON rankings (swimmer_id);
CREATE INDEX IF NOT EXISTS idx_rankings_snapshot_date ON rankings (snapshot_date DESC);
