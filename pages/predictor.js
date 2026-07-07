import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { authedFetch } from '../lib/api-client';
import { normalizeEvent, timeToSeconds } from '../lib/analytics-utils';
import { getBenchmarks } from '../lib/qualifying-times';

// ─── Constants ──────────────────────────────────────────────────────────────

const PRIMARY_EVENTS = [
  '50 Free', '100 Free',
  '50 Back', '100 Back',
  '50 Breast', '100 Breast',
  '50 Fly', '100 Fly',
  '200 IM',
];

const STROKE_GROUPS = [
  { label: 'Freestyle',        events: ['50 Free', '100 Free'] },
  { label: 'Backstroke',       events: ['50 Back', '100 Back'] },
  { label: 'Breaststroke',     events: ['50 Breast', '100 Breast'] },
  { label: 'Butterfly',        events: ['50 Fly', '100 Fly'] },
  { label: 'Individual Medley',events: ['200 IM'] },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function secondsToTime(secs) {
  if (!secs || secs <= 0) return '—';
  const mins = Math.floor(secs / 60);
  const s = (secs % 60).toFixed(2).padStart(5, '0');
  return mins > 0 ? `${mins}:${s}` : (secs % 60).toFixed(2);
}

function getSwimmerPB(results, eventName) {
  const target = normalizeEvent(eventName);
  const times = results
    .filter(r => normalizeEvent(r.event || '') === target && r.time)
    .map(r => timeToSeconds(r.time))
    .filter(t => t > 0);
  return times.length > 0 ? Math.min(...times) : null;
}

function GapBadge({ gapSeconds }) {
  if (gapSeconds === null) return <span style={{ opacity: 0.25, fontSize: '0.75rem' }}>—</span>;
  if (gapSeconds <= 0) {
    return (
      <span style={{ display: 'inline-block', padding: '2px 8px', background: 'rgba(16,185,129,0.15)', color: '#10b981', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 900 }}>
        ✓ QT
      </span>
    );
  }
  const isVeryClose = gapSeconds <= 0.5;
  const isClose     = gapSeconds <= 2.0;
  const color = isVeryClose ? '#f59e0b' : isClose ? '#fb923c' : '#f87171';
  return (
    <span style={{ fontSize: '0.8rem', fontWeight: 700, color }}>
      +{gapSeconds.toFixed(2)}s
    </span>
  );
}

function getMaxAcceptedSwimmers(eventStr, age) {
  const younger = age < 17;
  if (eventStr.startsWith('50'))  return younger ? 34 : 46;
  if (eventStr.startsWith('100')) return younger ? 21 : 24;
  if (eventStr.startsWith('200')) return younger ? 16 : 18;
  return 14;
}

function TrafficLightBadge({ rank, maxAccepted }) {
  if (!rank || rank <= 0) {
    return (
      <span style={{ display: 'inline-block', padding: '3px 8px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 900, letterSpacing: '0.05em' }}>
        🔴 UNRANKED
      </span>
    );
  }
  const isGreen = rank <= maxAccepted;
  const isAmber = !isGreen && rank <= maxAccepted + 10;
  const color   = isGreen ? '#10b981' : isAmber ? '#f59e0b' : '#ef4444';
  const bg      = isGreen ? 'rgba(16,185,129,0.12)' : isAmber ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)';
  const label   = isGreen ? 'SAFE' : isAmber ? 'BUBBLE' : 'OUTSIDE';
  const dot     = isGreen ? '🟢' : isAmber ? '🟠' : '🔴';
  return (
    <span style={{ display: 'inline-block', padding: '3px 8px', background: bg, color, borderRadius: '6px', fontSize: '0.65rem', fontWeight: 900, whiteSpace: 'nowrap' }}>
      {dot} #{rank} / {maxAccepted} — {label}
    </span>
  );
}

// ─── CoachesEye AI Card ──────────────────────────────────────────────────────

function PathwayAiCard({ swimmer, age, gapData, rankings, course, session }) {
  const [loading, setLoading]   = useState(false);
  const [insight, setInsight]   = useState(null);
  const [error, setError]       = useState(null);

  const countyGapSummary = useMemo(() => {
    if (!gapData) return '';
    return gapData
      .filter(d => d.pbSeconds !== null)
      .map(d => {
        const g = d.countyAutoGap;
        return `${d.event}: ${g !== null ? (g <= 0 ? 'QT' : `+${g.toFixed(2)}s`) : 'no PB'}`;
      })
      .join(', ');
  }, [gapData]);

  const regionalGapSummary = useMemo(() => {
    if (!gapData) return '';
    return gapData
      .filter(d => d.pbSeconds !== null)
      .map(d => {
        const g = d.regionalAutoGap;
        return `${d.event}: ${g !== null ? (g <= 0 ? 'QT' : `+${g.toFixed(2)}s`) : 'no PB'}`;
      })
      .join(', ');
  }, [gapData]);

  const rankingSummary = useMemo(() => {
    if (!rankings?.length || age === null) return '';
    return PRIMARY_EVENTS.map(eventName => {
      const maxAccepted = getMaxAcceptedSwimmers(eventName, age);
      const poolCode = course === 'SC' ? 'S' : 'L';
      const match = rankings.find(r =>
        normalizeEvent(r.stroke || '') === normalizeEvent(eventName) && r.pool === poolCode
      );
      const rank = match ? parseInt(match.rank) : null;
      if (!rank) return `${eventName}: unranked (cap ${maxAccepted})`;
      const status = rank <= maxAccepted ? 'SAFE' : rank <= maxAccepted + 10 ? 'BUBBLE' : 'OUTSIDE';
      return `${eventName}: rank #${rank} / cap ${maxAccepted} [${status}]`;
    }).join(', ');
  }, [rankings, age]);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          swimmerId: swimmer.id,
          type: 'pathway',
          instructions: [
            `PATHWAY ANALYSIS: Evaluate this swimmer's qualification trajectory toward Kent County and South East Regional championship standards.`,
            `Age: ${age}y | Gender: ${swimmer.gender || 'unknown'}`,
            `County Auto QT gaps (Short Course): ${countyGapSummary || 'No PB data available'}`,
            `SE Regional Auto QT gaps (Short Course): ${regionalGapSummary || 'No PB data available'}`,
            rankingSummary ? `Current Kent rankings vs event acceptance caps (format: rank / cap [status]): ${rankingSummary}` : 'No rankings data on file.',
            `Identify the 2–3 events closest to a County or Regional breakthrough. Provide specific, actionable technical recommendations (starts, turns, race strategy) to close the gap. Comment on any BUBBLE events where the swimmer is waitlist-vulnerable. Include a headline prediction for their championship season.`,
          ],
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setInsight(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="glass-card mb-8" style={{ padding: '3rem', textAlign: 'center', borderLeft: '4px solid var(--accent-cyan)' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem', display: 'inline-block', animation: 'spin 3s linear infinite' }}>🎯</div>
        <p style={{ fontSize: '1rem', fontWeight: 900, letterSpacing: '0.05em' }}>ANALYSING QUALIFICATION TRAJECTORY...</p>
        <p style={{ fontSize: '0.7rem', opacity: 0.5, marginTop: '8px', textTransform: 'uppercase' }}>Running Predictive Foresight Algorithms</p>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!insight) {
    return (
      <div className="glass-card mb-8" style={{ padding: '3rem', textAlign: 'center', borderLeft: '4px solid var(--accent-cyan)', background: 'linear-gradient(135deg, rgba(6,182,212,0.03) 0%, transparent 100%)' }}>
        <div className="section-title" style={{ marginBottom: '0.5rem' }}>CoachesEye Insights</div>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.1em', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '1.5rem', marginTop: '0.5rem' }}>
          Predictive Foresight: Pathway Analysis
        </h3>
        <p style={{ fontSize: '0.85rem', opacity: 0.7, lineHeight: 1.6, maxWidth: '480px', margin: '0 auto 2rem' }}>
          Generate an AI-powered qualification trajectory report. CoachesEye will analyse PB gaps, identify breakthrough events, and prescribe targeted technical interventions.
        </p>
        <button
          className="btn-premium-intel"
          onClick={handleGenerate}
          style={{ margin: '0 auto', background: 'var(--accent-cyan)', color: '#000', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <span>🎯</span> Generate Pathway Report
        </button>
        {error && <p style={{ color: 'var(--accent-rose)', marginTop: '1rem', fontSize: '0.8rem' }}>{error}</p>}
      </div>
    );
  }

  return (
    <div className="glass-card mb-8" style={{ padding: '3rem', borderLeft: '4px solid var(--accent-cyan)', background: 'linear-gradient(135deg, rgba(6,182,212,0.03) 0%, transparent 100%)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
        <div>
          <div className="section-title" style={{ marginBottom: '0.25rem' }}>CoachesEye Insights: Predictive Foresight</div>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.1em', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: 0, marginTop: '0.75rem' }}>
            {insight.headline || 'Pathway Intelligence Report'}
          </h3>
        </div>
        <button className="period-btn" onClick={handleGenerate} style={{ fontSize: '0.6rem', opacity: 0.5 }}>🔄 Refresh</button>
      </div>

      {insight.overview && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 900, opacity: 0.4, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>Overview</div>
          <p style={{ fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.6, margin: 0 }}>{insight.overview}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: '2rem', marginBottom: '1.5rem' }}>
        {insight.training_analysis && (
          <div>
            <div style={{ fontSize: '0.6rem', fontWeight: 900, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>Pathway Analysis</div>
            <p style={{ fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.6, margin: 0 }}>{insight.training_analysis}</p>
          </div>
        )}
        {insight.performance_link && (
          <div>
            <div style={{ fontSize: '0.6rem', fontWeight: 900, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>Performance–Training Link</div>
            <p style={{ fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.6, margin: 0 }}>{insight.performance_link}</p>
          </div>
        )}
      </div>

      {insight.recommendations?.length > 0 && (
        <div style={{ padding: '1.5rem', background: 'rgba(6,182,212,0.05)', borderRadius: '16px', border: '1px solid rgba(6,182,212,0.1)' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 900, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem' }}>
            Recommendations
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {insight.recommendations.map((rec, i) => (
              <li key={i} style={{ display: 'flex', gap: '10px', fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.6 }}>
                <span style={{ color: 'var(--accent-cyan)', fontWeight: 900 }}>•</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── QT Table ────────────────────────────────────────────────────────────────

function QtTable({ results, age, currentAge, gender, course, rankings, level }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            {['Event', 'Your PB', 'County Auto', 'County Cons', 'SE Regional Auto', 'SE Regional Cons', 'Rank & Prob'].map(h => (
              <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Event' ? 'left' : 'center', fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.45, whiteSpace: 'nowrap' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {STROKE_GROUPS.map(group => (
            <>
              <tr key={`hdr-${group.label}`}>
                <td colSpan={7} style={{ padding: '12px 12px 4px', fontSize: '0.6rem', fontWeight: 900, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.7 }}>
                  {group.label}
                </td>
              </tr>
              {group.events.map(eventName => {
                const pbSecs     = getSwimmerPB(results, eventName);
                const countyBm   = getBenchmarks(age, gender, eventName, 'COUNTY');
                const regionalBm = getBenchmarks(age, gender, eventName, 'REGIONAL');
                const safeLevel = (level || 'COUNTY').toUpperCase();
                const targetDistrict = safeLevel === 'REGIONAL' ? 'South East' : 'Kent';
                const targetPool = (course === 'SC' || course === 'S' || course === 'sc' || course === 's') ? 'S' : 'L';
                const currentRank = (rankings || []).find(r =>
                  normalizeEvent(r.stroke || '') === normalizeEvent(eventName) &&
                  r.pool === targetPool &&
                  r.district === targetDistrict
                );
                const maxAccepted = getMaxAcceptedSwimmers(eventName, currentAge || age);
                const swimmerRank = currentRank ? parseInt(currentRank.rank) : null;

                const courseKey = course === 'LC' ? 'autoLC' : 'autoSC';
                const consKey   = course === 'LC' ? 'consLC' : 'consSC';

                const cAuto = countyBm?.[courseKey]   ?? null;
                const cCons = countyBm?.[consKey]     ?? null;
                const rAuto = regionalBm?.[courseKey] ?? null;
                const rCons = regionalBm?.[consKey]   ?? null;

                const cAutoGap = pbSecs !== null && cAuto !== null ? pbSecs - cAuto : null;
                const cConsGap = pbSecs !== null && cCons !== null ? pbSecs - cCons : null;
                const rAutoGap = pbSecs !== null && rAuto !== null ? pbSecs - rAuto : null;
                const rConsGap = pbSecs !== null && rCons !== null ? pbSecs - rCons : null;

                const isQualifiedCounty   = cAutoGap !== null && cAutoGap <= 0;
                const isQualifiedRegional = rAutoGap !== null && rAutoGap <= 0;

                return (
                  <tr
                    key={eventName}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: isQualifiedRegional
                        ? 'rgba(6,182,212,0.06)'
                        : isQualifiedCounty
                        ? 'rgba(16,185,129,0.04)'
                        : 'transparent',
                    }}
                  >
                    {/* Event name */}
                    <td style={{ padding: '10px 12px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {eventName}
                      {isQualifiedRegional && <span style={{ marginLeft: '6px', fontSize: '0.6rem', color: 'var(--accent-cyan)', fontWeight: 900 }}>SE</span>}
                      {isQualifiedCounty && !isQualifiedRegional && <span style={{ marginLeft: '6px', fontSize: '0.6rem', color: '#10b981', fontWeight: 900 }}>KENT</span>}
                    </td>
                    {/* PB */}
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 900, color: pbSecs ? '#fff' : undefined, opacity: pbSecs ? 1 : 0.3 }}>
                      {pbSecs ? secondsToTime(pbSecs) : '—'}
                    </td>
                    {/* County Auto */}
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', opacity: 0.5, marginBottom: '2px' }}>{secondsToTime(cAuto)}</div>
                      <GapBadge gapSeconds={cAutoGap} />
                    </td>
                    {/* County Cons */}
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', opacity: 0.5, marginBottom: '2px' }}>{secondsToTime(cCons)}</div>
                      <GapBadge gapSeconds={cConsGap} />
                    </td>
                    {/* Regional Auto */}
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', opacity: 0.5, marginBottom: '2px' }}>{secondsToTime(rAuto)}</div>
                      <GapBadge gapSeconds={rAutoGap} />
                    </td>
                    {/* Regional Cons */}
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', opacity: 0.5, marginBottom: '2px' }}>{secondsToTime(rCons)}</div>
                      <GapBadge gapSeconds={rConsGap} />
                    </td>
                    {/* Rank & Prob */}
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <TrafficLightBadge rank={swimmerRank} maxAccepted={maxAccepted} />
                    </td>
                  </tr>
                );
              })}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function PredictorPage({ session: propSession }) {
  const router = useRouter();
  const { level: queryLevel } = router.query;

  const [session, setSession]       = useState(propSession || null);
  const [swimmers, setSwimmers]     = useState([]);
  const [allResults, setAllResults] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [course, setCourse]         = useState('SC');
  const [search, setSearch]         = useState('');
  const [rankings, setRankings]     = useState([]);

  console.log("🚨 CANARY LOG: PredictorPage Rendered! Selected ID:", selectedId);
  console.log("🚨 CURRENT RANKINGS IN STATE:", rankings?.length);

  // Sync prop session to state session if propSession is loaded after initial render
  useEffect(() => {
    if (propSession) {
      setSession(propSession);
    }
  }, [propSession]);

  // Auth guard
  useEffect(() => {
    if (propSession) return;
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (!currentSession) { router.push('/login'); return; }
      setSession(currentSession);
    });
  }, [router, propSession]);

  // Fetch swimmers + results
  useEffect(() => {
    if (!session) return;
    async function fetchData() {
      setLoading(true);
      const [{ data: swData }, { data: resData }] = await Promise.all([
        supabase.from('swimmers').select('id, full_name, known_as, year_of_birth, gender, squads(name)').eq('is_active', true).order('full_name'),
        supabase.from('results').select('swimmer_id, event, time, wa_pts, date, is_pb').order('date', { ascending: false }),
      ]);
      setSwimmers(swData || []);
      setAllResults(resData || []);
      setLoading(false);
    }
    fetchData();
  }, [session]);

  // Fetch rankings for selected swimmer
  useEffect(() => {
    console.log("🚨 RANKINGS USE-EFFECT TRIGGERED! Session exists:", !!session, "| ID:", selectedId);
    if (!session || !selectedId) {
      setRankings([]);
      return;
    }
    console.log("🔍 FETCHING RANKINGS FOR SWIMMER ID:", selectedId);
    supabase
      .from('rankings')
      .select('*')
      .eq('swimmer_id', selectedId)
      .then(({ data, error }) => {
        if (error) console.error("🚨 Rankings Fetch Error:", error);
        console.log("📦 RAW RANKINGS FROM DB:", data);
        // Absolute bypass of ALL snapshot filters
        setRankings(data || []);
      });
  }, [session, selectedId]);

  const swimmer = useMemo(() => swimmers.find(s => s.id === selectedId) || null, [swimmers, selectedId]);

  const swimmerResults = useMemo(
    () => (swimmer ? allResults.filter(r => r.swimmer_id === swimmer.id) : []),
    [allResults, swimmer]
  );

  const now = new Date();
  const targetYear = now.getMonth() >= 4 ? now.getFullYear() + 1 : now.getFullYear();
  const age = swimmer?.year_of_birth ? targetYear - swimmer.year_of_birth : null;
  const currentAge = swimmer?.year_of_birth ? now.getFullYear() - swimmer.year_of_birth : null;
  const gender = swimmer?.gender || 'M';

  // Build gap data for AI card
  const gapData = useMemo(() => {
    if (!swimmer || age === null) return [];
    return PRIMARY_EVENTS.map(eventName => {
      const pbSecs   = getSwimmerPB(swimmerResults, eventName);
      const countyBm = getBenchmarks(age, gender, eventName, 'COUNTY');
      const regBm    = getBenchmarks(age, gender, eventName, 'REGIONAL');
      const cAuto    = countyBm?.autoSC ?? null;
      const rAuto    = regBm?.autoSC   ?? null;
      return {
        event:          eventName,
        pbSeconds:      pbSecs,
        countyAutoGap:  pbSecs !== null && cAuto !== null ? pbSecs - cAuto : null,
        regionalAutoGap:pbSecs !== null && rAuto !== null ? pbSecs - rAuto : null,
      };
    });
  }, [swimmer, swimmerResults, age, gender]);

  const filteredSwimmers = useMemo(() => {
    if (!search.trim()) return swimmers;
    const q = search.toLowerCase();
    return swimmers.filter(s => (s.full_name || '').toLowerCase().includes(q) || (s.known_as || '').toLowerCase().includes(q));
  }, [swimmers, search]);

  if (loading) {
    return (
      <Layout session={session}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
          <p style={{ opacity: 0.5, fontWeight: 700 }}>Loading swimmer data…</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout session={session}>
      {/* Page Header */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div className="section-title">QT Predictor</div>
        <h1 style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>
          Qualification Pathway Report
        </h1>
        <p style={{ fontSize: '0.85rem', opacity: 0.6, lineHeight: 1.6, maxWidth: '600px' }}>
          Select a swimmer to view their personal best gaps against Kent County and South East Regional qualifying times, with AI-powered pathway analysis.
        </p>
      </div>

      {/* Swimmer Selector */}
      <div className="glass-card mb-8" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
          {/* Search */}
          <div style={{ flex: '1 1 220px' }}>
            <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 900, opacity: 0.4, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>Search Swimmer</label>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Type name…"
              style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box' }}
            />
          </div>

          {/* Dropdown */}
          <div style={{ flex: '2 1 300px' }}>
            <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 900, opacity: 0.4, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>Swimmer</label>
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', background: 'rgba(13,17,23,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#fff', fontSize: '0.85rem', cursor: 'pointer', boxSizing: 'border-box' }}
            >
              <option value="">— Select swimmer —</option>
              {filteredSwimmers.map(s => (
                <option key={s.id} value={s.id}>
                  {s.known_as || s.full_name} {s.year_of_birth ? `(${targetYear - s.year_of_birth}y)` : ''} — {s.squads?.name || 'No Squad'}
                </option>
              ))}
            </select>
          </div>

          {/* Course toggle */}
          <div>
            <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 900, opacity: 0.4, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>Course</label>
            <div style={{ display: 'flex', gap: '4px' }}>
              {['SC', 'LC'].map(c => (
                <button
                  key={c}
                  onClick={() => setCourse(c)}
                  style={{
                    padding: '9px 18px',
                    borderRadius: '8px',
                    border: '1px solid',
                    borderColor: course === c ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.1)',
                    background: course === c ? 'rgba(6,182,212,0.15)' : 'transparent',
                    color: course === c ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.5)',
                    fontWeight: 900,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Swimmer selected */}
      {swimmer && age !== null ? (
        <>
          {/* Meta bar */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
            {[
              { label: 'Swimmer', value: swimmer.known_as || swimmer.full_name },
              { label: 'Age Group', value: `${age}y (${targetYear} season)` },
              { label: 'Gender', value: gender === 'M' || gender?.startsWith('M') ? 'Male' : 'Female' },
              { label: 'Squad', value: swimmer.squads?.name || 'Unassigned' },
              { label: 'Course', value: `${course === 'SC' ? 'Short' : 'Long'} Course` },
            ].map(({ label, value }) => (
              <div key={label} style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px' }}>
                <div style={{ fontSize: '0.55rem', fontWeight: 900, opacity: 0.4, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>{label}</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* AI Card */}
          <PathwayAiCard swimmer={swimmer} age={age} gapData={gapData} rankings={rankings} course={course} session={session} />

          {/* QT Table */}
          <div className="glass-card" style={{ padding: '2.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
                  QT Gap Analysis — {course} Standards
                </h3>
                <p style={{ fontSize: '0.75rem', opacity: 0.5, margin: '4px 0 0', lineHeight: 1.5 }}>
                  Gaps shown as seconds slower than Auto qualifying time. Positive = still to achieve.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.65rem', fontWeight: 700 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', background: 'rgba(16,185,129,0.15)' }} /> County QT
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', background: 'rgba(6,182,212,0.15)' }} /> Regional QT
                </span>
              </div>
            </div>

            <QtTable results={swimmerResults} age={age} currentAge={currentAge} gender={gender} course={course} rankings={rankings} level={queryLevel || 'COUNTY'} />

            <div style={{ marginTop: '1.5rem', padding: '1rem 1.25rem', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p style={{ fontSize: '0.7rem', opacity: 0.4, margin: 0, lineHeight: 1.6 }}>
                <strong style={{ opacity: 1 }}>Key:</strong> Auto = Automatic qualifying time (guaranteed entry). Cons = Consideration time (subject to selection). Times sourced from Kent 2026 Championship Standards. Age calculated against {targetYear} season year.
              </p>
            </div>
          </div>
        </>
      ) : (
        /* Empty state */
        <div className="glass-card" style={{ padding: '4rem', textAlign: 'center', borderStyle: 'dashed' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎯</div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 900, marginBottom: '0.5rem' }}>Select a Swimmer</h3>
          <p style={{ fontSize: '0.85rem', opacity: 0.5, lineHeight: 1.6, maxWidth: '400px', margin: '0 auto' }}>
            Choose a swimmer from the dropdown above to view their full qualification gap analysis and AI pathway report.
          </p>
        </div>
      )}
    </Layout>
  );
}
