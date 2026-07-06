import puppeteerCore from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';
import { requireAuth } from '../../lib/api-auth';

const SAFE_PATH_RE = /^\/[a-zA-Z0-9\-_/[\]?=&.+,% ]*$/;
const ALLOWED_CLIENT_AUTH_KEYS = /^(sb-[a-zA-Z0-9\-]+-auth-token|print-insight-cache|print-report-config)$/;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!await requireAuth(req, res)) return;

    const { targetPath, clientAuth } = req.body;

    if (!targetPath) {
        return res.status(400).json({ error: 'Missing targetPath parameter' });
    }

    let decodedPath;
    try {
        decodedPath = decodeURIComponent(targetPath);
    } catch {
        return res.status(400).json({ error: 'Invalid targetPath encoding' });
    }

    if (!SAFE_PATH_RE.test(decodedPath) || decodedPath.includes('..') || decodedPath.includes('://')) {
        return res.status(400).json({ error: 'Invalid targetPath' });
    }

    let browser = null;

    try {
        // 1. Construct Absolute URL & Auth Bypass (Enforce Rule 5)
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const host = req.headers.host || 'localhost:3000';
        const baseUrl = `${protocol}://${host}`;
        const printToken = process.env.PRINT_SECRET_TOKEN;
        if (!printToken) {
            return res.status(500).json({ error: 'Server misconfigured: PRINT_SECRET_TOKEN is not set' });
        }
        const joinChar = targetPath.includes('?') ? '&' : '?';
        const targetUrl = `${baseUrl}${targetPath}${joinChar}printToken=${printToken}`;

        console.log(`[PDF Engine] Target URL: ${targetUrl}`);

        if (process.env.NODE_ENV === 'production' || process.env.CHROMIUM_EXECUTABLE_PATH) {
            browser = await puppeteerCore.launch({
                args: chromium.args,
                defaultViewport: chromium.defaultViewport,
                executablePath: await chromium.executablePath(process.env.CHROMIUM_EXECUTABLE_PATH),
                headless: chromium.headless,
            });
        } else {
            const puppeteerLocal = await import('puppeteer');
            browser = await puppeteerLocal.default.launch({
                headless: "new",
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
        }

        const page = await browser.newPage();

        // Inject auth tokens into Puppeteer's localStorage so pages pass RLS
        if (clientAuth && typeof clientAuth === 'object') {
            const safeAuth = {};
            for (const key of Object.keys(clientAuth)) {
                if (ALLOWED_CLIENT_AUTH_KEYS.test(key)) safeAuth[key] = clientAuth[key];
            }
            if (Object.keys(safeAuth).length > 0) {
                await page.evaluateOnNewDocument((authData) => {
                    for (const key in authData) {
                        localStorage.setItem(key, authData[key]);
                    }
                }, safeAuth);
            }
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
                   !text.includes('Loading Squad Analytics') &&
                   !text.includes('Loading Sessions...');
        }, { timeout: 15000 }).catch(() => console.log('[PDF Engine] Loading text wait timeout.'));

        // Wait for the main UI components to physically render
        await page.waitForSelector('.glass-card', { visible: true, timeout: 10000 }).catch(() => {});

        // Give Recharts 1.5 seconds to finish drawing their SVG animations
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Ensure all fonts are fully loaded before generating PDF
        try {
            await page.evaluate(() => document.fonts.ready);
        } catch (fontErr) {
            console.log('Warning: Font load wait failed, continuing:', fontErr.message);
        }

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
