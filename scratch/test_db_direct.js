
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function testDb() {
    console.log("Checking server-side Supabase connectivity...");
    
    let url = '';
    let key = '';
    try {
        const env = fs.readFileSync('.env.local', 'utf8');
        url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
        key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
    } catch (e) {
        console.error("Could not read credentials from .env.local");
        return;
    }

    const supabase = createClient(url, key);
    
    try {
        const { count, error } = await supabase.from('squads').select('*', { count: 'exact', head: true });
        if (error) throw error;
        console.log(`SUCCESS! Server reached Supabase. Found ${count} squads.`);
    } catch (err) {
        console.error("SERVER-SIDE DB ERROR:", err.message);
        if (err.message.includes('ENOTFOUND')) {
            console.log("Verdict: DNS is STILL blocked for the Node.js server.");
        }
    }
}

testDb();
