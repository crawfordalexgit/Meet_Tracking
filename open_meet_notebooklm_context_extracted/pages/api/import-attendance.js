import { getServiceSupabase } from '../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { records } = req.body;
  if (!records || !Array.isArray(records)) {
    return res.status(400).json({ error: 'Missing or invalid records array' });
  }

  try {
    const supabase = getServiceSupabase();
    
    // 1. Fetch all swimmers and sessions to minimize DB calls
    const { data: swimmers } = await supabase.from('swimmers').select('id, full_name');
    const { data: existingSessions } = await supabase.from('sessions').select('id, name');

    const sessionCache = {}; // name -> id
    existingSessions.forEach(s => sessionCache[s.name.toLowerCase()] = s.id);

    let importCount = 0;
    let skipCount = 0;

    for (const record of records) {
      // Find swimmer by name (case-insensitive)
      const swimmer = swimmers.find(s => s.full_name.toLowerCase() === record.swimmerName.toLowerCase());
      if (!swimmer) {
        skipCount++;
        continue;
      }

      // Find or create session
      let sessionId = sessionCache[record.sessionName.toLowerCase()];
      if (!sessionId) {
        const { data: newSession } = await supabase
          .from('sessions')
          .insert({ name: record.sessionName, scm_guid: crypto.randomUUID() })
          .select('id')
          .single();
        
        if (newSession) {
          sessionId = newSession.id;
          sessionCache[record.sessionName.toLowerCase()] = sessionId;
        }
      }

      if (!sessionId) {
        skipCount++;
        continue;
      }

      // Insert attendance
      const { error } = await supabase
        .from('training_attendance')
        .upsert({
          swimmer_id: swimmer.id,
          session_id: sessionId,
          date: record.date,
          status: 'present'
        }, { onConflict: 'swimmer_id, session_id, date' });

      if (!error) importCount++;
      else skipCount++;
    }

    return res.status(200).json({ 
      message: 'Import completed.',
      imported: importCount,
      skipped: skipCount
    });

  } catch (error) {
    console.error('Import Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
