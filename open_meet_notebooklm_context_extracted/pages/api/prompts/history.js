import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  const { facet } = req.query;
  if (!facet) return res.status(400).json({ error: 'Facet required' });

  try {
    const historyDir = path.join(process.cwd(), 'lib', 'prompts', '_history');
    if (!fs.existsSync(historyDir)) return res.status(200).json({ history: [] });

    const files = fs.readdirSync(historyDir)
      .filter(f => f.startsWith(`${facet}_`))
      .map(f => {
        const stat = fs.statSync(path.join(historyDir, f));
        return {
          filename: f,
          timestamp: f.split('_')[1].replace('.md', ''),
          date: stat.mtime
        };
      })
      .sort((a, b) => b.date - a.date); // Newest first

    res.status(200).json({ history: files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
