import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { facet, filename } = req.body;
  if (!facet || !filename) return res.status(400).json({ error: 'Facet and filename required' });

  try {
    const promptsDir = path.join(process.cwd(), 'lib', 'prompts');
    const backupPath = path.join(promptsDir, '_history', filename);
    const currentPath = path.join(promptsDir, `${facet}.md`);

    if (!fs.existsSync(backupPath)) {
      throw new Error("Backup file not found");
    }

    // 1. Create a backup of the current state before rolling back
    const historyDir = path.join(promptsDir, '_history');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const preRollbackBackup = path.join(historyDir, `${facet}_pre-rollback_${timestamp}.md`);
    if (fs.existsSync(currentPath)) {
      fs.copyFileSync(currentPath, preRollbackBackup);
    }

    // 2. Restore the selected backup
    fs.copyFileSync(backupPath, currentPath);
    
    const content = fs.readFileSync(currentPath, 'utf8');
    res.status(200).json({ success: true, content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
