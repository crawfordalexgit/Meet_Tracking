const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://yqqugfrargznnknfseuy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_B5HsIpOIXe2AT6jbACYAQg_1o4bxhu6';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function auditKieran() {
    try {
        const { data: swimmers, error: sError } = await supabase.from('swimmers').select('*, squads(*)').ilike('full_name', '%Kieran Crawford%');
        if (sError) throw sError;
        if (!swimmers || swimmers.length === 0) {
            console.log("Kieran not found");
            return;
        }
        const kieran = swimmers[0];
        console.log(`\n--- AUDIT: ${kieran.full_name} ---`);
        console.log(`Squad: ${kieran.squads?.name}`);
        console.log(`Join Date: ${kieran.squad_join_date}`);
        console.log(`Target: ${kieran.squads?.target_sessions_per_week} sess / ${kieran.squads?.target_hours_per_week} hrs`);

        const { data: attendance, error: aError } = await supabase.from('training_attendance').select('*').eq('swimmer_id', kieran.id);
        if (aError) throw aError;
        
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const joinDate = kieran.squad_join_date ? new Date(kieran.squad_join_date) : new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000));
        
        // Use the same logic as the app
        const effectiveJoinDate = joinDate < new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000)) ? new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000)) : joinDate;
        const daysInSquad = (now - effectiveJoinDate) / (1000 * 60 * 60 * 24);
        const totalWeeks = Math.max(1, Math.floor(daysInSquad / 7));
        
        console.log(`Weeks since join: ${totalWeeks}`);
        console.log(`Total Attendance Records: ${attendance.length}`);

        // Bucket by week
        const weeks = {};
        attendance.forEach(att => {
            const d = new Date(att.date);
            if (d < effectiveJoinDate) return;
            const startOfYear = new Date(d.getFullYear(), 0, 1);
            const pastDays = (d - startOfYear) / 86400000;
            const wNum = Math.ceil((pastDays + startOfYear.getDay() + 1) / 7);
            const key = `${d.getFullYear()}-W${wNum}`;
            if (!weeks[key]) weeks[key] = { sessions: 0, date: att.date };
            if (att.status === 'present') weeks[key].sessions++;
        });

        const targetSess = kieran.squads?.target_sessions_per_week || 0;
        const metWeeks = Object.values(weeks).filter(w => w.sessions >= targetSess).length;
        const pct = Math.round((metWeeks / totalWeeks) * 100);

        console.log(`Weeks hitting target (${targetSess} sess): ${metWeeks}`);
        console.log(`Calculated Reliability: ${pct}%`);
        
        // Output last 5 weeks for visual check
        console.log("\nLast 5 active weeks data:");
        const sortedWeeks = Object.entries(weeks).sort((a,b) => b[0].localeCompare(a[0])).slice(0, 5);
        sortedWeeks.forEach(([key, val]) => {
            console.log(`${key}: ${val.sessions} sessions ${val.sessions >= targetSess ? '(MET)' : '(NOT MET)'}`);
        });
        
    } catch (err) {
        console.error(err);
    }
}

auditKieran();
