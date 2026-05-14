const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manual env load
const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) env[key.trim()] = value.trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { count, error } = await supabase.from('swimmers').select('*', { count: 'exact', head: true });
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Total Swimmers in DB:', count);
  }
  process.exit();
}

check();
