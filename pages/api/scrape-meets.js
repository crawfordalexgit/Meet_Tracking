import { getServiceSupabase } from '../../lib/supabase';
import * as cheerio from 'cheerio';

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
  
  // Send 2KB of padding to bypass any proxy buffering (like Nginx or browser-level buffering)
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
      startDate.setMonth(0); startDate.setDate(1);
      endDate.setMonth(11); endDate.setDate(31);
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
        
        $list('#rankTable tr').each((i, el) => {
          const link = $list(el).find('a[href*="meetcode="]');
          const href = link.attr('href');
          
          if (href) {
            const urlParams = new URLSearchParams(href.split('?')[1]);
            const meetcode = urlParams.get('meetcode');
            const licenseText = link.text().trim();
            
            const row = $list(el);
            const tds = row.find('td');
            if (tds.length < 4) return;

            const meetName = tds.eq(0).text().trim();
            const dateStr = tds.eq(3).text().trim();
            
            let meetDate = null;
            if (dateStr && dateStr.includes('/')) {
              const [d, m, y] = dateStr.split('/');
              const fullYear = parseInt(y) > 50 ? 1900 + parseInt(y) : 2000 + parseInt(y);
              meetDate = new Date(`${fullYear}-${m}-${d}`);
            }
            
            if (meetcode) {
              foundMeetsOnPage++;
              
              // Check if we've already seen this meet in this year loop
              if (!meets.find(m => m.meet_code === meetcode)) {
                newMeetsOnPage++;
                
                if (meetDate && meetDate >= startDate && meetDate <= endDate) {
                  meets.push({
                    meet_code: meetcode,
                    license: licenseText,
                    name: meetName || `Meet ${meetcode}`,
                    year: targetYear,
                    date: meetDate.toISOString().split('T')[0]
                  });
                }
              }
            }
          }
        });
        
        // If we found NO new meets on this page, it means the site has looped back to page 1
        if (foundMeetsOnPage > 0 && newMeetsOnPage > 0) {
          page++;
        } else {
          hasMorePages = false;
        }
      }
    }

    if (meets.length === 0) {
      sendProgress('No meets found for this year.', 100, true);
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
    
    sendProgress('Fetching swimmer registry...', 35);
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

      const resultsToInsert = [];
      $meet('#rankTable tr').each((j, el) => {
        if (j === 0) return;
        const tds = $meet(el).find('td');
        if (tds.length >= 9) {
          const seId = $meet(tds[0]).text().trim();
          const swimmerName = $meet(tds[1]).text().trim();
          const event = $meet(tds[5]).text().trim();
          const time = $meet(tds[7]).text().trim();
          const waPtsStr = $meet(tds[8]).text().trim();
          const waPts = parseInt(waPtsStr) || 0;
          
          let swimmerId = swimmerMap[seId] || nameMap[swimmerName.toLowerCase()];
          
          if (swimmerId) {
            resultsToInsert.push({
              swimmer_id: swimmerId,
              meet_id: meet.id,
              event,
              time,
              wa_pts: waPts
            });
          }
        }
      });

      if (resultsToInsert.length > 0) {
        await supabase.from('results').delete().eq('meet_id', meet.id);
        const { error: resultsError } = await supabase.from('results').insert(resultsToInsert);
        if (!resultsError) totalResultsScraped += resultsToInsert.length;
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
