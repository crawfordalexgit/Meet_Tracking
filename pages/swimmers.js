import { useState, useEffect, useMemo } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { getPreferredName, calculateReliability, getCategoryBenchmark } from '../lib/analytics-utils';

export default function SwimmersRegistry({ session }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
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
    try {
      const period = parseInt(router.query.period) || 365;
      setPeriodDays(period);
      const y1ago = new Date(new Date() - period * 86400000).toISOString();
      const fetchPaged = async (table, select = '*', filter = null) => {
        let all = []; let page = 0; let more = true;
        while (more && page < 20) {
          let q = supabase.from(table).select(select).range(page * 1000, (page + 1) * 1000 - 1);
          if (filter) q = filter(q);
          const { data } = await q;
          if (!data || data.length === 0) break;
          all = [...all, ...data];
          if (data.length < 1000) more = false;
          page++;
        }
        return all;
      };

      const [swRes, results, attendance, sessions, exRes, memberships, rankRes] = await Promise.all([
        supabase.from('swimmers').select('*, squads(*)').not('squad_id', 'is', null).order('full_name'),
        fetchPaged('results', 'swimmer_id, wa_pts, date, meets(id,name,type)', q => q.gte('date', y1ago)),
        fetchPaged('training_attendance', '*', q => q.gte('date', y1ago)),
        fetchPaged('sessions', '*'),
        supabase.from('club_exemptions').select('*'),
        fetchPaged('session_memberships', '*'),
        supabase.from('rankings').select('swimmer_id, district')
      ]);

      if (swRes.error) throw swRes.error;

      const enrichedSwimmers = (swRes.data || []).map(swimmer => {
        const swimmerResults = results.filter(r => r.swimmer_id === swimmer.id);
        const peakWA = swimmerResults.length > 0 ? Math.max(...swimmerResults.map(r => r.wa_pts || 0)) : 0;

        const now = new Date();
        const targetYear = now.getMonth() >= 4 ? now.getFullYear() + 1 : now.getFullYear();
        const age = swimmer.year_of_birth ? targetYear - swimmer.year_of_birth : (swimmer.date_of_birth ? targetYear - new Date(swimmer.date_of_birth).getFullYear() : null);

        const districts = [];
        if (age) {
          const cQT = getCategoryBenchmark(age, swimmer.gender, '', 'COUNTY');
          const rQT = getCategoryBenchmark(age, swimmer.gender, '', 'REGIONAL');
          if (peakWA >= rQT) {
            districts.push('South East');
            districts.push('Kent');
          } else if (peakWA >= cQT) {
            districts.push('Kent');
          }
        }

        const rel = calculateReliability(
          swimmer,
          attendance,
          sessions,
          swimmerResults,
          period,
          exRes.data || [],
          memberships.filter(m => m.swimmer_id === swimmer.id)
        );
        
        return { 
          ...swimmer, 
          peakWA, 
          attendancePct: rel.percentage || 0, 
          meetCompliance: rel.complianceRate || 0,
          districts,
          age
        };
      });

      setSwimmers(enrichedSwimmers);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    let list = swimmers;
    if (router.query.district) {
      list = list.filter(s => s.districts?.includes(router.query.district));
    }
    return list.filter(s => 
      getPreferredName(s).toLowerCase().includes(search.toLowerCase()) ||
      s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      s.squads?.name?.toLowerCase().includes(search.toLowerCase())
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
      ) : (
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
                          <div className="text-xs opacity-30 font-bold uppercase tracking-tighter mt-1">
                            ID: {sw.id.slice(0,8)} 
                            {sw.known_as && <span className="ml-2">| Known as: {sw.known_as}</span>}
                            {sw.full_name && sw.known_as && <span className="ml-2">| Full: {sw.full_name}</span>}
                            {sw.legal_first_name && <span className="ml-2">| Legal: {sw.legal_first_name}</span>}
                          </div>
                       </td>
                       <td className="p-6">
                          <span className="squad-tag">{sw.squads?.name || 'Unassigned'}</span>
                       </td>
                       <td className="p-6 text-center font-bold text-white">
                          {sw.attendancePct}%
                       </td>
                       <td className="p-6 text-center font-bold" style={{ color: sw.meetCompliance >= 100 ? 'var(--accent-cyan)' : 'white' }}>
                          {sw.meetCompliance}%
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
