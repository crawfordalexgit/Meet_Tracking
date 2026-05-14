const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkSchema() {
  const { data: squad, error: sErr } = await supabase.from('squads').select('*').limit(1);
  console.log('Squad columns:', Object.keys(squad[0] || {}));
  
  const { data: swimmer, error: swErr } = await supabase.from('swimmers').select('*').limit(1);
  console.log('Swimmer columns:', Object.keys(swimmer[0] || {}));
}

checkSchema();
