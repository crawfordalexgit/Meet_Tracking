import { getServiceSupabase } from '../../lib/supabase';
import { scmLogin, fetchSwimmerSessions } from '../../lib/scm-scraper';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { swimmerIds } = req.body;
  if (!swimmerIds || !Array.isArray(swimmerIds)) {
    return res.status(400).json({ error: 'Missing swimmerIds array' });
  }

  const username = process.env.SCM_WEB_USERNAME;
  const password = process.env.SCM_WEB_PASSWORD;

  if (!username || !password) {
    return res.status(500).json({ error: 'SCM Web credentials missing in .env.local' });
  }

  try {
    const supabase = getServiceSupabase();
    console.log(`SESSION SYNC: Processing batch of ${swimmerIds.length} swimmers...`);
    
    const cookies = await scmLogin(username, password);
    
    // Fetch session map to convert names to IDs
    const { data: dbSessions } = await supabase.from('sessions').select('id, name');
    const sessionNameToId = {};
    if (dbSessions) dbSessions.forEach(s => sessionNameToId[s.name.trim()] = s.id);

    // Fetch swimmers to get their numeric IDs
    const { data: swimmers } = await supabase
      .from('swimmers')
      .select('id, full_name, scm_numeric_id')
      .in('id', swimmerIds)
      .not('scm_numeric_id', 'is', null);

    if (!swimmers || swimmers.length === 0) {
      return res.status(200).json({ success: true, message: 'No valid swimmers found in this batch.' });
    }

    const results = [];
    for (const swimmer of swimmers) {
      try {
        console.log(`SESSION SYNC: Scraping ${swimmer.full_name}...`);
        const officialSessions = await fetchSwimmerSessions(swimmer.scm_numeric_id, cookies);
        
        if (officialSessions && officialSessions.length > 0) {
          const memberships = officialSessions
            .map(name => ({
              swimmer_id: swimmer.id,
              session_id: sessionNameToId[name.trim()]
            }))
            .filter(m => m.session_id);

          if (memberships.length > 0) {
            // Clear and replace
            await supabase.from('session_memberships').delete().eq('swimmer_id', swimmer.id);
            const { error } = await supabase.from('session_memberships').insert(memberships);
            if (error) throw error;
            results.push({ swimmer: swimmer.full_name, sessions: memberships.length });
          } else {
            results.push({ swimmer: swimmer.full_name, sessions: 0, warning: 'No matching sessions found in DB' });
          }
        } else {
          results.push({ swimmer: swimmer.full_name, sessions: 0 });
        }
      } catch (err) {
        console.error(`SESSION SYNC ERROR for ${swimmer.full_name}:`, err.message);
        results.push({ swimmer: swimmer.full_name, error: err.message });
      }
    }

    return res.status(200).json({ success: true, results });
  } catch (error) {
    console.error('GLOBAL SESSION SYNC ERROR:', error);
    return res.status(500).json({ error: error.message });
  }
}
