const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://yqqugfrargznnknfseuy.supabase.co';
const SUPABASE_SERVICE_KEY = 'sb_secret_aBHF0dgBiqVvfv8D4r5kcQ_-HKcxHkH';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const KID = '2310750a-21c3-4ba9-a480-7eb4bc5df8a9';

async function auditKieran() {
    try {
        const { data: kieran, error: sError } = await supabase.from('swimmers').select('*, squads(*)').eq('id', KID).single();
        if (sError) throw sError;
        
        console.log(`\n--- AUDIT: ${kieran.full_name} ---`);
        console.log(`Squad: ${kieran.squads?.name}`);
        console.log(`Join Date: ${kieran.squad_join_date}`);
        console.log(`Target: ${kieran.squads?.target_sessions_per_week} sess / ${kieran.squads?.target_hours_per_week} hrs`);

        const { data: attendance, error: aError } = await supabase.from('training_attendance').select('*').eq('swimmer_id', KID);
        if (aError) throw aError;
        
        const now = new Date();
        const PROFILE_YEAR_START = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000));
        const joinDate = new Date(kieran.squad_join_date);
        
        const effectiveJoinDate = joinDate < PROFILE_YEAR_START ? PROFILE_YEAR_START : joinDate;
        const daysInSquad = (now - effectiveJoinDate) / (1000 * 60 * 60 * 24);
        const totalWeeks = Math.max(1, Math.floor(daysInSquad / 7));
        
        console.log(`Weeks in squad since Join: ${totalWeeks}`);

        // Bucket by week
        const weeks = {};
        attendance.forEach(att => {
            const d = new Date(att.date);
            if (d < effectiveJoinDate) return;
            const startOfYear = new Date(d.getFullYear(), 0, 1);
            const pastDays = (d - startOfYear) / 86400000;
            const wNum = Math.ceil((pastDays + startOfYear.getDay() + 1) / 7);
            const key = `${d.getFullYear()}-W${wNum}`;
            if (!weeks[key]) weeks[key] = { sessions: 0, dates: [] };
            if (att.status === 'present') {
                weeks[key].sessions++;
                weeks[key].dates.push(att.date);
            }
        });

        const targetSess = kieran.squads?.target_sessions_per_week || 0;
        const metWeeks = Object.keys(weeks).filter(key => weeks[key].sessions >= targetSess).length;
        const pct = Math.round((metWeeks / totalWeeks) * 100);

        console.log(`\nSummary:`);
        console.log(`Total Weeks: ${totalWeeks}`);
        console.log(`Met Weeks (>= ${targetSess} sess): ${metWeeks}`);
        console.log(`Result: ${pct}%`);
        
        console.log(`\nDetailed Weeks:`);
        const sortedKeys = Object.keys(weeks).sort((a,b) => b.localeCompare(a));
        sortedKeys.forEach(key => {
            console.log(`${key}: ${weeks[key].sessions} sessions [${weeks[key].sessions >= targetSess ? 'MET' : 'NOT MET'}] - (${weeks[key].dates.join(', ')})`);
        });

    } catch (err) {
        console.error(err);
    }
}

auditKieran();
