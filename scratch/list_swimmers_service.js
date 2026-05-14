const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://yqqugfrargznnknfseuy.supabase.co';
const SUPABASE_SERVICE_KEY = 'sb_secret_aBHF0dgBiqVvfv8D4r5kcQ_-HKcxHkH';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function listAllSwimmers() {
    try {
        const { data: swimmers, error: sError } = await supabase.from('swimmers').select('full_name').limit(10);
        if (sError) throw sError;
        console.log("First 10 swimmers:", swimmers);
    } catch (err) {
        console.error(err);
    }
}

listAllSwimmers();
