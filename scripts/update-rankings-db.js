const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function updateSchema() {
    console.log("Updating rankings table schema...");
    
    // We can't run ALTER TABLE directly via the client easily without a custom function.
    // However, we can use the 'postgres' library if we had the connection string.
    // Since we only have the URL/Key, we will assume the user applies the SQL or we try an upsert that triggers it? No.
    
    console.log("Please run the following SQL in your Supabase SQL Editor:");
    console.log(`
        ALTER TABLE rankings ADD COLUMN IF NOT EXISTS snapshot_date DATE DEFAULT CURRENT_DATE;
        ALTER TABLE rankings DROP CONSTRAINT IF EXISTS rankings_swimmer_id_district_pool_stroke_age_key;
        ALTER TABLE rankings ADD CONSTRAINT rankings_swimmer_id_district_pool_stroke_age_snapshot_date_key 
        UNIQUE(swimmer_id, district, pool, stroke, age, snapshot_date);
    `);
}

updateSchema();
