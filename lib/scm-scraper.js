import * as cheerio from 'cheerio';

/**
 * Splits a Set-Cookie response header into `name=value` pairs.
 *
 * Splitting the joined header on ',' or ', ' shreds any cookie carrying an
 * Expires attribute ("Expires=Wed, 01 Jan 2027 ..." contains ", "), which made
 * SCM logins fail intermittently depending on which cookies came back.
 * headers.getSetCookie() returns the values already separated; the regex is a
 * fallback that only splits on a comma followed by a new cookie name.
 */
export function parseSetCookie(headers) {
  const values = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : (headers.get('set-cookie') || '').split(/,(?=\s*[^;,\s]+=)/);

  return values
    .map(c => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

/**
 * Parses a UK-format date string (DD/MM/YYYY) into a Date.
 *
 * SCM is a UK application and this module WRITES DD/MM/YYYY to it, but reads
 * were done with bare `new Date(str)`, which applies US MM/DD parsing:
 * "05/06/2026" became 6 May instead of 5 June, and "13/05/2026" was an Invalid
 * Date that the isNaN guard then dropped silently. So days 1-12 were
 * transposed and days 13-31 vanished.
 *
 * Returns null when the string is not a date we recognise.
 */
export function parseUkDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const text = dateStr.trim();

  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const day = parseInt(d, 10);
    const month = parseInt(m, 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const parsed = new Date(y, month - 1, day);
    // Rejects impossible dates that Date would roll over (e.g. 31/02).
    if (parsed.getDate() !== day || parsed.getMonth() !== month - 1) return null;
    return parsed;
  }

  // ISO (YYYY-MM-DD) and textual forms ("5 Jun 2026") are unambiguous.
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const parsed = new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  const fallback = new Date(text);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/** YYYY-MM-DD in local time, matching what the DB stores. */
function toIsoDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function scmLogin(username, password) {
    if (!username || !password) {
        throw new Error('SCM Web credentials not provided');
    }

    // 1. Fetch Login Page
    const loginGetRes = await fetch('https://app.swimclubmanager.co.uk/login');
    const loginHtml = await loginGetRes.text();
    
    // Extract initial cookies
    let cookies = parseSetCookie(loginGetRes.headers);

    const $ = cheerio.load(loginHtml);
    const viewState = $('#__VIEWSTATE').val();
    const viewStateGenerator = $('#__VIEWSTATEGENERATOR').val();
    const eventValidation = $('#__EVENTVALIDATION').val();

    if (!viewState) {
        throw new Error('Failed to find ASP.NET hidden fields on SCM login page');
    }
    // Named explicitly: appending an undefined value posts the literal string
    // "undefined", and the failure then surfaces only as "Login failed".
    const missingFields = [
        !viewStateGenerator && '__VIEWSTATEGENERATOR',
        !eventValidation && '__EVENTVALIDATION',
    ].filter(Boolean);
    if (missingFields.length) {
        throw new Error(`SCM login page is missing expected fields: ${missingFields.join(', ')}. The SCM login form has probably changed.`);
    }

    // 2. Submit Login
    const params = new URLSearchParams();
    params.append('__VIEWSTATE', viewState);
    params.append('__VIEWSTATEGENERATOR', viewStateGenerator);
    params.append('__EVENTVALIDATION', eventValidation);
    params.append('username', username);
    params.append('password', password);
    params.append('stayLoggedIn', 'on');
    params.append('m', '0');

    const loginPostRes = await fetch('https://app.swimclubmanager.co.uk/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': cookies
        },
        body: params.toString(),
        redirect: 'manual'
    });

    if (loginPostRes.status !== 302 && loginPostRes.status !== 301) {
        throw new Error(`SCM Login failed. Check credentials. Status: ${loginPostRes.status}`);
    }

    const authCookies = parseSetCookie(loginPostRes.headers);
    cookies = [cookies, authCookies].filter(Boolean).join('; ');

    return cookies;
}

export async function fetchScmNumericIds(username, password) {
    const cookies = await scmLogin(username, password);

    // 3. Fetch Members JSON
    const ajaxUrl = 'https://app.swimclubmanager.co.uk/Users/data-tables/users.ashx?swimmers=1&parents=0&coaches=0&teachers=0&volunteers=0&inactive=0&sEcho=1&iColumns=7&sColumns=&iDisplayStart=0&iDisplayLength=1000';
    
    const membersRes = await fetch(ajaxUrl, {
        headers: { 'Cookie': cookies }
    });

    if (!membersRes.ok) {
        throw new Error(`Failed to fetch members JSON. Status: ${membersRes.status}`);
    }

    const data = await membersRes.json();
    
    if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Unexpected JSON format from SCM members endpoint');
    }

    // 4. Parse JSON
    const mappings = [];
    for (const row of data.data) {
        const html = row.avatar;
        if (!html) continue;

        // Parse ID
        const idMatch = html.match(/id=(\d+)/);
        const numericId = idMatch ? parseInt(idMatch[1], 10) : null;

        // Parse SE Number (Member ID)
        const seMatch = html.match(/<br \/>\s*(\d+)/);
        const memberId = seMatch ? seMatch[1].trim() : null;

        // Parse Name (Last, First)
        const nameMatch = html.match(/class="user-link">([^<]+)<\/a>/);
        let fullName = null;
        if (nameMatch) {
            const rawName = nameMatch[1].trim(); // "Smith, John"
            const parts = rawName.split(', ');
            if (parts.length === 2) {
                fullName = `${parts[1]} ${parts[0]}`; // "John Smith"
            } else {
                fullName = rawName;
            }
        }

        if (numericId && (memberId || fullName)) {
            mappings.push({
                numericId,
                memberId,
                fullName
            });
        }
    }

    return mappings;
}

