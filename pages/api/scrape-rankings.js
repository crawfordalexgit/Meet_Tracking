import { getServiceSupabase } from '../../lib/supabase';
import { requireAuth } from '../../lib/api-auth';
import { getRankingReferenceYear, getAgeGroupReferenceDate } from '../../lib/season';
import { OPEN_AGE } from '../../lib/acceptance-caps';
import { recordSyncRun } from '../../lib/sync-log';
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

/**
 * Collapses rows that share the rankings unique key
 * (swimmer_id, district, pool, stroke, age, season_year, snapshot_date).
 * Two such rows in a single upsert make Postgres raise "ON CONFLICT DO UPDATE
 * command cannot affect row a second time", which loses the whole chunk, so
 * they are merged here — the better (lower) rank wins.
 */
function dedupeByConflictKey(rows) {
    const byKey = new Map();
    for (const row of rows) {
        const key = [row.swimmer_id, row.district, row.pool, row.stroke, row.age, row.season_year, row.snapshot_date].join('|');
        const existing = byKey.get(key);
        if (!existing || row.rank < existing.rank) byKey.set(key, row);
    }
    return Array.from(byKey.values());
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!await requireAuth(req, res)) return;

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

    const runStartedAt = new Date().toISOString();

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

        // Rankings are bucketed by age at 31 Dec of the current calendar year:
        // a future season's cohort is not yet meaningful, so planning for 2027
        // during 2026 still ranks against the 2026 age group. The `date` param
        // sets that age-group reference date only. Overridable once the new year
        // starts, or to back-check a past year.
        const requestedYear = parseInt(req.body?.rankingYear);
        const rankingYear = Number.isFinite(requestedYear) ? requestedYear : getRankingReferenceYear();
        const endDate = getAgeGroupReferenceDate(rankingYear);
        const snapshotDate = new Date().toISOString().split('T')[0];
        
        // Clean existing rankings for today's snapshot to avoid same-day
        // duplication — scoped to this reference year so re-running for a
        // different year does not wipe the run made the same day.
        sendProgress(`Cleaning today's snapshot of ${rankingYear} age-group rankings...`, 2);
        const { error: delErr } = await supabase
            .from('rankings')
            .delete()
            .eq('snapshot_date', snapshotDate)
            .eq('season_year', rankingYear);
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

                            // `date` sets the age-group reference date only; the ranked times are
                            // always the trailing 12 months. RecordsToView=100 caps each list, so a
                            // swimmer outside the top 100 of their age group has no row at all.
                            // TargetClub is accepted but ignored by this endpoint — verified by
                            // diffing TargetClub=TONSKNTQ against XXXX (byte-identical responses),
                            // so the rank column is always the true district rank.
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
                                            // age_group here is the queried age group, i.e. age at
                                            // 31/12/rankingYear — so the benchmark is keyed to the
                                            // same season as the rankings it was extracted from.
                                            benchmarksToSync.push({
                                                category: benchmarkCategory,
                                                year: rankingYear,
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
                                            // Age at 31/12/rankingYear — matches the age group the row
                                            // was ranked in, and the age the QT tables are read at.
                                            const calculatedAge = birthYear ? (rankingYear - birthYear) : parseInt(age);
                                            // 'OP' rows are an all-ages list and rank far lower than the
                                            // age-group equivalent — store them under OPEN_AGE so they are
                                            // kept separate rather than overwriting the age-group rank.
                                            const rowAge = age === 'OP' ? OPEN_AGE : calculatedAge;

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
                                                age: rowAge,
                                                stroke: eventName,
                                                time: timeText,
                                                rank: rank,
                                                date: isoDate,
                                                meet_name: meet,
                                                venue: venue,
                                                fina_points: fina,
                                                season_year: rankingYear,
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

        const rows = dedupeByConflictKey(results);
        const dropped = results.length - rows.length;
        sendProgress(`Scraping complete. Found ${results.length} results${dropped > 0 ? ` (${dropped} duplicate key(s) merged)` : ''}. Saving to database...`, 98);

        let savedCount = 0;
        const upsertErrors = [];
        if (rows.length > 0) {
            for (let i = 0; i < rows.length; i += 100) {
                const chunk = rows.slice(i, i + 100);
                const { error } = await supabase.from('rankings').upsert(chunk, { onConflict: 'swimmer_id,district,pool,stroke,age,season_year,snapshot_date' });
                if (error) {
                    if (error.code === '42P01') {
                        throw new Error("Rankings table not found. Please run the SQL schema first.");
                    }
                    if (error.code === '42P10' || error.code === 'PGRST204') {
                        throw new Error("Rankings table is missing the season_year column/constraint. Run `node scripts/update-rankings-db.js` and apply the printed SQL.");
                    }
                    console.error("Upsert Error:", error);
                    upsertErrors.push(error.message);
                } else {
                    savedCount += chunk.length;
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

        await recordSyncRun({
            job: 'rankings',
            status: upsertErrors.length > 0 ? 'partial' : 'success',
            startedAt: runStartedAt,
            summary: { scraped: results.length, saved: savedCount, rankingYear, failedChunks: upsertErrors.length },
            error: upsertErrors[0] || null
        });

        if (upsertErrors.length > 0) {
            // Partial save — surface it rather than reporting success, otherwise a
            // rejected chunk silently leaves swimmers looking unranked.
            sendProgress(
                `Saved ${savedCount} of ${rows.length} ranking entries. ${upsertErrors.length} chunk(s) failed: ${upsertErrors[0]}`,
                100, true, upsertErrors[0]
            );
        } else {
            sendProgress(`Success! Scraped and updated ${savedCount} ranking entries in ${rankingYear} age groups.`, 100, true);
        }
        res.end();

    } catch (error) {
        console.error('Rankings Scrape Error:', error);
        sendProgress('Error during rankings scrape', 0, true, error.message);
        res.end();
    }
}
