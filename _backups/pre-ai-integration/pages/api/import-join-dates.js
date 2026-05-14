import { getServiceSupabase } from '../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { data } = req.body; // Expecting an array of { member_id, squad_join_date }
  
  if (!Array.isArray(data) || data.length === 0) {
    return res.status(400).json({ error: 'No data provided' });
  }

  try {
    const supabase = getServiceSupabase();
    
    console.log(`IMPORT: Received ${data.length} join dates to update.`);

    // Update each swimmer. We use a loop here because we need to match by member_id
    // but the SQL upsert needs to be careful with other fields.
    const results = { updated: 0, errors: 0 };

    for (const item of data) {
      const { member_id, full_name, squad_join_date } = item;
      if (!squad_join_date) continue;

      let query = supabase.from('swimmers').update({ squad_join_date });

      if (member_id) {
        query = query.eq('member_id', member_id.toString());
      } else if (full_name) {
        query = query.ilike('full_name', full_name.trim());
      } else {
        continue;
      }

      const { error } = await query;

      if (error) {
        console.error(`Error updating ${item.member_id}:`, error.message);
        results.errors++;
      } else {
        results.updated++;
      }
    }

    return res.status(200).json({ 
      success: true, 
      message: `Successfully updated ${results.updated} swimmers. ${results.errors} errors.` 
    });
  } catch (error) {
    console.error('Import Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
