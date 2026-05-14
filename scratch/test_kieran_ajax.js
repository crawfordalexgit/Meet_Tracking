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
    const loginGetRes = await fetch('https://app.swimclubmanager.co.uk/login', { headers: commonHeaders });
    let cookies = (loginGetRes.headers.get('set-cookie') || '').split(',').map(c => c.split(';')[0].trim()).join('; ');
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
    const loginPostRes = await fetch('https://app.swimclubmanager.co.uk/login', {
      method: 'POST',
      headers: { ...commonHeaders, 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookies },
      body: params.toString(),
      redirect: 'manual'
    });
    let postSetCookie = loginPostRes.headers.get('set-cookie');
    if (postSetCookie) {
        cookies = `${cookies}; ${postSetCookie.split(',').map(c => c.split(';')[0].trim()).join('; ')}`;
    }
    return cookies;
}

async function testAJAX() {
    try {
        const cookies = await login();
        console.log("Logged in. Requesting Kieran's AJAX attendance...");
        
        const res = await fetch(`https://app.swimclubmanager.co.uk/Users/ajax/users.ashx?action=view-user&tab=attendance&id=536151`, {
            headers: {
                'Cookie': cookies,
                'X-Requested-With': 'XMLHttpRequest',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
        const html = await res.text();
        fs.writeFileSync('kieran_ajax_debug.html', html);
        console.log("AJAX HTML saved to kieran_ajax_debug.html. Length:", html.length);
        
        const cheerio = require('cheerio');
        const $ = cheerio.load(html);
        const rows = $('table tr').length;
        console.log(`Found ${rows} table rows in AJAX response.`);
        
        $('table tr').each((i, el) => {
            if (i < 5) {
                console.log(`Row ${i}:`, $(el).text().trim().replace(/\s+/g, ' '));
            }
        });
    } catch (err) {
        console.error("AJAX Test Error:", err.message);
    }
}

testAJAX();
