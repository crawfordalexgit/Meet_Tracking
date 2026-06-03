import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function TalentIntelligenceCard({ squadId, squadName, stats, strokeData, trend, swimmers }) {
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchLatestInsight();
  }, [squadId]);

  const fetchLatestInsight = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_reports')
        .select('*')
        .eq('squad_id', squadId)
        .eq('type', 'talent')
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (error) throw error;
      if (data && data.length > 0) {
        setInsight(data[0].content);
      }
    } catch (err) {
      console.error("Error fetching latest talent insight:", err);
    }
  };

  const generateInsight = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          squadId: squadId, 
          type: 'talent',
          squadName,
          stats,
          strokeData,
          trend,
          swimmers
        })
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
      <div className="glass-card animate-fade-in no-print" style={{ padding: '3rem', textAlign: 'center' }}>
        <div className="loading-spinner" style={{ marginBottom: '1.5rem', fontSize: '2rem' }}>🧬</div>
        <p className="animate-pulse" style={{ fontSize: '1.1rem', fontWeight: 900, letterSpacing: '0.05em' }}>ANALYZING SQUAD POTENTIAL...</p>
        <p style={{ fontSize: '0.7rem', opacity: 0.5, marginTop: '10px', textTransform: 'uppercase' }}>Running Talent Identification Algorithms</p>
      </div>
    );
  }

  if (!insight) {
    return (
      <div className="glass-card animate-fade-in no-print" style={{ textAlign: 'center', padding: '2.5rem', borderLeft: '4px solid var(--accent-amber)' }}>
        <div className="flex items-center justify-center gap-3 mb-4">
           <div className="section-title" style={{ margin: 0 }}>Talent Identification Lab</div>
        </div>
        <h3 style={{ marginBottom: '1rem', fontSize: '1.4rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.02em' }}>Generate Talent Insight</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', maxWidth: '450px', margin: '0 auto 2rem', fontSize: '0.85rem', lineHeight: 1.5 }}>
          Our CoachesEye Insights engine will evaluate squad-wide consistency, workload stability, and progression rates to identify emerging potential.
        </p>
        <button className="intel-toggle" onClick={generateInsight} style={{ margin: '0 auto', background: 'var(--accent-amber)', color: '#000' }}>
          <span>🧬</span> Run Talent Audit
        </button>
        {error && <p style={{ color: 'var(--accent-rose)', marginTop: '1rem', fontSize: '0.8rem' }}>{error}</p>}
      </div>
    );
  }

  return (
    <div className="glass-card animate-fade-in" style={{ padding: '2.5rem', borderLeft: '4px solid var(--accent-amber)', position: 'relative' }}>
      <div className="flex justify-between items-start mb-8">
        <div>
           <div className="section-title" style={{ color: 'var(--accent-amber)', fontSize: '0.65rem' }}>Talent Identification Analyst</div>
           <h3 style={{ fontSize: '1.8rem', fontWeight: 900, margin: '8px 0 0', letterSpacing: '-0.03em' }}>Squad Talent Insight</h3>
        </div>
        <button className="period-btn" onClick={generateInsight} style={{ fontSize: '0.6rem', opacity: 0.5 }}>🧬 Refresh Analysis</button>
      </div>

      <div className="mb-8">
        <div style={{ fontSize: '0.7rem', fontWeight: 900, opacity: 0.4, textTransform: 'uppercase', marginBottom: '1rem', letterSpacing: '0.1em' }}>Development Summary</div>
        <p style={{ fontSize: '1.1rem', fontWeight: 600, lineHeight: 1.6, color: '#fff', margin: 0 }}>{insight.summary}</p>
      </div>

      {insight.talented_individuals && insight.talented_individuals.length > 0 && (
        <div className="mb-10 bg-white/[0.03] rounded-xl p-6 border border-white/5">
          <div style={{ fontSize: '0.6rem', fontWeight: 900, color: 'var(--accent-amber)', textTransform: 'uppercase', marginBottom: '1.5rem', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1rem' }}>🏆</span> Identified Potential
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {insight.talented_individuals.map((ind, i) => (
              <div key={i} className="p-4 rounded-lg bg-black/20 border border-white/5">
                <div style={{ fontSize: '0.9rem', fontWeight: 900, color: '#fff', marginBottom: '4px' }}>{ind.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>{ind.insight}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-8 mb-8">
        <div>
           <div style={{ fontSize: '0.6rem', fontWeight: 900, color: 'var(--accent-emerald)', textTransform: 'uppercase', marginBottom: '1rem', letterSpacing: '0.1em' }}>Positive Indicators</div>
           <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
             {insight.positive_indicators?.map((item, i) => (
               <li key={i} style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', marginBottom: '8px', display: 'flex', gap: '8px' }}>
                 <span style={{ color: 'var(--accent-emerald)' }}>●</span> {item}
               </li>
             ))}
           </ul>
        </div>
        <div>
           <div style={{ fontSize: '0.6rem', fontWeight: 900, color: 'var(--accent-rose)', textTransform: 'uppercase', marginBottom: '1rem', letterSpacing: '0.1em' }}>Risk Indicators</div>
           <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
             {insight.risk_indicators?.map((item, i) => (
               <li key={i} style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', marginBottom: '8px', display: 'flex', gap: '8px' }}>
                 <span style={{ color: 'var(--accent-rose)' }}>●</span> {item}
               </li>
             ))}
           </ul>
        </div>
        <div>
           <div style={{ fontSize: '0.6rem', fontWeight: 900, color: 'var(--accent-cyan)', textTransform: 'uppercase', marginBottom: '1rem', letterSpacing: '0.1em' }}>Opportunities</div>
           <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
             {insight.opportunities?.map((item, i) => (
               <li key={i} style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', marginBottom: '8px', display: 'flex', gap: '8px' }}>
                 <span style={{ color: 'var(--accent-cyan)' }}>●</span> {item}
               </li>
             ))}
           </ul>
        </div>
      </div>

      <div style={{ padding: '1.5rem', background: 'rgba(245, 158, 11, 0.05)', borderRadius: '16px', border: '1px solid rgba(245, 158, 11, 0.1)' }}>
        <div style={{ fontSize: '0.6rem', fontWeight: 900, color: 'var(--accent-amber)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.1em' }}>Development Projection</div>
        <p style={{ fontSize: '0.9rem', fontWeight: 500, color: 'rgba(255,255,255,0.9)', margin: 0, fontStyle: 'italic' }}>
          "{insight.projection}"
        </p>
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .animate-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .animate-fade-in {
          animation: fadeIn 0.5s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .loading-spinner {
          animation: spin 3s linear infinite;
          display: inline-block;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
