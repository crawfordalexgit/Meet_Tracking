import { getServiceSupabase } from '../../lib/supabase';
import * as cheerio from 'cheerio';
import { extractSwimId, fetchSplits } from '../../lib/rankings-scraper';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { swimmingYear = '2025/2026', targetClub = 'TONSKNTQ' } = req.body;

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
    
    // If it's a single year (e.g. 2026), just cover that year
    if (startYear === endYear) {
      startDate.setFullYear(startYear - 1); // Go back one year to be safe
      endDate.setFullYear(startYear + 1);
    }

    const meets = [];
    
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
        
        // The list page uses #rankTable
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
            
            // Detect course (SC/LC)
            let course = null;
            if (courseText.includes('LC')) course = 'LC';
            else if (courseText.includes('SC')) course = 'SC';
            
            // Detect level (L1, L2, L3, L4)
            let level = null;
            if (levelText && levelText !== '—') {
              level = levelText.startsWith('L') ? levelText : 'L' + levelText;
            }

            if (meetcode && !meets.find(m => m.meet_code === meetcode)) {
              foundMeetsOnPage++;
              newMeetsOnPage++;
              meets.push({
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
        
        if (foundMeetsOnPage > 0 && newMeetsOnPage > 0 && page < 20) {
          page++;
        } else {
          hasMorePages = false;
        }
      }
    }

    if (meets.length === 0) {
      sendProgress('No meets found.', 100, true);
      return res.end();
    }

    sendProgress(`Updating ${meets.length} meets in database...`, 30);
    const { data: insertedMeets, error: meetsError } = await supabase
      .from('meets')
      .upsert(meets, { onConflict: 'meet_code' })
      .select();

    if (meetsError) throw meetsError;

    // 2. Scrape results for each meet
    let totalResultsScraped = 0;
    
    const { data: currentSwimmers } = await supabase.from('swimmers').select('id, full_name, member_id');
    const swimmerMap = {};
    const nameMap = {};
    if (currentSwimmers) {
      currentSwimmers.forEach(s => {
        if (s.member_id) swimmerMap[s.member_id] = s.id;
        nameMap[s.full_name.toLowerCase()] = s.id;
      });
    }

    for (let i = 0; i < insertedMeets.length; i++) {
      const meet = insertedMeets[i];
      const progressPercent = 35 + Math.round(((i + 1) / insertedMeets.length) * 60);
      sendProgress(`Scraping results for: ${meet.name}...`, progressPercent);

      const meetUrl = `https://www.swimmingresults.org/showmeetsbyclub/index.php?targetyear=${meet.year}&masters=0&pgm=1&meetcode=${meet.meet_code}&targetclub=${targetClub}`;
      const meetResponse = await fetch(meetUrl);
      const meetHtml = await meetResponse.text();
      const $meet = cheerio.load(meetHtml);

      // We use the course from the meet record
      const course = meet.course;
      
      const resultsToInsert = [];
      let totalRows = 0;
      let matches = 0;

      // Robust table finding: Look for ANY table row that has enough columns
      $meet('tr').each((j, el) => {
        const tds = $meet(el).find('td');
        if (tds.length >= 9) {
          const seId = $meet(tds[0]).text().trim();
          const swimmerName = $meet(tds[1]).text().trim();
          const event = $meet(tds[5]).text().trim();
          const dateStr = $meet(tds[3]).text().trim();
          const time = $meet(tds[7]).text().trim();
          const waPts = parseInt($meet(tds[8]).text().trim()) || 0;

          // Skip headers
          if (seId.toLowerCase().includes('reg') || event.toLowerCase().includes('event')) return;
          
          totalRows++;
          let swimmerId = swimmerMap[seId] || nameMap[swimmerName.toLowerCase()];
          
          if (swimmerId) {
            matches++;
            
            // Look for splits link on the time column
            const timeLink = $meet(tds[7]).find('a').attr('href') || '';
            const swimId = extractSwimId(timeLink);
            
            resultsToInsert.push({
              swimmer_id: swimmerId,
              meet_id: meet.id,
              event,
              time,
              wa_pts: waPts,
              date: formatDate(dateStr) || meet.date,
              swimId // Temporary to fetch splits
            });
          }
        }
      });

      console.log(`MEET SYNC: ${meet.name} - Found ${totalRows} results, matched ${matches} swimmers.`);

      if (resultsToInsert.length > 0) {
        // Fetch splits for results that have a swimId
        const resultsWithSplits = [];
        for (const res of resultsToInsert) {
          let splits = null;
          if (res.swimId) {
            splits = await fetchSplits(res.swimId);
            await new Promise(r => setTimeout(r, 100)); // Polite delay
          }
          
          resultsWithSplits.push({
            swimmer_id: res.swimmer_id,
            meet_id: res.meet_id,
            event: res.event,
            time: res.time,
            wa_pts: res.wa_pts,
            date: res.date,
            splits: splits,
            course: course // Use the course detected for the meet
          });
        }

        await supabase.from('results').delete().eq('meet_id', meet.id);
        const { error: resultsError } = await supabase.from('results').insert(resultsWithSplits);
        if (!resultsError) totalResultsScraped += resultsWithSplits.length;
      }
    }

    sendProgress(`Success! Scraped ${insertedMeets.length} meets and ${totalResultsScraped} individual results.`, 100, true);
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
