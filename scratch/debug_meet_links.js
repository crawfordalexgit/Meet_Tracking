const cheerio = require('cheerio');

async function debugLinks() {
  const targetClub = 'TONSKNTQ';
  const targetYear = 2025;
  const url = `https://www.swimmingresults.org/showmeetsbyclub/index.php?targetyear=${targetYear}&masters=0&pgm=1&page=1&targetclub=${targetClub}`;
  
  console.log(`Fetching: ${url}`);
  const response = await fetch(url);
  const html = await response.text();
  const $ = cheerio.load(html);
  
  const links = [];
  $('a[href*="meetcode="]').each((i, el) => {
    links.push({
      text: $(el).text().trim(),
      href: $(el).attr('href')
    });
  });
  
  console.log('Found Links:');
  console.log(JSON.stringify(links.slice(0, 5), null, 2));
}

debugLinks();
