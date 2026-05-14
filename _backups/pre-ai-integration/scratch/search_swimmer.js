const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://yqqugfrargznnknfseuy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_B5HsIpOIXe2AT6jbACYAQg_1o4bxhu6';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function searchSwimmer() {
    try {
        const { data: swimmers, error: sError } = await supabase.from('swimmers').select('full_name').ilike('full_name', '%Crawford%');
        if (sError) throw sError;
        console.log("Matching swimmers:", swimmers);
    } catch (err) {
        console.error(err);
    }
}

searchSwimmer();
