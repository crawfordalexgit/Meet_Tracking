const cheerio = require('cheerio');

async function checkPage(p) {
  const res = await fetch(`https://www.swimmingresults.org/showmeetsbyclub/index.php?targetyear=2026&masters=0&pgm=1&page=${p}&targetclub=TONSKNTQ`);
  const text = await res.text();
  const $ = cheerio.load(text);
  const firstMeet = $('#rankTable tr').eq(1).find('td').first().text().trim();
  return firstMeet;
}

(async () => {
  const p1 = await checkPage(1);
  const p2 = await checkPage(2);
  const p50 = await checkPage(50);
  console.log('Page 1 first meet:', p1);
  console.log('Page 2 first meet:', p2);
  console.log('Page 50 first meet:', p50);
})();
