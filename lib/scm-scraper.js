import * as cheerio from 'cheerio';

export async function scmLogin(username, password) {
    if (!username || !password) {
        throw new Error('SCM Web credentials not provided');
    }

    // 1. Fetch Login Page
    const loginGetRes = await fetch('https://app.swimclubmanager.co.uk/login');
    const loginHtml = await loginGetRes.text();
    
    // Extract initial cookies
    const rawCookies = loginGetRes.headers.get('set-cookie') || '';
    let cookies = rawCookies.split(', ').map(c => c.split(';')[0]).join('; ');

    const $ = cheerio.load(loginHtml);
    const viewState = $('#__VIEWSTATE').val();
    const viewStateGenerator = $('#__VIEWSTATEGENERATOR').val();
    const eventValidation = $('#__EVENTVALIDATION').val();

    if (!viewState) {
        throw new Error('Failed to find ASP.NET hidden fields on SCM login page');
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

    const authCookiesRaw = loginPostRes.headers.get('set-cookie') || '';
    const authCookies = authCookiesRaw.split(',').map(c => c.split(';')[0]).join('; ');
    cookies = `${cookies}; ${authCookies}`;

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
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
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
                const dateObj = new Date(dateStr);
                if (!isNaN(dateObj.getTime())) {
                    const year = dateObj.getFullYear();
                    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                    const day = String(dateObj.getDate()).padStart(2, '0');
                    attendance.push({
                        date: `${year}-${month}-${day}`,
                        sessionName: sessionNameFull,
                        status: attendedText.includes('yes') ? 'present' : 'absent'
                    });
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
                const dateObj = new Date(dateStr);
                if (!isNaN(dateObj.getTime())) {
                    const year = dateObj.getFullYear();
                    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                    const day = String(dateObj.getDate()).padStart(2, '0');
                    // We want the most recent "Added" date for this squad
                    joinDate = `${year}-${month}-${day}`;
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
