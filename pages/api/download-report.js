import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { file } = req.query;

  if (!file) {
    return res.status(400).json({ error: 'Missing file parameter' });
  }

  // Sanitize filename to prevent path traversal attacks
  const safeFileName = path.basename(file);
  const reportsDir = path.join(process.cwd(), 'Reports');
  const filePath = path.join(reportsDir, safeFileName);

  // Validate the file exists and is indeed a PDF
  if (!fs.existsSync(filePath) || !safeFileName.toLowerCase().endsWith('.pdf')) {
    return res.status(404).json({ error: 'File not found or access denied' });
  }

  try {
    const fileStream = fs.createReadStream(filePath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Download error:', error);
    return res.status(500).json({ error: 'Failed to download report file' });
  }
}
