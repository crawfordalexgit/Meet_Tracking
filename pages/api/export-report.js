import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

    const { squadId, squadName, period = 365 } = req.body;

    if (!squadId || !squadName) {
      return res.status(400).json({ error: 'Missing squadId or squadName' });
    }

    try {
      console.log(`API: Starting PDF Export for: ${squadName} (${squadId}), Period: ${period} days...`);
      
      const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const page = await browser.newPage();

      // Use absolute URL (localhost for dev)
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const host = req.headers.host;
      const url = `${protocol}://${host}/squad/${squadId}?rosterOnly=true&period=${period}`;
      
      console.log(`API: Navigating to: ${url}`);
      
      await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: 90000 // Increased timeout for large squads
      });

    const reportsDir = path.join(process.cwd(), 'Reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const safeName = squadName.replace(/\s+/g, '_');
    const fileName = `Squad_Compliance_Audit_${safeName}_${new Date().toISOString().split('T')[0]}.pdf`;
    const outputPath = path.join(reportsDir, fileName);

    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0px',
        right: '0px',
        bottom: '0px',
        left: '0px'
      }
    });

    await browser.close();
    
    console.log(`API: Success! Report saved to: ${outputPath}`);
    
    return res.status(200).json({ 
      success: true, 
      message: 'Report saved to Reports folder',
      fileName: fileName,
      path: outputPath
    });
  } catch (error) {
    console.error('API: PDF Export Failed:', error);
    return res.status(500).json({ error: error.message });
  }
}
