import { getServiceSupabase } from '../../lib/supabase';
import * as cheerio from 'cheerio';

export const config = {
  maxDuration: 300, // Extend for local/pro
};

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

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
    // Polyfill for flush if not present (some environments)
    const flush = () => { if (res.flush) res.flush(); };

    const sendProgress = (message, progress = 0, isDone = false, error = null) => {
        res.write(`data: ${JSON.stringify({ message, progress, isDone, error })}\n\n`);
        flush();
    };

    try {
        const supabase = getServiceSupabase();
        
        sendProgress('Initializing scraper...', 1);

        // 1. Get Swimmers Map
        const { data: dbSwimmers, error: swErr } = await supabase
            .from('swimmers')
            .select('id, full_name, legal_first_name, known_as');
        if (swErr) throw swErr;

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
        
        // Clean existing rankings for today's snapshot to avoid same-day duplication
        sendProgress("Cleaning today's snapshot rankings...", 2);
        const { error: delErr } = await supabase
            .from('rankings')
            .delete()
            .eq('snapshot_date', snapshotDate);
        if (delErr) {
            console.error("Warning cleaning current snapshot rankings:", delErr.message);
        }

        const results = [];
        const benchmarksToSync = []; // Collect benchmark thresholds

        let totalRequests = DISTRICTS.length * POOLS.length * SEXES.length * AGES.length * STROKES.length;
        let completedRequests = 0;

        for (const district of DISTRICTS) {
            for (const pool of POOLS) {
                for (const sex of SEXES) {
                    for (const age of AGES) {
                        for (const stroke of STROKES) {
                            completedRequests++;
                            const progress = Math.round((completedRequests / totalRequests) * 95);
                            const eventName = EVENT_NAMES[stroke];
                            
                            if (completedRequests % 10 === 0) {
                                sendProgress(`Processing ${district.name} | ${pool} | ${sex} | ${age} | ${eventName}...`, progress);
                            }

                            const url = `https://www.swimmingresults.org/12months/last12.php?Pool=${pool}&Stroke=${stroke}&Sex=${sex}&AgeGroup=${age}&date=${encodeURIComponent(endDate)}&StartNumber=1&RecordsToView=100&${district.params}&TargetClub=XXXX`;
                            
                            try {
                                const response = await fetch(url, {
                                    headers: {
                                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                                    }
                                });

                                if (!response.ok) continue;

                                const html = await response.text();
                                const $ = cheerio.load(html);
                                const rows = $('table tr').slice(1);
                                
                                let currentRank = null;

                                // Parse table rows
                                rows.each((i, el) => {
                                    const cells = $(el).find('td');
                                    if (cells.length < 9) return;
                                    
                                    const rankText = $(cells[0]).text().trim();
                                    if (rankText) {
                                        currentRank = parseInt(rankText);
                                    }
                                    const rank = currentRank;
                                    const timeText = $(cells[8]).text().trim();
                                    
                                    // --- BENCHMARK THRESHOLD EXTRACTION ---
                                    let benchmarkCategory = null;
                                    if (district.name === 'England' && rank === 40) benchmarkCategory = 'National Top 40';
                                    else if (district.name === 'South East' && rank === 30) benchmarkCategory = 'Regional Top 30';
                                    else if (district.name === 'Kent' && rank === 10) benchmarkCategory = 'County Top 10';

                                    if (benchmarkCategory && timeText && timeText !== '—' && rank) {
                                        let seconds = 0;
                                        if (timeText.includes(':')) {
                                            const parts = timeText.split(':');
                                            seconds = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
                                        } else {
                                            seconds = parseFloat(timeText);
                                        }

                                        if (!isNaN(seconds)) {
                                            benchmarksToSync.push({
                                                category: benchmarkCategory,
                                                year: currentYear,
                                                gender: sex === 'M' ? 'Male' : 'Female',
                                                age_group: age === 'OP' ? 99 : parseInt(age),
                                                event: eventName,
                                                course: pool === 'L' ? 'LC' : 'SC',
                                                time_standard: timeText,
                                                time_seconds: seconds
                                            });
                                        }
                                    }

                                    // --- TONBRIDGE SWIMMER DETECTION ---
                                    const club = $(cells[2]).text().trim();
                                    if (club.toLowerCase().includes('tonbridge')) {
                                        const name = $(cells[1]).text().trim();
                                        const swimmerId = swimmersMap[normalizeName(name)];
                                        
                                        if (swimmerId && rank) {
                                            const dateText = $(cells[7]).text().trim(); 
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

                                            results.push({
                                                swimmer_id: swimmerId,
                                                district: district.name,
                                                pool: pool,
                                                gender: sex,
                                                age: calculatedAge,
                                                stroke: eventName,
                                                time: timeText,
                                                rank: rank,
                                                date: isoDate,
                                                meet_name: meet,
                                                venue: venue,
                                                fina_points: fina,
                                                snapshot_date: snapshotDate,
                                                last_updated: new Date().toISOString()
                                            });
                                        }
                                    }
                                });

                                // Small delay to avoid rate limiting
                                await new Promise(r => setTimeout(r, 20));
                            } catch (err) {
                                console.error(`Error fetching ${eventName}:`, err.message);
                            }
                        }
                    }
                }
            }
        }

        sendProgress(`Scraping complete. Found ${results.length} results. Saving to database...`, 98);

        if (results.length > 0) {
            for (let i = 0; i < results.length; i += 100) {
                const chunk = results.slice(i, i + 100);
                const { error } = await supabase.from('rankings').upsert(chunk, { onConflict: 'swimmer_id,district,pool,stroke,age,snapshot_date' });
                if (error) {
                    if (error.code === '42P01') {
                        throw new Error("Rankings table not found. Please run the SQL schema first.");
                    }
                    console.error("Upsert Error:", error);
                }
            }
        }

        // 3. Save Benchmarks
        if (benchmarksToSync.length > 0) {
            sendProgress(`Syncing ${benchmarksToSync.length} Pathway Benchmarks...`, 99);
            const { error: benchErr } = await supabase
                .from('benchmarks')
                .upsert(benchmarksToSync, { onConflict: 'category, year, gender, age_group, event, course' });
            if (benchErr) console.error("Benchmark Sync Error:", benchErr);
        }

        sendProgress(`Success! Scraped and updated ${results.length} ranking entries.`, 100, true);
        res.end();

    } catch (error) {
        console.error('Rankings Scrape Error:', error);
        sendProgress('Error during rankings scrape', 0, true, error.message);
        res.end();
    }
}
