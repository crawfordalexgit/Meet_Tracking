import { getServiceSupabase } from '../../lib/supabase';
import * as cheerio from 'cheerio';
import { extractSwimId, fetchSplits } from '../../lib/rankings-scraper';
import { reconcilePbs } from '../../lib/reconcile-pbs';
import { requireAuth } from '../../lib/api-auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!await requireAuth(req, res)) return;

  // meetCode: scrape a single meet only. limit: cap the number of meets processed.
  // Both exist so the scrape can be run in chunks on serverless hosts (Vercel)
  // where a full scrape exceeds the function timeout — run the full scrape locally,
  // or call this repeatedly with meetCode/limit in production.
  const { swimmingYear = '2025/2026', targetClub = 'TONSKNTQ', meetCode = null, limit = null } = req.body;
  const isPartialScrape = Boolean(meetCode || limit);

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.write(': ' + ' '.repeat(2048) + '\n\n');

  const sendProgress = (message, progress = 0, isDone = false, error = null) => {
    res.write(`data: ${JSON.stringify({ message, progress, isDone, error })}\n\n`);
    if (res.flush) res.flush();
  };

  try {
    const supabase = getServiceSupabase();

    sendProgress('Parsing swimming year...', 5);
    const yearsToScrape = swimmingYear.split(/[-/]/).map(y => parseInt(y.trim()));
    const startYear = yearsToScrape[0];
    const endYear = yearsToScrape.length > 1 ? yearsToScrape[1] : startYear;

    const startDate = new Date(`${startYear}-09-01`);
    const endDate = new Date(`${endYear}-08-31`);

    if (startYear === endYear) {
      startDate.setFullYear(startYear - 1);
      endDate.setFullYear(startYear + 1);
    }

    const meetsMetadata = [];

    sendProgress('Fetching meets list from SE...', 10);
    for (let targetYear = startYear; targetYear <= endYear; targetYear++) {
      let page = 1;
      let hasMorePages = true;

      while (hasMorePages) {
        sendProgress(`Searching for meets in ${targetYear} (Page ${page})...`, 15);
        const listUrl = `https://www.swimmingresults.org/showmeetsbyclub/index.php?targetyear=${targetYear}&masters=0&pgm=1&page=${page}&targetclub=${targetClub}`;
        const listResponse = await fetch(listUrl);
        const listHtml = await listResponse.text();
        const $list = cheerio.load(listHtml);

        let foundMeetsOnPage = 0;
        let newMeetsOnPage = 0;

        $list('#rankTable tr, table tr').each((i, el) => {
          const link = $list(el).find('a[href*="meetcode="]');
          const href = link.attr('href');

          if (href) {
            const urlParams = new URLSearchParams(href.split('?')[1]);
            const meetcode = urlParams.get('meetcode');
            const licenseText = link.text().trim();

            const tds = $list(el).find('td');
            if (tds.length < 4) return;

            const meetName = tds.eq(0).text().trim();
            const dateStr = tds.eq(3).text().trim();
            const courseText = tds.eq(4).text().trim().toUpperCase();
            const levelText = tds.eq(6).text().trim().toUpperCase();

            let course = null;
            if (courseText.includes('LC')) course = 'LC';
            else if (courseText.includes('SC')) course = 'SC';

            let level = null;
            if (levelText && levelText !== '—') {
              level = levelText.startsWith('L') ? levelText : 'L' + levelText;
            }

            if (meetcode && !meetsMetadata.find(m => m.meet_code === meetcode)) {
              foundMeetsOnPage++;
              newMeetsOnPage++;
              meetsMetadata.push({
                meet_code: meetcode,
                license: licenseText,
                name: meetName || `Meet ${meetcode}`,
                year: targetYear,
                date: formatDate(dateStr),
                level,
                course
              });
            }
          }
        });

        if (foundMeetsOnPage > 0 && newMeetsOnPage > 0 && page < 100) {
          page++;
        } else {
          hasMorePages = false;
        }
      }
    }

    let meetsToProcess = meetsMetadata;
    if (meetCode) {
      meetsToProcess = meetsToProcess.filter(m => m.meet_code === String(meetCode));
    }
    if (limit) {
      meetsToProcess = meetsToProcess.slice(0, parseInt(limit, 10) || meetsToProcess.length);
    }

    if (meetsToProcess.length === 0) {
      sendProgress(meetCode ? `Meet ${meetCode} not found in ${swimmingYear}.` : 'No meets found.', 100, true);
      return res.end();
    }

    sendProgress(`Found ${meetsToProcess.length} meets. Scraping results (only storing meets with Tonbridge results)...`, 30);

    const { data: currentSwimmers } = await supabase.from('swimmers').select('id, full_name, member_id');
    const swimmerMap = {};
    const nameMap = {};
    if (currentSwimmers) {
      currentSwimmers.forEach(s => {
        if (s.member_id) swimmerMap[s.member_id] = s.id;
        nameMap[s.full_name.toLowerCase()] = s.id;
      });
    }

    let totalResultsScraped = 0;
    let meetsWithResults = 0;
    const meetCodesWithResults = [];
    const failedMeets = [];

    const concurrency = 4;
    const meetsQueue = [...meetsToProcess];
    let processedCount = 0;

    const runWorker = async () => {
      while (meetsQueue.length > 0) {
        const meetMeta = meetsQueue.shift();
        if (!meetMeta) continue;

        processedCount++;
        const progressPercent = 35 + Math.min(58, Math.round((processedCount / meetsToProcess.length) * 58));
        sendProgress(`Scraping results for: ${meetMeta.name}...`, progressPercent);

        try {
          const resultsToInsert = [];

          let resultPage = 1;
          let hasMoreResultPages = true;
          while (hasMoreResultPages) {
            const meetUrl = `https://www.swimmingresults.org/showmeetsbyclub/index.php?targetyear=${meetMeta.year}&masters=0&pgm=1&meetcode=${meetMeta.meet_code}&targetclub=${targetClub}&page=${resultPage}`;
            const meetResponse = await fetch(meetUrl);
            const meetHtml = await meetResponse.text();
            const $meet = cheerio.load(meetHtml);

            let rowsFoundOnPage = 0;

            $meet('tr').each((j, el) => {
              const tds = $meet(el).find('td');
              if (tds.length >= 9) {
                const seId = $meet(tds[0]).text().trim();
                const swimmerName = $meet(tds[1]).text().trim();
                const event = $meet(tds[5]).text().trim();
                const dateStr = $meet(tds[3]).text().trim();
                const time = $meet(tds[7]).text().trim();
                const waPts = parseInt($meet(tds[8]).text().trim()) || 0;

                if (seId.toLowerCase().includes('reg') || event.toLowerCase().includes('event')) return;

                let swimmerId = swimmerMap[seId] || nameMap[swimmerName.toLowerCase()];
                if (swimmerId) {
                  rowsFoundOnPage++;
                  const timeLink = $meet(tds[7]).find('a').attr('href') || '';
                  const swimId = extractSwimId(timeLink);
                  resultsToInsert.push({
                    swimmer_id: swimmerId,
                    event,
                    time,
                    wa_pts: waPts,
                    date: formatDate(dateStr) || meetMeta.date,
                    swimId
                  });
                }
              }
            });

            if (rowsFoundOnPage > 0 && resultPage < 50) {
              resultPage++;
            } else {
              hasMoreResultPages = false;
            }
          }

          // Only write to DB if Tonbridge swimmers found
          if (resultsToInsert.length > 0) {
            // Upsert just this meet to get its DB ID
            const { data: upsertedMeet, error: meetError } = await supabase
              .from('meets')
              .upsert([meetMeta], { onConflict: 'meet_code' })
              .select()
              .single();

            if (meetError || !upsertedMeet) {
              console.error(`Failed to upsert meet ${meetMeta.name}:`, meetError);
              failedMeets.push({ name: meetMeta.name, error: `meet upsert failed: ${meetError?.message || 'no row returned'}` });
              continue;
            }

            const meetId = upsertedMeet.id;
            meetsWithResults++;
            meetCodesWithResults.push(meetMeta.meet_code);

            const resultsWithSplits = [];
            for (const res of resultsToInsert) {
              let splits = null;
              if (res.swimId) {
                splits = await fetchSplits(res.swimId);
                await new Promise(r => setTimeout(r, 50));
              }
              resultsWithSplits.push({
                swimmer_id: res.swimmer_id,
                meet_id: meetId,
                event: res.event,
                time: res.time,
                wa_pts: res.wa_pts,
                date: res.date,
                splits,
                course: meetMeta.course
              });
            }

            await supabase.from('results').delete().eq('meet_id', meetId);
            const { error: resultsError } = await supabase.from('results').insert(resultsWithSplits);
            if (resultsError) {
              console.error(`Failed to insert results for ${meetMeta.name}:`, resultsError);
              failedMeets.push({ name: meetMeta.name, error: `results insert failed: ${resultsError.message}` });
              sendProgress(`⚠ Results insert failed for ${meetMeta.name}: ${resultsError.message}`, progressPercent);
            } else {
              totalResultsScraped += resultsWithSplits.length;
            }
          }
        } catch (err) {
          console.error(`Error scraping results for ${meetMeta.name}:`, err);
          failedMeets.push({ name: meetMeta.name, error: err.message });
          sendProgress(`⚠ Scrape failed for ${meetMeta.name}: ${err.message}`, progressPercent);
        }
      }
    };

    const workers = Array(concurrency).fill(null).map(() => runWorker());
    await Promise.all(workers);

    // Cleanup: delete auto-scraped meets in this date range that produced no results
    // Only delete meets without manual data (no pdf_text, no pdf_url) to protect dashboard meets
    // Skipped for partial scrapes (meetCode/limit): meets outside the chunk would
    // look orphaned and get deleted even though other chunks cover them.
    if (!isPartialScrape && meetCodesWithResults.length > 0) {
      sendProgress('Cleaning up orphaned meets...', 95);
      const rangeStart = `${startYear}-09-01`;
      const rangeEnd = `${endYear}-08-31`;

      const { data: orphans } = await supabase
        .from('meets')
        .select('id, meet_code')
        .gte('date', rangeStart)
        .lte('date', rangeEnd)
        .is('pdf_text', null)
        .is('pdf_url', null)
        .not('meet_code', 'in', `(${meetCodesWithResults.map(c => `"${c}"`).join(',')})`);

      if (orphans && orphans.length > 0) {
        const orphanIds = orphans.map(o => o.id);
        await supabase.from('meets').delete().in('id', orphanIds);
        sendProgress(`Removed ${orphans.length} orphaned meets.`, 97);
      }
    }

    if (totalResultsScraped > 0) {
      sendProgress('Reconciling PBs...', 98);
      try {
        await reconcilePbs(supabase);
      } catch (err) {
        console.error('PB reconciliation failed after scrape:', err);
        failedMeets.push({ name: 'PB reconciliation', error: err.message });
      }
    }

    let summary = `Done! ${meetsWithResults} meets with Tonbridge results, ${totalResultsScraped} individual results imported.`;
    if (failedMeets.length > 0) {
      const detail = failedMeets.map(f => `${f.name} (${f.error})`).join('; ');
      summary += ` ${failedMeets.length} failure(s): ${detail}`;
    }
    sendProgress(summary, 100, true, failedMeets.length > 0 ? `${failedMeets.length} meet(s) failed` : null);
    res.end();

  } catch (error) {
    console.error('Meet Scrape Error:', error);
    sendProgress('Error during scrape', 0, true, error.message);
    res.end();
  }
}

function formatDate(ukDateStr) {
  if (!ukDateStr || !ukDateStr.includes('/')) return null;
  const parts = ukDateStr.split('/');
  if (parts.length !== 3) return null;
  let [day, month, year] = parts;
  if (year.length === 2) {
    const y = parseInt(year);
    year = y > 50 ? '19' + year : '20' + year;
  }
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}
