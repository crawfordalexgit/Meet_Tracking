import * as cheerio from 'cheerio';

/**
 * Fetches and parses race splits for a given swimid.
 * @param {string} swimid - The unique ID from the swimmingresults.org split link.
 * @returns {Promise<Object|null>} - An object with distances as keys and {cumulative, incremental} as values.
 */
export async function fetchSplits(swimid) {
  if (!swimid) return null;
  
  const url = `https://www.swimmingresults.org/splits/?swimid=${swimid}`;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) return null;
    
    const html = await response.text();
    const $ = cheerio.load(html);
    const splits = {};
    
    // The splits are in a table with id="rankTable"
    $('#rankTable tr').each((i, row) => {
      const tds = $(row).find('td');
      if (tds.length >= 2) {
        const distance = $(tds[0]).text().trim();
        const cumulative = $(tds[1]).text().trim();
        const incremental = tds.length >= 3 ? $(tds[2]).text().trim() : null;
        
        if (distance && cumulative && distance !== 'Distance') {
          splits[distance] = {
            cumulative,
            incremental: incremental || null
          };
        }
      }
    });
    
    return Object.keys(splits).length > 0 ? splits : null;
  } catch (err) {
    console.error(`Error fetching splits for swimid ${swimid}:`, err.message);
    return null;
  }
}

/**
 * Extracts swimid from a typical rankings link.
 * @param {string} href - The link href.
 * @returns {string|null}
 */
export function extractSwimId(href) {
  if (!href) return null;
  const match = href.match(/swimid=(\d+)/);
  return match ? match[1] : null;
}
