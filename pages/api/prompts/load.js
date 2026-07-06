import fs from 'fs';
import path from 'path';
import { requireAuth } from '../../../lib/api-auth';

const SAFE_FACET_RE = /^[a-z0-9_]+$/;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!await requireAuth(req, res)) return;

  const { facet } = req.query;
  if (!facet) return res.status(400).json({ error: 'Facet required' });
  if (!SAFE_FACET_RE.test(facet)) return res.status(400).json({ error: 'Invalid facet' });

  try {
    const promptPath = path.join(process.cwd(), 'lib', 'prompts', `${facet}.md`);
    if (fs.existsSync(promptPath)) {
      const content = fs.readFileSync(promptPath, 'utf8');
      res.status(200).json({ content });
    } else {
      res.status(200).json({ content: '' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
