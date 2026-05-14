const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const supabase = createClient('https://yqqugfrargznnknfseuy.supabase.co', 'sb_secret_aBHF0dgBiqVvfv8D4r5kcQ_-HKcxHkH');

async function checkVelocity() {
    const now = new Date();
    const periodDays = 365;
    const halfPeriod = Math.floor(periodDays / 2);
    const velRecentStart = new Date(now - halfPeriod * 86400000);
    const velPriorStart = new Date(now - periodDays * 86400000);

    const { data: squads, error: sqErr } = await supabase.from('squads').select('*').eq('is_squad', true);
    if (sqErr) console.error('Squads Error:', sqErr);
    console.log(`Found ${squads?.length} squads`);

    const { data: swimmers, error: swErr } = await supabase.from('swimmers').select('*');
    if (swErr) console.error('Swimmers Error:', swErr);
    console.log(`Found ${swimmers?.length} swimmers`);

    const { data: results, error: resErr } = await supabase.from('results').select('*').gte('date', velPriorStart.toISOString().split('T')[0]);
    if (resErr) console.error('Results Error:', resErr);
    console.log(`Found ${results?.length} results`);
    if (results?.length) {
        console.log(`Type of wa_pts: ${typeof results[0].wa_pts}`);
        console.log(`Value of wa_pts: ${results[0].wa_pts}`);
    }

    if (!squads) {
        console.log('No squads found');
        return;
    }

    for (const sq of squads) {
        const sqSwimmers = swimmers.filter(s => s.squad_id === sq.id && s.is_active !== false);
        if (!sqSwimmers.length) continue;

        const swIds = new Set(sqSwimmers.filter(s => !s.is_exempt).map(s => s.id));
        const sqResults = results.filter(r => swIds.has(r.swimmer_id));
        
        const recentPts = sqResults.filter(r => new Date(r.date) >= velRecentStart).map(r => r.wa_pts || 0);
        const priorPts = sqResults.filter(r => new Date(r.date) >= velPriorStart && new Date(r.date) < velRecentStart).map(r => r.wa_pts || 0);

        const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
        const velocity = Math.round(avg(recentPts) - avg(priorPts));

        console.log(`Squad: ${sq.name}`);
        console.log(`  Swimmers: ${sqSwimmers.length}`);
        console.log(`  Recent Results: ${recentPts.length}, Avg: ${avg(recentPts).toFixed(1)}`);
        console.log(`  Prior Results: ${priorPts.length}, Avg: ${avg(priorPts).toFixed(1)}`);
        console.log(`  Velocity: ${velocity}`);
    }
}

checkVelocity();
