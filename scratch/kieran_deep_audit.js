const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://yqqugfrargznnknfseuy.supabase.co';
const SUPABASE_SERVICE_KEY = 'sb_secret_aBHF0dgBiqVvfv8D4r5kcQ_-HKcxHkH';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const KID = '2310750a-21c3-4ba9-a480-7eb4bc5df8a9';

async function deepAudit() {
    try {
        const { data: attendance } = await supabase.from('training_attendance').select('*').eq('swimmer_id', KID);
        const now = new Date();
        const start = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000));
        
        const weeks = {};
        attendance.forEach(att => {
            const d = new Date(att.date);
            if (d < start) return;
            const sOfYear = new Date(d.getFullYear(), 0, 1);
            const wNum = Math.ceil(((d - sOfYear) / 86400000 + sOfYear.getDay() + 1) / 7);
            const key = `${d.getFullYear()}-W${wNum}`;
            if (!weeks[key]) weeks[key] = 0;
            if (att.status === 'present') weeks[key]++;
        });

        console.log("\n--- WEEKLY BREAKDOWN (Last 52 Weeks) ---");
        const sorted = Object.entries(weeks).sort((a,b) => b[0].localeCompare(a[0]));
        let activeWeeks = 0;
        let metTarget = 0;
        
        sorted.forEach(([key, count]) => {
            if (count > 0) activeWeeks++;
            if (count >= 4) metTarget++;
            console.log(`${key}: ${count} sessions ${count >= 4 ? '[MET]' : '[FAIL]'}`);
        });

        console.log(`\nTotal Weeks with ANY data: ${activeWeeks}`);
        console.log(`Total Weeks Meeting Target (4+): ${metTarget}`);
        console.log(`Annual Reliability (of 48 swimmable): ${Math.round((metTarget / 48) * 100)}%`);

    } catch (err) { console.error(err); }
}
deepAudit();
