const cheerio = require('cheerio');
const fs = require('fs');

async function debug() {
  const url = 'https://www.swimmingresults.org/showmeetsbyclub/index.php?targetyear=2026&masters=0&pgm=1&meetcode=SE260805&targetclub=TONSKNTQ';
  const response = await fetch(url);
  const html = await response.text();
  const $ = cheerio.load(html);
  
  const allText = $('body').text();
  fs.writeFileSync('meet_text_dump.txt', allText);
  console.log('Text dump saved to meet_text_dump.txt');
  
  const courseMarkers = ['long course', 'short course', '25m', '50m', 'l.c.', 's.c.', 'sc', 'lc'];
  courseMarkers.forEach(m => {
    if (allText.toLowerCase().includes(m)) {
      console.log(`Found marker: ${m}`);
    }
  });
}

debug();
