import puppeteerCore from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';
import { requireAuth } from '../../lib/api-auth';
import { getSelfOrigin } from '../../lib/self-origin';
import { isUuid } from '../../lib/validate';

const ALLOWED_STORAGE_KEYS = /^(sb-[a-zA-Z0-9\-]+-auth-token|print-insight-cache|print-report-config)$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!await requireAuth(req, res)) return;

  const { meetId, meetName, type, squadId, storage } = req.body;

  // Both ids are interpolated into the URL Puppeteer loads. Anything other than
  // a UUID can inject an extra path segment, query or fragment and redirect the
  // render — with the caller's session already injected into the page.
  if (meetId != null && !isUuid(meetId)) {
    return res.status(400).json({ error: 'Invalid meetId: expected a UUID' });
  }
  if (squadId != null && !isUuid(squadId)) {
    return res.status(400).json({ error: 'Invalid squadId: expected a UUID' });
  }

  let browser;
  try {
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
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
    const page = await browser.newPage();

    // Inject the user's auth tokens into the headless browser before it loads
    if (storage && typeof storage === 'object') {
      const safeStorage = {};
      for (const key of Object.keys(storage)) {
        if (ALLOWED_STORAGE_KEYS.test(key)) safeStorage[key] = storage[key];
      }
      if (Object.keys(safeStorage).length > 0) {
        await page.evaluateOnNewDocument((store) => {
          for (const key in store) {
            localStorage.setItem(key, store[key]);
          }
        }, safeStorage);
      }
    }

    // Origin comes from server config, never from request headers: the caller's
    // Supabase session (including the refresh token) is injected into whatever
    // origin this page loads, so a forged Host header would exfiltrate it.
    const baseUrl = getSelfOrigin();

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

    // 3. Wait for all <img> tags to finish loading (e.g. meet photo from Supabase Storage).
    //    A 6-second ceiling prevents this from hanging if an image errors or never arrives.
    try {
      await page.evaluate(() => new Promise(resolve => {
        const imgs = Array.from(document.querySelectorAll('img'));
        if (imgs.length === 0) return resolve();
        const pending = imgs.filter(img => !img.complete);
        if (pending.length === 0) return resolve();
        let remaining = pending.length;
        const done = () => { if (--remaining === 0) resolve(); };
        pending.forEach(img => {
          img.addEventListener('load', done);
          img.addEventListener('error', done);
        });
        setTimeout(resolve, 6000); // hard ceiling — don't wait forever
      }));
    } catch (imgErr) {
      console.log('Warning: Image wait failed, continuing:', imgErr.message);
    }

    // 4. Give React and Recharts 4 solid seconds to fetch DB data and animate charts
    await new Promise(resolve => setTimeout(resolve, 4000));

    // Ensure all fonts are fully loaded before generating PDF
    try {
      await page.evaluate(() => document.fonts.ready);
    } catch (fontErr) {
      console.log('Warning: Font load wait failed, continuing:', fontErr.message);
    }

    // Generate the PDF (Puppeteer automatically applies @media print CSS!)
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
    });

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
  } finally {
    // Without this, any failure between launch and close leaks a Chromium
    // process for the lifetime of the warm lambda.
    if (browser) await browser.close().catch(() => {});
  }
}
