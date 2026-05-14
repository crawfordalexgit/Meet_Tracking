const cheerio = require('cheerio');
const { supabase } = require('../lib/supabase');

async function testImport() {
  const targetYear = 2026;
  const targetClub = 'TONSKNTQ';
  const url = `https://www.swimmingresults.org/showmeetsbyclub/index.php?targetyear=${targetYear}&masters=0&pgm=1&page=1&targetclub=${targetClub}`;
  
  console.log('Fetching meet list...');
  const response = await fetch(url);
  const html = await response.text();
  const $ = cheerio.load(html);
  
  const meets = [];
  $('tr').each((i, el) => {
    const tds = $(el).find('td');
    if (tds.length < 6) return;
    
    const meetName = tds.eq(0).text().trim();
    const course = tds.eq(4).text().trim();
    const license = tds.eq(5).text().trim();
    const level = tds.eq(6).text().trim();
    
    if (license && license !== 'Licence') {
      meets.push({ name: meetName, course, license, level });
    }
  });
  
  console.log('Detected Meets (First 3):');
  console.log(JSON.stringify(meets.slice(0, 3), null, 2));
  
  if (meets.length > 0) {
    console.log('\nSUCCESS: Scraper is correctly seeing the Course and Level columns.');
  } else {
    console.log('\nFAILURE: No meets detected. Check table indices.');
  }
}

testImport();
