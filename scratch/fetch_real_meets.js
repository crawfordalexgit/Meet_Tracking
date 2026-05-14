const { supabase } = require('../lib/supabase');

async function fetchMeets() {
  const { data, error } = await supabase.from('meets').select('meet_code, year, name').limit(10);
  if (error) {
    console.error(error);
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}

fetchMeets();
