import puppeteer from 'puppeteer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { meetId, meetName, type, squadId, storage } = req.body;

  try {
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Inject the user's auth tokens into the headless browser before it loads!
    if (storage) {
      await page.evaluateOnNewDocument((store) => {
        for (const key in store) {
          localStorage.setItem(key, store[key]);
        }
      }, storage);
    }

    // Determine the target URL based on the environment
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host;
    const baseUrl = `${protocol}://${host}`;

    let targetUrl = baseUrl;
    if (type === 'meet' && meetId) {
      targetUrl = `${baseUrl}/meet/${meetId}?print=true`;
    } else if (type === 'squad' && squadId) {
      targetUrl = `${baseUrl}/squad/${squadId}?rosterOnly=true`;
    } else if (squadId) {
      // Preserves backward compatibility for the general Reports page
      targetUrl = `${baseUrl}/reports?squadId=${squadId}`;
    }

    console.log(`API: Navigating to: ${targetUrl}`);

    // 1. Navigate without waiting for networkidle0 (which hangs on Next.js dev websockets)
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 2. Explicitly wait for the React loading spinner to vanish (fail-safe wrapper)
    try {
      await page.waitForFunction(() => {
        const text = document.body ? document.body.innerText : '';
        return !text.includes('SYNTHESIZING GALA DATA') && !text.includes('Loading Squad Analytics');
      }, { timeout: 15000 });
    } catch (waitErr) {
      console.log("Warning: Loading screen didn't clear, forcing diagnostic snapshot...");
    }

    // 3. Give React and Recharts 3 solid seconds to fetch DB data and animate charts
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Generate the PDF (Puppeteer automatically applies @media print CSS!)
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
    });

    await browser.close();

    // Stream the PDF back to the client for download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report.pdf"`);

    // Puppeteer 24+ returns a Uint8Array. Convert to Node Buffer and use res.end()
    // to prevent Next.js from stringifying it into JSON text.
    const binaryPdf = Buffer.from(pdfBuffer);
    res.end(binaryPdf);

  } catch (error) {
    console.error('API: PDF Export Failed:', error);
    return res.status(500).json({ error: error.message });
  }
}
