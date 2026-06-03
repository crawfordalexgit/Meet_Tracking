import puppeteer from 'puppeteer';
import { getServiceSupabase } from '../../../lib/supabase';
import { parseResults } from '../../../lib/ai_engine';
import { normalizeName, normalizeEvent, generateNameAliases } from '../../../lib/analytics-utils';
import { calculateWAPoints } from '../../../lib/wa-points';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PDFExtract } from 'pdf.js-extract';

const pdfExtract = new PDFExtract();

export const config = {
  api: {
    bodyParser: { sizeLimit: '10mb' },
    responseLimit: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url, meetId } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  console.log(`>>> SCRAPER API: Received request for Meet ID: ${meetId}`);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
  });

  const sendProgress = (status, progress, detail = '') => {
    res.write(`data: ${JSON.stringify({ status, progress, detail })}\n\n`);
  };

  const scrapeLog = [];
  const log = (msg) => {
    console.log(msg);
    scrapeLog.push(`${new Date().toISOString()}: ${msg}`);
  };

  log(`>>> DEEP SCRAPER: Starting for ${url}`);
  sendProgress('Starting Scraper', 5, 'Initializing browser...');

  let browser;
  try {
    const supabase = getServiceSupabase();
    const { data: meet } = await supabase.from('meets').select('*').eq('id', meetId).single();
    if (!meet) throw new Error(`Meet not found for ID: ${meetId}`);

    const meetDate = meet.date ? new Date(meet.date) : null;
    log(`>>> DEEP SCRAPER: Target Meet: ${meet.name} (${meet.id}) - Date: ${meet.date}`);

    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    sendProgress('Navigating', 10, `Visiting landing page...`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    const meetYear = meet.year || new Date(meet.date).getFullYear();
    const links = await page.evaluate((year) => {
      return Array.from(document.querySelectorAll('a'))
        .map(a => ({ href: a.href, text: a.innerText.trim() }))
        .filter(l => {
          const isResult = l.href && (l.href.endsWith('.pdf') || l.href.includes('results') || l.href.includes('session'));
          if (!isResult) return false;
          
          // Year Filtering: Allow if no year specified or if it matches meet year
          const yearsInLink = (l.text + l.href).match(/20\d{2}/g);
          if (yearsInLink && !yearsInLink.includes(year.toString())) return false;
          
          return true;
        });
    }, meetYear);

    log(`>>> DEEP SCRAPER: Found ${links.length} potential results links.`);

    let aggregatedText = "";
    const landingText = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script, style, nav, footer');
      scripts.forEach(s => s.remove());
      return document.body.innerText;
    });
    aggregatedText += landingText + "\n\n";

    // Prioritize sessions containing "Final"
    const prioritizedLinks = links.sort((a, b) => {
      const aFinal = /final|results/i.test(a.text) ? 1 : 0;
      const bFinal = /final|results/i.test(b.text) ? 1 : 0;
      return bFinal - aFinal;
    });

    const { data: swimmers } = await supabase.from('swimmers').select('id, full_name, gender, legal_first_name, known_as');
    const normalizedSwimmers = swimmers.map(s => {
      const aliases = generateNameAliases(s);
      const nameParts = s.full_name?.split(',') || [];
      const lastName = (nameParts[0] || s.full_name?.split(' ').pop() || '').trim().toLowerCase();
      return { 
        ...s, 
        aliases,
        lastName
      };
    });

    for (let i = 0; i < prioritizedLinks.length; i++) {
      const link = prioritizedLinks[i];
      const progress = 15 + Math.round((i / prioritizedLinks.length) * 45);
      sendProgress('Scanning Sessions', progress, `Auditing: ${link.text || 'Untitled Session'}`);
      
      try {
        let sessionText = "";
        if (link.href.endsWith('.pdf')) {
          log(`>>> DEEP SCRAPER: Downloading PDF: ${link.href}`);
          const response = await fetch(link.href);
          const buffer = await response.arrayBuffer();
          const tempPath = path.join(os.tmpdir(), `scrape_${Date.now()}.pdf`);
          fs.writeFileSync(tempPath, Buffer.from(buffer));
          const data = await pdfExtract.extract(tempPath, {});
          sessionText = data.pages.map(p => p.content.map(c => c.str).join(' ')).join('\n');
          fs.unlinkSync(tempPath);
        } else {
          log(`>>> DEEP SCRAPER: Visiting Sub-page: ${link.href}`);
          const subPage = await browser.newPage();
          await subPage.goto(link.href, { waitUntil: 'networkidle2', timeout: 30000 });
          sessionText = await subPage.evaluate(() => document.body.innerText);
          await subPage.close();
        }

        // 4. Date Filtering: Check if this session matches our meet date
        // 4. Date Filtering: Support Master/Child consolidation
        if (meetDate) {
          // Fetch all valid dates for this meet family (Master + Children)
          const { data: familyMeets } = await supabase
            .from('meets')
            .select('date')
            .or(`id.eq.${meetId},parent_id.eq.${meetId}`);
          
          const validDates = familyMeets ? familyMeets.map(m => m.date).filter(Boolean) : [meet.date];
          
          const getDatesFromText = (text) => {
            const found = [];
            const dmy = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g);
            if (dmy) dmy.forEach(d => {
              const [day, month, year] = d.split('/');
              found.push(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
            });
            const dMonthY = text.match(/\b\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* 20\d{2}\b/gi);
            if (dMonthY) dMonthY.forEach(d => {
              const dt = new Date(d);
              if (!isNaN(dt)) found.push(dt.toISOString().split('T')[0]);
            });
            return [...new Set(found)];
          };

          const allSessionDates = [...getDatesFromText(sessionText.substring(0, 5000)), ...getDatesFromText(link.text)];

          if (allSessionDates.length > 0) {
            // Match against ANY date in the meet family
            const isMatch = allSessionDates.some(d => validDates.includes(d));
            if (!isMatch) {
              log(`>>> DEEP SCRAPER: Skipping session ${link.text} - Date mismatch (Found: ${allSessionDates.join(', ')} vs Family Dates: ${validDates.join(', ')})`);
              continue;
            } else {
              log(`>>> DEEP SCRAPER: Family date match found!`);
            }
          } else {
            log(`>>> DEEP SCRAPER: No dates found in session ${link.text}, proceeding with caution.`);
          }
        }

        // 5. Dynamic Targeting: Check if ANY of our swimmers are in this text
        const hasSwimmer = normalizedSwimmers.some(s => {
          // Check for full name or Last Name + Club context
          const lowerText = sessionText.toLowerCase();
          return lowerText.includes(s.normalized) || 
                 (lowerText.includes(s.lastName) && (lowerText.includes('tonbridge') || lowerText.includes('tsc')));
        });

        if (hasSwimmer || /tonbridge|tsc|tonb|ton /i.test(sessionText)) {
          log(`>>> DEEP SCRAPER: MATCH FOUND in ${link.href}`);
          aggregatedText += `\n\n--- RESULTS FROM ${link.text} (${link.href}) ---\n${sessionText}\n`;
        } else {
          log(`>>> DEEP SCRAPER: No squad matches in ${link.href}`);
        }
      } catch (err) {
        log(`>>> DEEP SCRAPER: ERROR on ${link.href}: ${err.message}`);
      }
    }

    log(`>>> DEEP SCRAPER: Total aggregated text: ${aggregatedText.length} chars.`);

    sendProgress('Persisting Source', 65, 'Updating database...');
    await supabase.from('meets').update({ pdf_text: aggregatedText, results_url: url }).eq('id', meetId);

    sendProgress('Filtering Data', 75, 'Preparing text for AI parser...');
    const allLines = aggregatedText.split('\n');
    const relevantIndices = new Set();
    
    allLines.forEach((line, i) => {
      const lowerLine = line.toLowerCase();
      const hasClub = /tonbridge|tsc|tonb|ton /i.test(lowerLine);
      const hasSwimmer = normalizedSwimmers.some(s => {
        return s.aliases.some(alias => {
          const parts = alias.split(' ');
          return parts.length >= 2 && parts.every(p => p.length > 2 && lowerLine.includes(p));
        });
      });
      if (hasClub || hasSwimmer) {
        for (let j = Math.max(0, i - 15); j <= Math.min(allLines.length - 1, i + 15); j++) relevantIndices.add(j);
      }
    });

    const filteredText = Array.from(relevantIndices).sort((a, b) => a - b).map(idx => allLines[idx]).join('\n');
    fs.writeFileSync(path.join(process.cwd(), 'scratch', 'filtered_text.txt'), filteredText);

    sendProgress('AI Result Parser', 85, 'Extracting rankings (Chunking for large data)...');
    
    // 6. Chunked AI Extraction to avoid quota/limit issues
    const CHUNK_SIZE = 50000; // 50k chars per chunk
    const chunks = [];
    for (let i = 0; i < filteredText.length; i += CHUNK_SIZE) {
      chunks.push(filteredText.substring(i, i + CHUNK_SIZE));
    }

    log(`>>> DEEP SCRAPER: Splitting text into ${chunks.length} chunks for AI.`);
    const allAiResults = [];

    for (let i = 0; i < chunks.length; i++) {
      sendProgress('AI Result Parser', 85 + Math.round((i / chunks.length) * 10), `Processing chunk ${i+1}/${chunks.length}...`);
      // Relax date filtering for AI extraction (scraper already filtered source text by family dates)
      const chunkResults = await parseResults(chunks[i], null);
      if (chunkResults && Array.isArray(chunkResults)) {
        allAiResults.push(...chunkResults);
      }
      if (chunks.length > 1) await new Promise(r => setTimeout(r, 2000));
    }

    fs.writeFileSync(path.join(process.cwd(), 'scratch', 'ai_response.json'), JSON.stringify(allAiResults, null, 2));
    
    sendProgress('Database Sync', 95, 'Merging rankings into ground truth...');
    let resultsSynced = 0;
    if (allAiResults.length > 0) {
      const { data: existingResults } = await supabase.from('results').select('id, swimmer_id, event, time, round, rank').eq('meet_id', meetId);
      
      for (const newRes of allAiResults) {
        const normResName = normalizeName(newRes.swimmer_name);
        
        // Robust Matcher: Try multiple strategies
        const match = normalizedSwimmers.find(s => {
          const resParts = normResName.split(' ');
          const resSet = new Set(resParts);
          
          // 1. Check ALL aliases
          for (const alias of s.aliases) {
            const aliasParts = alias.split(' ');
            const aliasSet = new Set(aliasParts);
            
            // Exact match (set based to handle order variations)
            if (aliasParts.every(p => resSet.has(p)) || resParts.every(p => aliasSet.has(p))) return true;
          }
          
          // 2. Surname + First Name Prefix match (Fallback)
          const resLast = resParts[0]; // Assuming "Last First" format in normResName
          if (s.lastName === resLast && resParts.length > 1) {
             const resFirsts = resParts.slice(1);
             // Match if any alias shares a first name component prefix (min 2 chars)
             return s.aliases.some(alias => {
               const aliasFirsts = alias.split(' ').filter(p => p !== s.lastName);
               return aliasFirsts.some(af => resFirsts.some(rf => {
                 if (af === rf) return true;
                 if (af.length >= 2 && rf.length >= 2 && (af.startsWith(rf) || rf.startsWith(af))) return true;
                 return false;
               }));
             });
          }
          return false;
        });
        
        if (match) {
          log(`>>> DEEP SCRAPER: Swimmer Match! ${newRes.swimmer_name} -> ${match.full_name}`);
          const points = calculateWAPoints(newRes.time, newRes.event, match.gender, meet.course === 'LC' ? 'LCM' : 'SCM');
          
          const normNewEvent = normalizeEvent(newRes.event);
          const normNewRound = (newRes.round || '').toLowerCase();
          
          const existing = existingResults?.find(ex => 
            ex.swimmer_id === match.id && 
            normalizeEvent(ex.event) === normNewEvent &&
            (ex.round || '').toLowerCase() === normNewRound
          );

          if (existing) {
            log(`>>> DEEP SCRAPER: Updating existing record for ${newRes.event} (${newRes.round || 'Heat'})`);
            const { error: upError } = await supabase.from('results').update({ 
              rank: newRes.rank || existing.rank, 
              wa_pts: existing.wa_pts || points 
            }).eq('id', existing.id);
            if (upError) log(`>>> DEEP SCRAPER: UPDATE ERROR: ${upError.message}`);
          } else {
            log(`>>> DEEP SCRAPER: Inserting new record for ${newRes.event} (${newRes.round || 'Heat'})`);
            const { error: insError } = await supabase.from('results').insert({
              swimmer_id: match.id,
              meet_id: meetId,
              event: newRes.event,
              time: newRes.time,
              round: newRes.round,
              rank: newRes.rank,
              wa_pts: points || 0,
              course: meet.course,
              date: meet.date
            });
            if (insError) log(`>>> DEEP SCRAPER: INSERT ERROR: ${insError.message}`);
          }
          resultsSynced++;
        }
      }
    }

    fs.writeFileSync(path.join(process.cwd(), 'scratch', 'scrape_log.txt'), scrapeLog.join('\n'));
    sendProgress('Complete', 100, `Successfully synced ${resultsSynced} records.`);
    res.end();

  } catch (error) {
    log(`>>> DEEP SCRAPER: CRITICAL ERROR: ${error.message}`);
    fs.writeFileSync(path.join(process.cwd(), 'scratch', 'scrape_log.txt'), scrapeLog.join('\n'));
    sendProgress('Error', 0, error.message);
    res.end();
  } finally {
    if (browser) await browser.close();
  }
}
