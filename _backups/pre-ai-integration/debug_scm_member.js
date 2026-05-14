/**
 * Debug script to inspect SCM API member record structure.
 * Usage: node debug_scm_member.js YOUR_SCM_API_KEY
 */
const https = require('https');

function apiGet(path, apiKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.swimclubmanager.co.uk',
      path: `/api/${path}`,
      method: 'GET',
      headers: {
        'Authorization': apiKey,
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`JSON parse error: ${body.substring(0, 200)}`)); }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function debugMemberFields() {
  const apiKey = process.argv[2];
  if (!apiKey) {
    console.log("Usage: node debug_scm_member.js YOUR_SCM_API_KEY");
    return;
  }

  try {
    console.log("Fetching members from SCM API...");
    const data = await apiGet('Members?page=1&pageSize=5', apiKey);
    
    // Find the members array
    const members = data.members || data.Members || data.data || (Array.isArray(data) ? data : []);
    
    if (members.length === 0) {
      console.log("No members returned. Raw response keys:", Object.keys(data));
      console.log("First 500 chars:", JSON.stringify(data).substring(0, 500));
      return;
    }

    console.log(`\n=== SCM MEMBER RECORD STRUCTURE ===`);
    console.log(`Total members on page: ${members.length}`);
    console.log(`\n--- ALL FIELD NAMES (from first record) ---`);
    console.log(Object.keys(members[0]).join('\n'));

    // Log first 3 members with all fields
    for (let i = 0; i < Math.min(3, members.length); i++) {
      const m = members[i];
      console.log(`\n--- MEMBER ${i + 1}: ${m.firstname || m.firstName || '?'} ${m.lastname || m.lastName || '?'} ---`);
      
      for (const [key, value] of Object.entries(m)) {
        const keyLower = key.toLowerCase();
        const isDobField = keyLower.includes('date') || keyLower.includes('birth') || keyLower.includes('dob') || keyLower.includes('yob') || keyLower.includes('year') || keyLower.includes('age');
        const isGenderField = keyLower.includes('gender') || keyLower.includes('sex');
        
        if (isDobField || isGenderField) {
          console.log(`  *** ${key}: ${value} ***  <-- RELEVANT`);
        } else {
          console.log(`  ${key}: ${value}`);
        }
      }
    }

    console.log(`\n=== END ===`);
  } catch (err) {
    console.error("Error:", err.message);
  }
}

debugMemberFields();
