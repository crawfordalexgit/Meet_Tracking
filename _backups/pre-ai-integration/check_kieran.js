const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) env[key.trim()] = value.trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function find() {
  const { data: swimmers } = await supabase.from('swimmers').select('id, full_name').ilike('full_name', '%Kieran Crawford%');
  if (!swimmers || swimmers.length === 0) {
    console.log('Swimmer not found');
    process.exit();
  }
  
  console.log('Found:', swimmers[0].full_name);
  const { data: pbs } = await supabase.from('swimmer_pbs').select('*').eq('swimmer_id', swimmers[0].id).ilike('event', '%100%Breast%');
  console.log(JSON.stringify(pbs, null, 2));
  process.exit();
}

find();
