
import { getServiceSupabase } from '../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { swimmerId } = req.query;

  try {
    const supabase = getServiceSupabase();
    let allData = [];
    let page = 0;
    let pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      let query = supabase.from('session_memberships').select('*').range(page * pageSize, (page + 1) * pageSize - 1);
      if (swimmerId) query = query.eq('swimmer_id', swimmerId);
      
      const { data, error } = await query;
      if (error) throw error;
      
      allData = [...allData, ...(data || [])];
      hasMore = data && data.length === pageSize;
      page++;
      if (page > 50) break; // Safety limit
    }

    return res.status(200).json(allData);
  } catch (error) {
    console.error('Error fetching memberships:', error);
    return res.status(500).json({ error: error.message });
  }
}
