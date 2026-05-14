const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://yqqugfrargznnknfseuy.supabase.co';
const SUPABASE_SERVICE_KEY = 'sb_secret_aBHF0dgBiqVvfv8D4r5kcQ_-HKcxHkH';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const KID = '2310750a-21c3-4ba9-a480-7eb4bc5df8a9';

async function auditKieran() {
    try {
        const { data: kieran } = await supabase.from('swimmers').select('*, squads(*)').eq('id', KID).single();
        const { data: attendance } = await supabase.from('training_attendance').select('*').eq('swimmer_id', KID);
        
        const now = new Date();
        const PROFILE_YEAR_START = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000));
        const joinDate = new Date(kieran.squad_join_date);
        const effectiveJoinDate = joinDate < PROFILE_YEAR_START ? PROFILE_YEAR_START : joinDate;
        
        const daysInSquad = (now - effectiveJoinDate) / (1000 * 60 * 60 * 24);
        const totalWeeks = Math.max(1, Math.floor(daysInSquad / 7));
        
        const targetSess = kieran.squads?.target_sessions_per_week || 0;
        
        const workload = {};
        attendance.forEach(att => {
            const d = new Date(att.date);
            if (d < effectiveJoinDate) return;
            const startOfYear = new Date(d.getFullYear(), 0, 1);
            const pastDays = (d - startOfYear) / 86400000;
            const wNum = Math.ceil((pastDays + startOfYear.getDay() + 1) / 7);
            const key = `${d.getFullYear()}-W${wNum}`;
            if (!workload[key]) workload[key] = { sessions: 0 };
            if (att.status === 'present') workload[key].sessions++;
        });

        let metCount = 0;
        for (let i = 0; i < totalWeeks; i++) {
            const weekStart = new Date(effectiveJoinDate.getTime() + (i * 7 * 24 * 60 * 60 * 1000));
            const startOfYear = new Date(weekStart.getFullYear(), 0, 1);
            const pastDays = (weekStart - startOfYear) / 86400000;
            const wNum = Math.ceil((pastDays + startOfYear.getDay() + 1) / 7);
            const key = `${weekStart.getFullYear()}-W${wNum}`;
            
            const w = workload[key];
            if (w && w.sessions >= targetSess) metCount++;
            // Note: This script doesn't account for holidays yet, but it will show if the 62% is plausible
        }

        console.log(`\n--- VERIFICATION RESULT ---`);
        console.log(`Calendar Weeks Since Join: ${totalWeeks}`);
        console.log(`Weeks hitting ${targetSess} sessions: ${metCount}`);
        console.log(`Raw Reliability: ${Math.round((metCount / totalWeeks) * 100)}%`);
        console.log(`---------------------------\n`);

    } catch (err) {
        console.error(err);
    }
}

auditKieran();
