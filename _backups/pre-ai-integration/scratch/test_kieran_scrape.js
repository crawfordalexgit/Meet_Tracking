const { fetchSwimmerAttendance } = require('../lib/scm-scraper');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    if (line && line.includes('=')) {
        const [key, ...rest] = line.split('=');
        env[key.trim()] = rest.join('=').trim().replace(/^"|"$/g, '');
    }
});

async function login() {
    const commonHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    console.log("Step 1: Getting login page...");
    const loginGetRes = await fetch('https://app.swimclubmanager.co.uk/login', { headers: commonHeaders });
    let setCookie = loginGetRes.headers.get('set-cookie');
    let cookies = setCookie ? setCookie.split(',').map(c => c.split(';')[0].trim()).join('; ') : '';
    
    const html = await loginGetRes.text();
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    
    const params = new URLSearchParams();
    params.append('__VIEWSTATE', $('#__VIEWSTATE').val() || '');
    params.append('__VIEWSTATEGENERATOR', $('#__VIEWSTATEGENERATOR').val() || '');
    params.append('__EVENTVALIDATION', $('#__EVENTVALIDATION').val() || '');
    params.append('username', env.SCM_WEB_USERNAME);
    params.append('password', env.SCM_WEB_PASSWORD);
    params.append('stayLoggedIn', 'on');
    params.append('m', '0');

    console.log("Step 2: Posting credentials...");
    const loginPostRes = await fetch('https://app.swimclubmanager.co.uk/login', {
      method: 'POST',
      headers: { 
        ...commonHeaders, 
        'Content-Type': 'application/x-www-form-urlencoded', 
        'Cookie': cookies 
      },
      body: params.toString(),
      redirect: 'manual'
    });
    
    let postSetCookie = loginPostRes.headers.get('set-cookie');
    if (postSetCookie) {
        const newCookies = postSetCookie.split(',').map(c => c.split(';')[0].trim()).join('; ');
        cookies = `${cookies}; ${newCookies}`;
    }

    // Follow redirect to home page to confirm login and get final cookies
    const location = loginPostRes.headers.get('location');
    if (location) {
        console.log("Step 3: Following redirect to", location);
        const redirectRes = await fetch(`https://app.swimclubmanager.co.uk${location.startsWith('/') ? '' : '/'}${location}`, {
            headers: { ...commonHeaders, 'Cookie': cookies }
        });
        let redSetCookie = redirectRes.headers.get('set-cookie');
        if (redSetCookie) {
            cookies = `${cookies}; ${redSetCookie.split(',').map(c => c.split(';')[0].trim()).join('; ')}`;
        }
    }

    return cookies;
}

async function testKieran() {
    try {
        const cookies = await login();
        console.log("Login successful. Cookies captured.");
        
        console.log("Fetching Kieran's profile (536151)...");
        const profileRes = await fetch(`https://app.swimclubmanager.co.uk/Users/User.aspx?id=536151`, {
            headers: { 
                'Cookie': cookies,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
        const html = await profileRes.text();
        fs.writeFileSync('kieran_profile_debug.html', html);
        
        if (html.includes('Login to SwimClub Manager')) {
            console.error("FAILED: Still getting login page. SCM rejected the session.");
            return;
        }

        console.log("Profile page loaded successfully!");
        const attendance = await fetchSwimmerAttendance('536151', cookies, '01 Sep 2023', '13 May 2024');
        console.log(`Found ${attendance.length} records for Kieran.`);
        if (attendance.length > 0) {
            console.log("Sample records:");
            console.log(attendance.slice(0, 5));
        } else {
            console.log("No table records found in HTML. Inspecting for AJAX placeholders...");
            const cheerio = require('cheerio');
            const $ = cheerio.load(html);
            console.log("Tabs found:");
            $('.nav-tabs a').each((i, el) => console.log(`- ${$(el).text().trim()}`));
            console.log("Searching for 'attendance' keyword in scripts...");
            $('script').each((i, el) => {
                const text = $(el).html() || '';
                if (text.toLowerCase().includes('attendance')) {
                    console.log(`- Script ${i} contains 'attendance'`);
                }
            });
        }
    } catch (err) {
        console.error("Test Error:", err.message);
    }
}

testKieran();
