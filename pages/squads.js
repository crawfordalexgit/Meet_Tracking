import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { authedFetch } from '../lib/api-client';
import { fetchAllRows } from '../lib/paginate';
import { computeSquadStats, calculateSquadHealth } from '../lib/analytics-utils';
import Head from 'next/head';
import { useRouter } from 'next/router';

function SquadCard({ squad, periodDays }) {
  const router = useRouter();
  const isCritical = squad.overall < 50;
  const needsAttention = squad.overall >= 50 && squad.overall < 75;
  const statusClass = isCritical ? 'critical' : needsAttention ? 'attention' : 'success';

  return (
    <div 
      className="glass-card squad-card animate-fade-in"
      onClick={() => router.push(`/squad/${squad.id}?period=${periodDays}`)}
    >
      <div className="squad-header">
        <div className="squad-info">
          <h3 className="squad-name">{squad.name}</h3>
          <div className="squad-meta">{squad.count} ACTIVE ATHLETES</div>
        </div>
        <div className={`health-indicator ${statusClass}`}>
          <div className="health-value">{squad.overall}%</div>
          <div className="health-label">HEALTH</div>
        </div>
      </div>
      
      <div className="squad-stats-grid">
        <div className="stat-pill">
           <span className="label">MEETS</span>
           <span className="value">{squad.meets}%</span>
        </div>
        <div className="stat-pill">
           <span className="label">TRAINING</span>
           <span className="value">{squad.training}%</span>
        </div>
        <div className="stat-pill">
           <span className="label">VOLUME</span>
           <span className="value">{squad.volume}%</span>
        </div>
        <div className="stat-pill">
           <span className="label">PEAK WA</span>
           <span className="value" style={{ color: 'var(--accent-amber)' }}>{squad.avgPts}</span>
        </div>
      </div>

      <div className="achievement-summary-row" style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem' }}>
        {squad.achievements?.nationals > 0 && (
          <div className="ach-badge" style={{ background: 'rgba(255, 234, 0, 0.1)', color: 'var(--accent-amber)', border: '1px solid rgba(255, 234, 0, 0.3)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.6rem', fontWeight: 900 }}>
            {squad.achievements.nationals} NATIONALS
          </div>
        )}
        {squad.achievements?.regionals > 0 && (
          <div className="ach-badge" style={{ background: 'rgba(0, 212, 255, 0.1)', color: 'var(--accent-cyan)', border: '1px solid rgba(0, 212, 255, 0.3)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.6rem', fontWeight: 900 }}>
            {squad.achievements.regionals} REGIONALS
          </div>
        )}
        {squad.achievements?.counties > 0 && (
          <div className="ach-badge" style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'white', border: '1px solid rgba(255, 255, 255, 0.2)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.6rem', fontWeight: 900 }}>
            {squad.achievements.counties} COUNTY
          </div>
        )}
      </div>

      <div className="squad-brief">
         <div className="brief-tag">COACHESEYE</div>
         <p className="brief-text">
            {squad.overall > 80 
              ? "Elite operational rhythm. High compliance is delivering sustained technical growth."
              : squad.overall > 60 
                ? "Stable performance baseline. Focus on individual attendance gaps to trigger next phase."
                : "Operational Risk Identified. Volume deficit and attendance volatility require immediate intervention."}
         </p>
      </div>

      <style jsx>{`
        .squad-card {
          padding: 2.5rem;
          cursor: pointer;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(13, 17, 23, 0.4);
          position: relative;
          overflow: hidden;
        }
        .squad-card:hover {
          background: rgba(13, 17, 23, 0.8);
          border-color: var(--accent-cyan);
          transform: translateY(-8px);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), 0 0 20px rgba(0, 212, 255, 0.1);
        }
        .squad-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 2rem;
        }
        .squad-name {
          font-size: 1.8rem;
          font-weight: 950;
          color: white;
          letter-spacing: -0.02em;
          margin: 0;
        }
        .squad-meta {
          font-size: 0.75rem;
          font-weight: 800;
          opacity: 0.8;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-top: 4px;
        }
        .health-indicator {
          text-align: right;
          padding: 10px 16px;
          border-radius: 12px;
          background: rgba(255,255,255,0.03);
        }
        .health-value {
          font-size: 1.4rem;
          font-weight: 950;
          line-height: 1;
        }
        .health-label {
          font-size: 0.55rem;
          font-weight: 900;
          opacity: 0.8;
          margin-top: 2px;
        }
        .health-indicator.success { color: var(--accent-cyan); }
        .health-indicator.attention { color: var(--accent-amber); }
        .health-indicator.critical { color: #f87171; }

        .squad-stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 2rem;
        }
        .stat-pill {
          background: rgba(255,255,255,0.03);
          padding: 12px;
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .stat-pill .label {
          font-size: 0.55rem;
          font-weight: 900;
          opacity: 0.8;
          letter-spacing: 0.1em;
        }
        .stat-pill .value {
          font-size: 1.1rem;
          font-weight: 800;
          color: white;
        }

        .squad-brief {
          border-top: 1px solid rgba(255,255,255,0.05);
          padding-top: 1.5rem;
        }
        .brief-tag {
          font-size: 0.6rem;
          font-weight: 950;
          color: var(--accent-cyan);
          letter-spacing: 0.15em;
          margin-bottom: 8px;
        }
        .brief-text {
          font-size: 0.85rem;
          color: rgba(255,255,255,0.85);
          line-height: 1.5;
          margin: 0;
        }
      `}</style>
    </div>
  );
}

