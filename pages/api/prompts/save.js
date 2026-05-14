import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { facet, content } = req.body;
  if (!facet || !content) return res.status(400).json({ error: 'Facet and content required' });

  try {
    const promptsDir = path.join(process.cwd(), 'lib', 'prompts');
    const historyDir = path.join(promptsDir, '_history');
    
    if (!fs.existsSync(historyDir)) {
      fs.mkdirSync(historyDir, { recursive: true });
    }

    const currentPath = path.join(promptsDir, `${facet}.md`);
    
    // Backup existing if it exists
    if (fs.existsSync(currentPath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(historyDir, `${facet}_${timestamp}.md`);
      fs.copyFileSync(currentPath, backupPath);
    }

    // Write new content
    fs.writeFileSync(currentPath, content, 'utf8');
    
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
