import { getServiceSupabase } from '../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from('user_issues')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.status(200).json({ issues: data || [] });
  } catch (error) {
    console.error('Get Issues Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
