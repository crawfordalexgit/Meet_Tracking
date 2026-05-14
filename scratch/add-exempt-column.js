const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function migrate() {
  console.log('Adding is_exempt column to swimmers table...');
  
  // Note: We use rpc if available, or we just try to update a non-existent column 
  // which will fail if the table doesn't exist, but we can't do DDL easily via the client.
  // However, I will check if I can use the postgres connection directly via a pg client if available.
  
  // Alternatively, since I can't do DDL via standard JS client easily without an RPC function,
  // I will ask the user to run the SQL in their Supabase dashboard for reliability.
  
  console.log('--- SQL COMMAND ---');
  console.log('ALTER TABLE swimmers ADD COLUMN IF NOT EXISTS is_exempt BOOLEAN DEFAULT FALSE;');
  console.log('-------------------');
  
  console.log('Please run the above SQL in your Supabase SQL Editor.');
}

migrate();
