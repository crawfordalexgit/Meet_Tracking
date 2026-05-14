const fs = require('fs');
const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    if (line && line.includes('=')) {
        const [key, ...rest] = line.split('=');
        env[key.trim()] = rest.join('=').trim().replace(/^"|"$/g, '');
    }
});

async function check() {
    const headers = {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
    };
    
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/training_attendance?select=count`, { 
        headers: { ...headers, 'Prefer': 'count=exact' } 
    });
    console.log("Attendance Row Count:", res.headers.get('content-range'));
}

check().catch(console.error);
