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
    const { count: attCount } = await supabase.from('training_attendance').select('*', { count: 'exact', head: true });
    const { count: memCount } = await supabase.from('session_memberships').select('*', { count: 'exact', head: true });
    const { count: resCount } = await supabase.from('results').select('*', { count: 'exact', head: true });
    console.log(`Total Attendance: ${attCount}`);
    console.log(`Total Memberships: ${memCount}`);
    console.log(`Total Results: ${resCount}`);
  } catch (e) {
    console.error(e);
  }
}

check();