export async function fetchSwimmerAttendance(numericId, cookies, dateFrom, dateTo) {
    if (!numericId || !cookies) {
        throw new Error('Numeric ID and cookies are required for attendance sync');
    }

    // Convert date strings to DD/MM/YYYY format for SCM
    const formatDate = (dateStr) => {
        const d = parseUkDate(dateStr);
        if (!d) return dateStr;
        return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
    };

    const scmDateFrom = formatDate(dateFrom);
    const scmDateTo = formatDate(dateTo);

    // The official SCM historical attendance engine
    const url = `https://app.swimclubmanager.co.uk/Users/ajax/attendance.ashx?action=getMemberAttendance&sessionid=0&userid=${numericId}&dateFrom=${encodeURIComponent(scmDateFrom)}&dateTo=${encodeURIComponent(scmDateTo)}&includeParentSwimmers=undefined`;
    
    console.log(`Debug Scrape: Fetching History for ID ${numericId} (${scmDateFrom} - ${scmDateTo})`);

    const res = await fetch(url, {
        headers: {
            'Cookie': cookies,
            'X-Requested-With': 'XMLHttpRequest',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch Historical Attendance for swimmer ${numericId}. Status: ${res.status}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    
    const attendance = [];
    
    // This endpoint returns the table rows directly
    $('tr').each((i, el) => {
        const cols = $(el).find('td');
        if (cols.length >= 3) {
            const dateStr = $(cols[0]).text().trim();
            const sessionNameFull = $(cols[1]).text().trim();
            const attendedText = $(cols[2]).text().trim().toLowerCase();
            
            if (dateStr && sessionNameFull && (attendedText.includes('yes') || attendedText.includes('no'))) {
                // UK DD/MM/YYYY — see parseUkDate. Bare `new Date()` transposed
                // days 1-12 and silently dropped days 13-31.
                const dateObj = parseUkDate(dateStr);
                if (dateObj) {
                    attendance.push({
                        date: toIsoDateString(dateObj),
                        sessionName: sessionNameFull,
                        status: attendedText.includes('yes') ? 'present' : 'absent'
                    });
                } else {
                    console.warn(`SCM attendance: could not parse date "${dateStr}" for session "${sessionNameFull}" — row skipped.`);
                }
            }
        }
    });

    return attendance;
}
export async function fetchSwimmerSquadJoinDate(numericId, squadName, cookies) {
    if (!numericId || !cookies) {
        throw new Error('Numeric ID and cookies are required for join date sync');
    }

    const url = `https://app.swimclubmanager.co.uk/Users/ajax/users.ashx?action=view-user&tab=groups&id=${numericId}`;
    const res = await fetch(url, {
        headers: { 
            'Cookie': cookies,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch Groups tab for swimmer ${numericId}. Status: ${res.status}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    
    // The history is in the second table (index 1)
    const historyTable = $('table').eq(1);
    let joinDate = null;
    
    historyTable.find('tr').each((i, row) => {
        const cols = $(row).find('td');
        if (cols.length >= 4) {
            const dateStr = $(cols[0]).text().trim();
            const group = $(cols[1]).text().trim();
            const detail = $(cols[3]).text().trim(); // "Added" or "Removed"
            
            // If it's the squad we're looking for and it's an "Added" event
            if (group.toLowerCase() === squadName.toLowerCase() && detail.toLowerCase() === 'added') {
                const dateObj = parseUkDate(dateStr); // UK DD/MM/YYYY — see parseUkDate
                if (dateObj) {
                    // We want the most recent "Added" date for this squad
                    joinDate = toIsoDateString(dateObj);
                } else {
                    console.warn(`SCM join date: could not parse date "${dateStr}" — row skipped.`);
                }
            }
        }
    });
    
    return joinDate;
}

export async function fetchSwimmerSessions(numericId, cookies) {
    if (!numericId || !cookies) {
        throw new Error('Numeric ID and cookies are required for session sync');
    }

    const url = `https://app.swimclubmanager.co.uk/Users/ajax/users.ashx?action=view-user&tab=sessions&id=${numericId}`;
    const res = await fetch(url, {
        headers: { 
            'Cookie': cookies,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch Sessions tab for swimmer ${numericId}. Status: ${res.status}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    
    const sessionNames = [];
    
    $('table').find('tr').each((i, row) => {
        const cols = $(row).find('td');
        if (cols.length >= 2) {
            // SCM format: Name column contains the session title
            const sessionName = $(cols[0]).text().trim();
            if (sessionName && sessionName !== 'Name') {
                sessionNames.push(sessionName);
            }
        }
    });
    
    return sessionNames;
}
