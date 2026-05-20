import { getServiceSupabase } from '../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { title, description, type, user_id } = req.body;
  if (!title || !description || !type) {
    return res.status(400).json({ error: 'Missing required parameters: title, description, or type' });
  }

  try {
    const supabase = getServiceSupabase();

    const { data, error } = await supabase
      .from('user_issues')
      .insert({
        title,
        description,
        type,
        user_id: user_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user_id) ? user_id : null
      });

    if (error) throw error;

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Log Issue Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
