const { supabase } = require('./lib/supabase');
const { calculateReliability } = require('./lib/analytics-utils');

async function debugReliability() {
  try {
    const { data: swimmers, error: sErr } = await supabase.from('swimmers').select('*, squads(*)').limit(15);
    if (sErr) throw sErr;

    const { data: attendance } = await supabase.from('training_attendance').select('*').gte('date', '2024-05-01');
    const { data: results } = await supabase.from('results').select('*').gte('date', '2024-05-01');
    const { data: sessions } = await supabase.from('sessions').select('*');
    const { data: exemptions } = await supabase.from('club_exemptions').select('*');

    swimmers.forEach(s => {
      const sAtt = attendance.filter(a => a.swimmer_id === s.id);
      const sRes = results.filter(r => r.swimmer_id === s.id);
      const rel = calculateReliability(s, sAtt, sessions, sRes, 365, exemptions);
      console.log(`[DEBUG] ${s.full_name}: %=${rel.percentage}, Met=${rel.weeksMet}, Total=${rel.totalWeeks}, Hols=${rel.holidaysUsed}/${rel.holidayAllowance}`);
    });
  } catch (e) {
    console.error(e);
  }
}

debugReliability();
