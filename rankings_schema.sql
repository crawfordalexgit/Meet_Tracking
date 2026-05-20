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

-- Allow public read access (respecting dashboard visibility)
CREATE POLICY "Allow public read access to rankings" ON rankings
    FOR SELECT USING (true);

-- Allow service role full access
CREATE POLICY "Allow service role full access to rankings" ON rankings
    FOR ALL USING (true) WITH CHECK (true);
