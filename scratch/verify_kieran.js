require('dotenv').config({ path: '.env.local' });
const { getServiceSupabase } = require('../lib/supabase');
const { getSwimmerDNA } = require('../lib/ai-context');

async function verify() {
  const swimmerId = "2310750a-21c3-4ba9-a480-7eb4bc5df8a9"; // Kieran
  const supabase = getServiceSupabase();

  const fetchPaged = async (table, select = '*', filter = null) => {
    let all = []; let page = 0; let more = true;
    while (more && page < 10) {
      let q = supabase.from(table).select(select).range(page * 1000, (page + 1) * 1000 - 1);
      if (filter) q = filter(q);
      const { data, error } = await q;
      if (error || !data) break;
      all = [...all, ...data];
      if (data.length < 1000) more = false;
      page++;
    }
    return all;
  };

  const { data: swimmer } = await supabase
    .from('swimmers')
    .select('*, squads(id,name,target_meets,target_sessions_per_week,target_training_percent,target_hours_per_week,require_weekend,use_or_logic)')
    .eq('id', swimmerId)
    .single();

  const [results, attendance, sessions, feedback] = await Promise.all([
    fetchPaged('results', '*, meets(name,license,date,course,level)', q => q.eq('swimmer_id', swimmerId).order('date', { ascending: false })),
    fetchPaged('training_attendance', '*', q => q.eq('swimmer_id', swimmerId).order('date', { ascending: false })),
    supabase.from('sessions').select('*'),
    fetchPaged('swimmer_ai_feedback', '*', q => q.eq('swimmer_id', swimmerId).order('created_at', { ascending: false }))
  ]);

  const dna = await getSwimmerDNA(
    swimmer, 
    results, 
    attendance, 
    sessions.data || [], 
    feedback, 
    0, 
    365
  );

  console.log("Kieran DNA Metrics (365d):");
  console.log(`Consistency: ${dna.training.consistency_pct}%`);
  console.log(`Volume: ${dna.training.volume_pct}%`);
  console.log(`Peak WA: ${dna.technical.peak_wa}`);
}

verify().catch(console.error);
