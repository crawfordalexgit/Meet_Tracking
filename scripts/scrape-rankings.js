const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
const dns = require('dns');
// Override local DNS failures by using Google/Cloudflare resolvers directly
dns.setServers(['8.8.8.8', '1.1.1.1']);
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const STROKES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const AGES = [10, 11, 12, 13, 14, 15, 16, 17, 18, 'OP'];
const SEXES = ['M', 'F'];
const POOLS = ['L', 'S'];
const DISTRICTS = [
    { name: 'Kent', params: 'TargetNationality=P&TargetRegion=P&Level=C&TargetCounty=KNTQ' },
    { name: 'South East', params: 'TargetNationality=P&TargetRegion=S&Level=D&TargetCounty=XXXX' },
    { name: 'England', params: 'TargetNationality=E&TargetRegion=P&Level=N&TargetCounty=XXXX' }
];

const EVENT_NAMES = {
    1: '50 Free', 2: '100 Free', 3: '200 Free', 4: '400 Free', 5: '800 Free', 6: '1500 Free',
    7: '50 Breast', 8: '100 Breast', 9: '200 Breast',
    10: '50 Fly', 11: '100 Fly', 12: '200 Fly',
    13: '50 Back', 14: '100 Back', 15: '200 Back',
    16: '200 IM', 17: '400 IM'
};

function normalizeName(name) {
    if (!name) return "";
    let n = name.trim();
    
    // Handle parenthetical aliases: "Leong Chiu (James) Wong" -> "Leong Chiu Wong"
    n = n.replace(/\s*\([^)]*\)\s*/g, ' ');

    // Handle "Last, First" format
    if (n.includes(',')) {
        const parts = n.split(',').map(p => p.trim());
        if (parts.length === 2) {
            n = `${parts[1]} ${parts[0]}`;
        }
    }
    
    return n.toLowerCase()
        .replace(/[,\.]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .sort()
        .join(' ')
        .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Remove accents
}

function generateNameAliases(swimmer) {
    const aliases = new Set();
    if (!swimmer) return [];
    
    // 1. Base full name
    if (swimmer.full_name) aliases.add(normalizeName(swimmer.full_name));
    
    // Calculate a reliable Last Name
    const nameParts = swimmer.full_name?.split(',') || [];
    const lastName = (nameParts[0] || swimmer.full_name?.split(' ').pop() || '').trim();

    // 2. Known As + Last Name
    if (swimmer.known_as && lastName) {
        aliases.add(normalizeName(`${swimmer.known_as} ${lastName}`));
    }
    
    // 3. Legal First Name + Last Name
    if (swimmer.legal_first_name && lastName) {
        aliases.add(normalizeName(`${swimmer.legal_first_name} ${lastName}`));
    }

    return Array.from(aliases);
}

