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
    const { data: squads } = await supabase.from('squads').select('id, name');
    if (!squads) { console.log("No squads found"); return; }
    for (const squad of squads) {
      const { data: swimmers } = await supabase.from('swimmers').select('id').eq('squad_id', squad.id);
      if (!swimmers || swimmers.length === 0) continue;
      const swimmerIds = swimmers.map(s => s.id);
      const { count, error } = await supabase.from('training_attendance')
        .select('*', { count: 'exact', head: true })
        .in('swimmer_id', swimmerIds);
      console.log(`Squad: ${squad.name}, Swimmers: ${swimmerIds.length}, Attendance Count: ${count}`);
    }
  } catch (e) {
    console.error(e);
  }
}

check();
