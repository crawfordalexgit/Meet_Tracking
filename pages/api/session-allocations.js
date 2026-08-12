import { requireAuth } from '../../lib/api-auth';
import { fetchAllocationData } from '../../lib/allocation-data';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!await requireAuth(req, res)) return;

  try {
    return res.status(200).json(await fetchAllocationData());
  } catch (error) {
    console.error('Session allocations API error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
