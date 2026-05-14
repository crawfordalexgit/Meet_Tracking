const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) env[key.trim()] = value.trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.rpc('get_table_info', { table_name: 'swimmers' });
  if (error) {
    // If RPC doesn't exist, try a simple select
    console.log('Fetching one row...');
    const { data: rows } = await supabase.from('swimmers').select('*').limit(1);
    console.log('Rows:', rows);
  } else {
    console.log('Schema:', data);
  }
  process.exit();
}

check();