async function scrapeRankings() {
    console.log("Starting Rankings Scraper for Tonbridge Swimmers...");

    // 1. Get Swimmers Map
    console.log("Checking Supabase connectivity...");
    try {
        const { error: connErr } = await supabase.from('swimmers').select('count', { count: 'exact', head: true });
        if (connErr) throw connErr;
        console.log("Supabase connected successfully.");
    } catch (e) {
        console.error("Supabase Connection Error:", e.message);
        process.exit(1);
    }

    const { data: dbSwimmers, error: swErr } = await supabase.from('swimmers').select('id, full_name, legal_first_name, known_as');
    if (swErr) {
        console.error("Error fetching swimmers:", swErr);
        process.exit(1);
    }
    const swimmersMap = {};
    dbSwimmers.forEach(s => {
        const aliases = generateNameAliases(s);
        aliases.forEach(alias => {
            swimmersMap[alias] = s.id;
        });
    });

    const currentYear = new Date().getFullYear();
    const endDate = `31/12/${currentYear}`;
    const snapshotDate = new Date().toISOString().split('T')[0];
    console.log(`Using end date for rankings: ${endDate}`);
    console.log(`Snapshot date: ${snapshotDate}`);

    // Clean existing rankings for today's snapshot to avoid same-day duplication
    console.log(`Cleaning existing rankings for today's snapshot (${snapshotDate}) to avoid same-day duplication...`);
    const { error: delErr } = await supabase
        .from('rankings')
        .delete()
        .eq('snapshot_date', snapshotDate);
    if (delErr) {
        console.error("Warning purging today's rankings:", delErr.message);
    } else {
        console.log("Today's rankings cleaned successfully.");
    }

    const results = [];
    let requestCount = 0;
    const totalRequests = DISTRICTS.length * POOLS.length * SEXES.length * AGES.length * STROKES.length;

    // 2. Run Scraper
    for (const district of DISTRICTS) {
        console.log(`\nProcessing District: ${district.name}`);
        for (const pool of POOLS) {
            for (const sex of SEXES) {
                for (const age of AGES) {
                    for (const stroke of STROKES) {
                        const eventName = EVENT_NAMES[stroke];
                        const url = `https://www.swimmingresults.org/12months/last12.php?Pool=${pool}&Stroke=${stroke}&Sex=${sex}&AgeGroup=${age}&date=${encodeURIComponent(endDate)}&StartNumber=1&RecordsToView=100&${district.params}&TargetClub=TONSKNTQ`;
                        
                        requestCount++;
                        if (requestCount % 50 === 0) {
                            console.log(`\nProgress: ${requestCount}/${totalRequests} URLs scanned...`);
                        }

                        try {
                            const response = await fetch(url, {
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                                },
                                signal: AbortSignal.timeout(10000)
                            });

                            if (!response.ok) throw new Error(`HTTP ${response.status}`);

                            const html = await response.text();
                            const $ = cheerio.load(html);
                            const rows = $('table tr').slice(1);
                            let currentRank = null;
                            rows.each((i, el) => {
                                const cells = $(el).find('td');
                                if (cells.length < 9) return;

                                const rankText = $(cells[0]).text().trim();
                                if (rankText) {
                                    currentRank = parseInt(rankText);
                                }

                                const club = $(cells[2]).text().trim();
                                if (club.toLowerCase().includes('tonbridge')) {
                                    const name = $(cells[1]).text().trim();
                                    const swimmerId = swimmersMap[normalizeName(name)];
                                    
                                    if (swimmerId && currentRank) {
                                        const dateText = $(cells[7]).text().trim(); // DD/MM/YY
                                        const timeText = $(cells[8]).text().trim();
                                        const fina = parseInt($(cells[9]).text().trim()) || 0;
                                        const meet = $(cells[4]).text().trim();
                                        const venue = $(cells[5]).text().trim();
                                        
                                        // Calculate age from YOB column
                                        const yobText = $(cells[3]).text().trim();
                                        const yobVal = parseInt(yobText);
                                        let birthYear = null;
                                        if (!isNaN(yobVal)) {
                                            birthYear = yobVal > 50 ? 1900 + yobVal : 2000 + yobVal;
                                        }
                                        const calculatedAge = birthYear ? (currentYear - birthYear) : (age === 'OP' ? 99 : parseInt(age));

                                        // Convert DD/MM/YY to YYYY-MM-DD
                                        let isoDate = null;
                                        if (dateText) {
                                            const parts = dateText.split('/');
                                            if (parts.length === 3) {
                                                const day = parts[0].padStart(2, '0');
                                                const month = parts[1].padStart(2, '0');
                                                let year = parts[2];
                                                if (year.length === 2) year = `20${year}`;
                                                isoDate = `${year}-${month}-${day}`;
                                            }
                                        }

                                        console.log(`Found: ${name} (${district.name} Rank ${currentRank}) in ${eventName}`);
                                        
                                        const result = {
                                            swimmer_id: swimmerId,
                                            district: district.name,
                                            pool: pool,
                                            gender: sex,
                                            age: calculatedAge,
                                            stroke: eventName,
                                            time: timeText,
                                            rank: currentRank,
                                            date: isoDate,
                                            meet_name: meet,
                                            venue: venue,
                                            fina_points: fina,
                                            snapshot_date: snapshotDate,
                                            last_updated: new Date().toISOString()
                                        };
                                        
                                        results.push(result);

                                        // Auto-upsert in smaller chunks to show progress faster
                                        if (results.length >= 10) {
                                            const batch = [...results];
                                            results.length = 0; 
                                            upsertChunk(batch);
                                        }
                                    }
                                }
                            });

                            await new Promise(r => setTimeout(r, 50));
                        } catch (err) {
                            console.error(`Error fetching ${eventName}:`, err.message);
                        }
                    }
                }
            }
        }
    }

    // Final upsert for remaining items
    if (results.length > 0) {
        await upsertChunk(results);
    }

    console.log(`\nScraping complete.`);
}

async function upsertChunk(chunk) {
    console.log(`Saving ${chunk.length} rankings to database...`);
    const { error } = await supabase.from('rankings').upsert(chunk, { onConflict: 'swimmer_id,district,pool,stroke,age,snapshot_date' });
    if (error) {
        if (error.code === '42P01') {
            console.error("\nERROR: Table 'rankings' not found. Run rankings_schema.sql first.");
            process.exit(1);
        }
        console.error("Upsert Error:", error.message);
    } else {
        console.log(`Successfully saved ${chunk.length} rankings.`);
    }
}

scrapeRankings();
