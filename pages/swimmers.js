import { useState, useEffect, useMemo } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { getPreferredName } from '../lib/analytics-utils';

export default function SwimmersRegistry({ session }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [swimmers, setSwimmers] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: swData } = await supabase.from('swimmers').select('*, squads(id,name)').order('full_name');
      const { data: rData } = await supabase.from('results').select('swimmer_id, wa_pts').order('wa_pts', { ascending: false });

      // Map peak WA points to each swimmer
      const mapped = swData.map(s => {
        const peak = rData.find(r => r.swimmer_id === s.id)?.wa_pts || 0;
        return { ...s, peak };
      });

      setSwimmers(mapped);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    return swimmers.filter(s => 
      getPreferredName(s).toLowerCase().includes(search.toLowerCase()) ||
      s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      s.squads?.name?.toLowerCase().includes(search.toLowerCase())
    );
  }, [swimmers, search]);

  return (
    <Layout session={session}>
      <Head>
        <title>Athlete Registry | CoachesEye</title>
      </Head>

      <div className="flex justify-between items-center mb-12">
        <div>
          <h1 style={{ fontSize: '3rem', fontWeight: 950, margin: 0, letterSpacing: '-0.04em' }}>ATHLETE <span style={{ color: 'var(--accent-cyan)' }}>REGISTRY</span></h1>
          <p style={{ fontSize: '0.9rem', opacity: 0.4, marginTop: 8 }}>Central database of Tonbridge Swimming Club performance assets.</p>
        </div>
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
                    <th className="p-6 text-xs font-black tracking-widest opacity-40 uppercase text-center">Age</th>
                    <th className="p-6 text-xs font-black tracking-widest opacity-40 uppercase text-right">Peak WA Standard</th>
                 </tr>
              </thead>
              <tbody>
                 {filtered.map(sw => (
                    <tr 
                      key={sw.id} 
                      className="registry-row"
                      onClick={() => router.push(`/swimmer/${sw.id}`)}
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
                       <td className="p-6 text-center font-bold opacity-60">
                          {sw.date_of_birth ? (new Date().getFullYear() - new Date(sw.date_of_birth).getFullYear()) : sw.year_of_birth ? (new Date().getFullYear() - sw.year_of_birth) : 'N/A'}
                       </td>
                       <td className="p-6 text-right">
                          <div className="text-2xl font-black text-white">{sw.peak}</div>
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
