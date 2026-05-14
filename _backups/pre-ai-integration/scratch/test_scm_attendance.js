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

async function testAttendance() {
    const username = env.SCM_WEB_USERNAME;
    const password = env.SCM_WEB_PASSWORD;

    const loginGetRes = await fetch('https://app.swimclubmanager.co.uk/login');
    const loginHtml = await loginGetRes.text();
    const rawCookies = loginGetRes.headers.get('set-cookie') || '';
    let cookies = rawCookies.split(', ').map(c => c.split(';')[0]).join('; ');

    const $ = cheerio.load(loginHtml);
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
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookies },
        body: params.toString(),
        redirect: 'manual'
    });

    const authCookiesRaw = loginPostRes.headers.get('set-cookie') || '';
    cookies = `${cookies}; ${authCookiesRaw.split(',').map(c => c.split(';')[0]).join('; ')}`;

    // Try to visit the user page first to ensure the session is active for that user's context
    await fetch('https://app.swimclubmanager.co.uk/Users/User.aspx?id=543698', { headers: { 'Cookie': cookies } });

    // Try the attendance endpoint again, maybe the name is different
    const attendanceUrl = 'https://app.swimclubmanager.co.uk/Users/data-tables/user-attendance.ashx?id=543698&sEcho=1&iDisplayStart=0&iDisplayLength=100';
    
    const res = await fetch(attendanceUrl, { headers: { 'Cookie': cookies } });
    const text = await res.text();
    fs.writeFileSync('scratch/attendance_error.html', text);
    console.log("Saved response to scratch/attendance_error.html");
}

testAttendance().catch(console.error);
