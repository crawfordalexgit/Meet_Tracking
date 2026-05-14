const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://yqqugfrargznnknfseuy.supabase.co';
const SUPABASE_SERVICE_KEY = 'sb_secret_aBHF0dgBiqVvfv8D4r5kcQ_-HKcxHkH';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function searchKieran() {
    try {
        const { data: swimmers, error: sError } = await supabase.from('swimmers').select('*').ilike('full_name', '%Crawford%');
        if (sError) throw sError;
        console.log("Matching Crawfords:", swimmers);
    } catch (err) {
        console.error(err);
    }
}

searchKieran();
