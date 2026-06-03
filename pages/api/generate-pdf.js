import puppeteer from 'puppeteer';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { targetPath, clientAuth } = req.body;

    if (!targetPath) {
        return res.status(400).json({ error: 'Missing targetPath parameter' });
    }

    let browser = null;

    try {
        // 1. Construct Absolute URL & Auth Bypass (Enforce Rule 5)
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const host = req.headers.host || 'localhost:3000';
        const baseUrl = `${protocol}://${host}`;
        const printToken = process.env.PRINT_SECRET_TOKEN || 'print-dev-token-fallback';
        const joinChar = targetPath.includes('?') ? '&' : '?';
        const targetUrl = `${baseUrl}${targetPath}${joinChar}printToken=${printToken}`;

        console.log(`[PDF Engine] Target URL: ${targetUrl}`);

        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();

        // CRITICAL FIX: Inject the active auth token into Puppeteer's localStorage so it passes RLS
        if (clientAuth) {
            await page.evaluateOnNewDocument((authData) => {
                for (const key in authData) {
                    localStorage.setItem(key, authData[key]);
                }
            }, clientAuth);
        }

        // 2. Navigate (with dev HMR safety)
        await page.goto(targetUrl, {
            waitUntil: process.env.NODE_ENV === 'development' ? 'networkidle2' : 'networkidle0',
            timeout: 30000
        });

        console.log('[PDF Engine] Waiting for React to fetch data...');
        
        // 3. STRICT WAIT: Wait for the specific loading text to disappear
        await page.waitForFunction(() => {
            const text = document.body.innerText || '';
            return !text.includes('Loading Athlete Profile') && 
                   !text.includes('SYNTHESIZING GALA DATA') &&
                   !text.includes('Loading Squad Analytics');
        }, { timeout: 15000 }).catch(() => console.log('[PDF Engine] Loading text wait timeout.'));

        // Wait for the main UI components to physically render
        await page.waitForSelector('.glass-card', { visible: true, timeout: 10000 }).catch(() => {});

        // Give Recharts 1.5 seconds to finish drawing their SVG animations
        await new Promise(resolve => setTimeout(resolve, 1500));

        // 4. Emulate Print Styles
        await page.emulateMediaType('print');

        // 5. Generate PDF (Fix for Puppeteer v24+ Uint8Array corruption)
        const rawPdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '0', right: '0', bottom: '0', left: '0' }
        });

        const pdfBuffer = Buffer.from(rawPdf);

        // 6. Return binary payload
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', pdfBuffer.length);
        return res.status(200).end(pdfBuffer);

    } catch (error) {
        console.error('[PDF Engine] Fatal Error:', error);
        return res.status(500).json({ detail: error.message || 'Puppeteer PDF generation failed' });
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}
