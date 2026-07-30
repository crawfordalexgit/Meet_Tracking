import { useState, useEffect, useMemo } from 'react';
import Layout from '../components/Layout';
import { authedFetch } from '../lib/api-client';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { getPreferredName } from '../lib/analytics-utils';

export default function SwimmersRegistry({ session }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [swimmers, setSwimmers] = useState([]);
  const [search, setSearch] = useState('');
  const [periodDays, setPeriodDays] = useState(365);

  const PERIOD_OPTIONS = [
    { label: '30 Days', days: 30 },
    { label: '90 Days', days: 90 },
    { label: '6 Months', days: 180 },
    { label: '52 Weeks', days: 365 },
  ];

  const handlePeriodChange = (days) => {
    router.push({ pathname: '/swimmers', query: { ...router.query, period: days } }, undefined, { shallow: true });
  };

  useEffect(() => {
    if (router.isReady) {
      fetchData();
    }
  }, [router.isReady, router.query.period]);

  const fetchData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const period = parseInt(router.query.period) || 365;
      setPeriodDays(period);

      // Server-side aggregation. This page used to download every attendance
      // and result row (~27k) and compute reliability in the browser, which is
      // what made /swimmers take ~40s and timed out the swimmers-peak-wa
      // regression guard. /api/swimmer-stats does the same work with the same
      // shared calculateReliability, so the numbers are unchanged.
      const res = await authedFetch(`/api/swimmer-stats?period=${period}`);
      if (!res.ok) throw new Error(`swimmer-stats returned ${res.status}`);
      const payload = await res.json();
      setSwimmers(payload.swimmers || []);
    } catch (error) {
      console.error('Athlete registry load failed:', error);
      setLoadError(error.message || 'Could not load the athlete registry.');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    let list = swimmers;
    if (router.query.district) {
      list = list.filter(s => s.districts?.includes(router.query.district));
    }
    // `|| ''` on full_name: a single swimmer row with a null name made the whole
    // registry throw on the first keystroke.
    const needle = search.toLowerCase();
    return list.filter(s =>
      (getPreferredName(s) || '').toLowerCase().includes(needle) ||
      (s.full_name || '').toLowerCase().includes(needle) ||
      s.squads?.name?.toLowerCase().includes(needle)
    );
  }, [swimmers, search, router.query.district]);

  return (
    <Layout session={session}>
      <Head>
        <title>Athlete Registry | CoachesEye</title>
      </Head>

      <div className="flex justify-between items-center mb-12" style={{ flexWrap: 'wrap', gap: '20px' }}>
        <div className="flex items-center gap-6" style={{ flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: '3rem', fontWeight: 955, margin: 0, letterSpacing: '-0.04em' }}>ATHLETE <span style={{ color: 'var(--accent-cyan)' }}>REGISTRY</span></h1>
          <div className="period-selector-premium">
             {PERIOD_OPTIONS.map(opt => (
               <button key={opt.days} className={`period-btn-premium ${periodDays === opt.days ? 'active' : ''}`} onClick={() => handlePeriodChange(opt.days)}>
                 {opt.label}
               </button>
             ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          {router.query.district && (
             <button 
               onClick={() => {
                 const { district, ...rest } = router.query;
                 router.push({ pathname: '/swimmers', query: rest }, undefined, { shallow: true });
               }}
               className="period-btn-premium active"
               style={{ background: 'rgba(248, 113, 113, 0.2)', border: '1px solid rgba(248, 113, 113, 0.4)', color: '#f87171' }}
             >
               Clear {router.query.district} Filter
             </button>
          )}
          <div className="tactical-search-container">
             <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
             <input 
               type="text" 
               placeholder="Search by name or squad..." 
               className="tactical-search-input"
               style={{ width: '400px' }}
               value={search}
               onChange={(e) => setSearch(e.target.value)}
             />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
           <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400"></div>
        </div>
      ) : loadError ? (
        <div className="glass-card text-center p-12" style={{ borderLeft: '4px solid var(--accent-rose)', maxWidth: '560px', margin: '3rem auto' }}>
          <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--accent-rose)' }}>Couldn&apos;t load the athlete registry</h3>
          <p className="text-sm opacity-70 mb-6">{loadError}</p>
          <button className="period-btn" onClick={fetchData}>Retry</button>
        </div>
      ) : (
        <>
        <div className="section-divider">
          <span className="label">{filtered.length} swimmers</span>
          <span className="rule" />
        </div>
        <div className="glass-card overflow-hidden">
           <table className="w-full text-left">
              <thead>
                 <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <th className="p-6 text-xs font-black tracking-widest opacity-40 uppercase">Athlete Name</th>
                    <th className="p-6 text-xs font-black tracking-widest opacity-40 uppercase">Primary Squad</th>
                    <th className="p-6 text-xs font-black tracking-widest opacity-40 uppercase text-center">Attendance</th>
                    <th className="p-6 text-xs font-black tracking-widest opacity-40 uppercase text-center">Compliance</th>
                    <th className="p-6 text-xs font-black tracking-widest opacity-40 uppercase text-center">Age</th>
                    <th className="p-6 text-xs font-black tracking-widest opacity-40 uppercase text-right">Peak WA Standard</th>
                 </tr>
              </thead>
              <tbody>
                 {filtered.map(sw => (
                    <tr 
                      key={sw.id} 
                      className="registry-row"
                      onClick={() => router.push(`/swimmer/${sw.id}?period=${periodDays}`)}
                    >
                       <td className="p-6">
                          <div className="font-bold text-white text-lg">
                            {getPreferredName(sw)}
                          </div>
                          {sw.known_as && sw.full_name && sw.known_as !== sw.full_name && (
                            <div className="text-xs opacity-30 font-bold uppercase tracking-tighter mt-1">
                              {sw.full_name}
                            </div>
                          )}
                       </td>
                       <td className="p-6">
                          <span className="squad-tag">{sw.squads?.name || 'Unassigned'}</span>
                       </td>
                       {/* '—' when there is no swimmable week: showing 0% or
                           100% for an athlete we have no data on is a made-up
                           number either way. */}
                       <td className="p-6 text-center font-bold text-white">
                          {sw.attendancePct === null || sw.attendancePct === undefined ? '—' : `${sw.attendancePct}%`}
                       </td>
                       <td className="p-6 text-center font-bold" style={{ color: sw.meetCompliance >= 100 ? 'var(--accent-cyan)' : 'white' }}>
                          {sw.meetCompliance === null || sw.meetCompliance === undefined ? '—' : `${sw.meetCompliance}%`}
                       </td>
                        <td className="p-6 text-center font-bold opacity-60">
                           {sw.age || 'N/A'}
                        </td>
                       <td className="p-6 text-right">
                          <div className="text-2xl font-black text-white">{sw.peakWA}</div>
                          <div className="text-[0.6rem] font-black tracking-widest opacity-20 uppercase">WA POINTS</div>
                       </td>
                    </tr>
                 ))}
              </tbody>
           </table>
        </div>
        </>
      )}

      <style jsx>{`
        .registry-row {
          cursor: pointer;
          border-bottom: 1px solid rgba(255,255,255,0.03);
          transition: all 0.2s ease;
        }
        .registry-row:hover {
          background: rgba(255, 255, 255, 0.03);
          border-left: 4px solid var(--accent-cyan);
        }
        .squad-tag {
          padding: 6px 14px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          font-size: 0.75rem;
          font-weight: 800;
          color: var(--accent-cyan);
        }
        .tactical-search-container {
          position: relative;
          display: flex;
          align-items: center;
        }
        .search-icon {
          position: absolute;
          left: 16px;
          color: rgba(255,255,255,0.3);
          pointer-events: none;
        }
        .tactical-search-input {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          padding: 12px 16px 12px 48px;
          color: white;
          font-size: 0.95rem;
          transition: all 0.3s ease;
        }
        .tactical-search-input:focus {
          outline: none;
          background: rgba(255, 255, 255, 0.05);
          border-color: var(--accent-cyan);
          box-shadow: 0 0 20px rgba(6, 182, 212, 0.15);
        }
      `}</style>
    </Layout>
  );
}
