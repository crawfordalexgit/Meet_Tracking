const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://yqqugfrargznnknfseuy.supabase.co';
const SUPABASE_SERVICE_KEY = 'sb_secret_aBHF0dgBiqVvfv8D4r5kcQ_-HKcxHkH';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function listSwimmers() {
    try {
        const { data, error } = await supabase.from('swimmers').select('full_name, squad_join_date, squads(name)').order('full_name', {ascending: true});
        if (error) throw error;
        
        console.log('NAME                      | JOIN DATE  | SQUAD');
        console.log('--------------------------|------------|----------------------------');
        data.forEach(sw => {
            const name = sw.full_name.padEnd(25);
            const date = sw.squad_join_date || 'N/A       ';
            const squad = sw.squads?.name || 'No Squad';
            console.log(`${name} | ${date} | ${squad}`);
        });
    } catch (err) {
        console.error(err);
    }
}

listSwimmers();
