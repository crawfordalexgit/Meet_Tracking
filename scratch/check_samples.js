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
  try {
    const { data: res } = await supabase.from('results').select('id').limit(1);
    console.log('Results Sample:', res);
    const { data: mem } = await supabase.from('session_memberships').select('swimmer_id').limit(1);
    console.log('Memberships Sample:', mem);
  } catch (e) {
    console.error(e);
  }
}

check();
