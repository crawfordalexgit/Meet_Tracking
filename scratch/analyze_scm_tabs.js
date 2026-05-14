const cheerio = require('cheerio');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    if (line && line.includes('=')) {
        const [key, ...rest] = line.split('=');
        env[key.trim()] = rest.join('=').trim().replace(/^"|"$/g, '');
    }
});

async function analyze() {
    const username = env.SCM_WEB_USERNAME;
    const password = env.SCM_WEB_PASSWORD;
    const swimmerId = '759211'; 
    
    const commonHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    // Login
    const loginGetRes = await fetch('https://app.swimclubmanager.co.uk/login', { headers: commonHeaders });
    const loginHtml = await loginGetRes.text();
    const $ = cheerio.load(loginHtml);
    let cookies = (loginGetRes.headers.get('set-cookie') || '').split(', ').map(c => c.split(';')[0]).join('; ');
    const params = new URLSearchParams();
    params.append('__VIEWSTATE', $('#__VIEWSTATE').val());
    params.append('__VIEWSTATEGENERATOR', $('#__VIEWSTATEGENERATOR').val());
    params.append('__EVENTVALIDATION', $('#__EVENTVALIDATION').val());
    params.append('username', username);
    params.append('password', password);
    params.append('stayLoggedIn', 'on');
    params.append('m', '0');
    const loginPostRes = await fetch('https://app.swimclubmanager.co.uk/login', {
      method: 'POST',
      headers: { ...commonHeaders, 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookies },
      body: params.toString(),
      redirect: 'manual'
    });
    cookies = `${cookies}; ${(loginPostRes.headers.get('set-cookie') || '').split(', ').map(c => c.split(';')[0]).join('; ')}`;

    // Fetch Profile
    const profileRes = await fetch(`https://app.swimclubmanager.co.uk/Users/view-user?id=${swimmerId}`, {
        headers: { ...commonHeaders, 'Cookie': cookies }
    });
    const html = await profileRes.text();
    const $$ = cheerio.load(html);
    
    console.log("Analyzing page for swimmer:", swimmerId);
    console.log("Page title:", $$('title').text().trim());
    
    // Find all links that look like tab switches
    console.log("Suspicious links:");
    $$('a').each((i, el) => {
        const href = $$(el).attr('href') || '';
        const text = $$(el).text().trim();
        if (href.includes('tab=') || text.toLowerCase().includes('attendance')) {
            console.log(`- Text: "${text}", Href: "${href}"`);
        }
    });

    // Check for any script tags that might contain the AJAX URL
    console.log("Scripts containing 'attendance':");
    $$('script').each((i, el) => {
        const text = $$(el).html() || '';
        if (text.toLowerCase().includes('attendance')) {
            console.log(`- Script ${i} length: ${text.length}`);
            if (text.includes('url')) {
                console.log(`  Snippet: ${text.substring(text.indexOf('url'), text.indexOf('url') + 200)}`);
            }
        }
    });
}

analyze();