export default function SquadsRegistry({ session }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [squads, setSquads] = useState([]);
  const [periodDays, setPeriodDays] = useState(365);

  const PERIOD_OPTIONS = [
    { label: '30 Days', days: 30 },
    { label: '90 Days', days: 90 },
    { label: '6 Months', days: 180 },
    { label: '52 Weeks', days: 365 },
  ];

  const handlePeriodChange = (days) => {
    router.push({ pathname: '/squads', query: { ...router.query, period: days } }, undefined, { shallow: true });
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
      const startStr = new Date(new Date() - period * 86400000).toISOString();

      const fetchPaged = (table, select = '*', filter = null) => fetchAllRows(supabase, table, { select, filter, maxPages: 20 });

      // 1. Fetch data
      const [sRes, swimmersArr, resultsArr, attendanceArr, sessionsArr, membershipsArr, exRes, rankingsRes] = await Promise.all([
        supabase.from('squads').select('*').eq('is_squad', true).order('name'),
        fetchPaged('swimmers', '*'),
        fetchPaged('results', '*, meets(id,name,type)', q => q.gte('date', startStr)),
        fetchPaged('training_attendance', '*', q => q.gte('date', startStr)),
        fetchPaged('sessions', '*'),
        authedFetch('/api/memberships').then(r => r.ok ? r.json() : []),
        supabase.from('club_exemptions').select('*'),
        supabase.from('rankings').select('*').order('snapshot_date', { ascending: false })
      ]);

      const squadsArr = sRes.data || [];
      const exemptionsArr = exRes.data || [];
      const rankings = rankingsRes.data || [];

      const uniqueSnapshots = [...new Set((rankings || []).map(r => r.snapshot_date))].sort((a,b) => new Date(b) - new Date(a));
      const latestSnapshot = uniqueSnapshots[0] || null;
      const currentRankings = (rankings || []).filter(r => r.snapshot_date === latestSnapshot);

      // 2. Map KPIs
      const kpis = squadsArr.map(s => {
        const squadSwimmers = swimmersArr.filter(sw => sw.squad_id === s.id);

        // Canonical, shared computation (identical to the squad detail page).
        const stats = computeSquadStats(s, squadSwimmers, {
          attendance: attendanceArr,
          sessions: sessionsArr,
          results: resultsArr,
          memberships: membershipsArr,
          exemptions: exemptionsArr,
          period
        });

        const squadRanks = currentRankings.filter(r => squadSwimmers.some(sw => sw.id === r.swimmer_id));
        const achievements = {
          nationals: new Set(squadRanks.filter(r => r.district === 'England' && r.rank <= 40).map(r => r.swimmer_id)).size,
          regionals: new Set(squadRanks.filter(r => r.district === 'South East' && r.rank <= 30).map(r => r.swimmer_id)).size,
          counties: new Set(squadRanks.filter(r => r.district === 'Kent' && r.rank <= 10).map(r => r.swimmer_id)).size
        };

        // Health via the shared calculateSquadHealth so the registry and detail agree.
        const overall = calculateSquadHealth(
          { avgTraining: stats.training, avgVolume: stats.volume, avgVelocity: stats.avgVelocity, complianceRate: stats.compliance },
          s
        ).total;

        // Count reflects the same set the stats average over (active, non-exempt).
        const count = squadSwimmers.filter(sw => sw.is_active !== false && !sw.is_exempt).length;

        return {
          ...s,
          training: stats.training,
          volume: stats.volume,
          meets: stats.meets,
          avgPts: stats.avgPts,
          achievements,
          overall,
          count
        };
      });

      setSquads(kpis);
    } catch (e) {
      console.error("Fetch Error:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout session={session}>
      <Head>
        <title>Squad Registry | CoachesEye</title>
      </Head>

      <div className="flex justify-between items-end mb-16">
        <div>
          <div className="flex items-center gap-4 mb-4">
            <div style={{ width: 4, height: 24, background: 'var(--accent-cyan)' }}></div>
            <span style={{ fontSize: '0.75rem', fontWeight: 950, letterSpacing: '0.2em', opacity: 0.8 }}>GLOBAL OPERATIONAL AUDIT</span>
          </div>
          <div className="flex items-center gap-6 mb-4" style={{ flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '3.5rem', fontWeight: 950, margin: 0, letterSpacing: '-0.04em', lineHeight: 1 }}>SQUAD <span style={{ color: 'var(--accent-cyan)' }}>REGISTRY</span></h1>
            <div className="period-selector-premium" style={{ marginLeft: '1.5rem' }}>
               {PERIOD_OPTIONS.map(opt => (
                 <button key={opt.days} className={`period-btn-premium ${periodDays === opt.days ? 'active' : ''}`} onClick={() => handlePeriodChange(opt.days)}>
                   {opt.label}
                 </button>
               ))}
            </div>
          </div>
          <p style={{ fontSize: '1rem', opacity: 0.9, marginTop: 12, maxWidth: '600px' }}>
            Real-time oversight of all competitive pathways. This registry synthesizes attendance, training volume, and championship compliance into a unified health score.
          </p>
        </div>
        
        <div className="glass-card p-6 flex gap-12">
           <div>
              <div style={{ fontSize: '0.6rem', fontWeight: 950, opacity: 0.8, letterSpacing: '0.1em' }}>TOTAL TRACKED PATHWAYS</div>
              <div style={{ fontSize: '2rem', fontWeight: 950 }}>{squads.length}</div>
           </div>
           <div>
              <div style={{ fontSize: '0.6rem', fontWeight: 950, opacity: 0.8, letterSpacing: '0.1em' }}>AGGREGATE HEALTH</div>
              <div style={{ fontSize: '2rem', fontWeight: 950, color: 'var(--accent-cyan)' }}>
                 {squads.length ? Math.round(squads.reduce((a, b) => a + b.overall, 0) / squads.length) : 0}%
              </div>
           </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center h-64 gap-6">
           <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-cyan-400"></div>
           <div style={{ fontSize: '0.75rem', fontWeight: 950, letterSpacing: '0.2em', opacity: 0.8 }}>SYNTHESIZING TACTICAL DATA...</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-10">
          {squads.map(s => <SquadCard key={s.id} squad={s} periodDays={periodDays} />)}
        </div>
      )}
    </Layout>
  );
}
