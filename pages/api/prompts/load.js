import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  const { facet } = req.query;
  if (!facet) return res.status(400).json({ error: 'Facet required' });

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
