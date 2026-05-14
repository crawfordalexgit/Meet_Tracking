import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function SquadIntelligenceCard({ squadId, squadName, stats, strokeData, trend, type = 'squad' }) {
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  React.useEffect(() => {
    fetchLatestInsight();
  }, [squadId]);

  const fetchLatestInsight = async () => {
    try {
      let query = supabase.from('ai_reports').select('*').order('created_at', { ascending: false });
      if (squadId) query = query.eq('squad_id', squadId);
      else if (type === 'club') query = query.eq('type', 'club');
      
      const { data, error } = await query.limit(10);
      if (error) throw error;
      
      if (data && data.length > 0) {
        setInsight(data[0].content);
        setHistory(data);
      }
    } catch (err) {
      console.error("Error fetching latest insight:", err);
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
          squadId: squadId || 'club', 
          type: type,
          squadName,
          stats,
          strokeData,
          trend
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

  if (!insight && !loading) {
    return (
      <div className="glass-card animate-fade-in no-print" style={{ textAlign: 'center', padding: '3rem' }}>
        <div className="section-title" style={{ justifyContent: 'center' }}>CoachesEye Insights Lab</div>
        <h3 style={{ marginBottom: '1rem', fontSize: '1.8rem', fontWeight: 900 }}>{type === 'club' ? 'Club' : 'Squad'} Performance Audit</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', maxWidth: '500px', margin: '0 auto 2rem', fontSize: '0.9rem' }}>
          Synthesizing aggregate data into a strategic technical roadmap for the entire {type === 'club' ? 'club' : 'squad'}.
        </p>
        <button className="intel-toggle" onClick={generateInsight} style={{ margin: '0 auto' }}>
          <span>✨</span> Generate CoachesEye Insights
        </button>
        {error && <p style={{ color: 'var(--accent-rose)', marginTop: '1rem', fontSize: '0.8rem' }}>{error}</p>}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="glass-card animate-fade-in no-print" style={{ padding: '4rem', textAlign: 'center' }}>
        <div className="loading-spinner" style={{ marginBottom: '1.5rem' }}>✨</div>
        <p className="animate-pulse" style={{ fontSize: '1.1rem', fontWeight: 600 }}>Synthesizing Technical Audit...</p>
        <p style={{ fontSize: '0.7rem', opacity: 0.5, marginTop: '10px' }}>Analyzing Aggregate Velocity & Squad Consistency</p>
      </div>
    );
  }

  return (
    <div className="glass-card animate-fade-in" style={{ position: 'relative', overflow: 'visible', padding: '2.5rem' }}>
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <div className="section-title">CoachesEye Insights: {type === 'club' ? 'Club' : 'Squad'} Profile</div>
          {insight.flag && (
            <div className={`status-badge ${insight.risk_level === 'high' ? 'critical' : (insight.risk_level === 'medium' ? 'attention' : 'success')}`} style={{ fontSize: '0.6rem', padding: '4px 10px' }}>
              {insight.flag}
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 no-print">
          {history.length > 1 && (
            <div className="flex items-center gap-2">
              <span style={{ fontSize: '0.6rem', opacity: 0.5, fontWeight: 900 }}>HISTORY</span>
              <select 
                className="period-selector-minimal"
                onChange={(e) => setInsight(history[e.target.value].content)}
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.65rem', padding: '4px 8px', borderRadius: '4px' }}
              >
                {history.map((h, i) => (
                  <option key={h.id} value={i}>
                    {new Date(h.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button className="period-btn" onClick={generateInsight} style={{ fontSize: '0.6rem' }}>✨ Refresh Audit</button>
          <button className="period-btn" onClick={() => setInsight(null)} style={{ fontSize: '0.6rem' }}>Reset</button>
        </div>
      </div>

      <div className="mb-10">
        <h2 style={{ fontSize: '2.2rem', fontWeight: 900, marginBottom: '1.5rem', color: 'var(--accent-cyan)', letterSpacing: '-0.03em' }}>{insight.headline}</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div className="md:col-span-2">
             <h4 className="section-title" style={{ fontSize: '0.6rem', marginBottom: '1rem' }}>Group Performance Profile</h4>
             <p style={{ fontSize: '1rem', lineHeight: '1.6', color: 'var(--text-primary)', marginBottom: '1.5rem' }}>{insight.summary.assessment}</p>
             
             <h4 className="section-title" style={{ fontSize: '0.6rem', marginBottom: '1rem' }}>Technical Review</h4>
             <div style={{ lineHeight: '1.7', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
               {insight.analysis.split('\n').map((p, i) => <p key={i} style={{ marginBottom: '1rem' }}>{p}</p>)}
             </div>
          </div>

          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6">
            <h4 className="section-title" style={{ fontSize: '0.6rem', marginBottom: '1.5rem', justifyContent: 'center' }}>Squad SWOT</h4>
            <div style={{ spaceY: '1.5rem' }}>
              <div className="mb-4">
                <div style={{ fontSize: '0.6rem', color: '#10b981', fontWeight: 900, textTransform: 'uppercase', marginBottom: 4 }}>Strengths</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{insight.summary.swot.strengths}</div>
              </div>
              <div className="mb-4">
                <div style={{ fontSize: '0.6rem', color: 'var(--accent-rose)', fontWeight: 900, textTransform: 'uppercase', marginBottom: 4 }}>Weaknesses</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{insight.summary.swot.weaknesses}</div>
              </div>
              <div className="mb-4">
                <div style={{ fontSize: '0.6rem', color: 'var(--accent-cyan)', fontWeight: 900, textTransform: 'uppercase', marginBottom: 4 }}>Opportunities</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{insight.summary.swot.opportunities}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.6rem', color: '#f59e0b', fontWeight: 900, textTransform: 'uppercase', marginBottom: 4 }}>Threats</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{insight.summary.swot.threats}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-white/5">
          <div>
            <h4 className="section-title" style={{ fontSize: '0.6rem' }}>Season Outlook</h4>
            <div style={{ padding: '1.25rem', background: 'rgba(0, 212, 255, 0.05)', borderRadius: '16px', border: '1px solid rgba(0, 212, 255, 0.1)' }}>
              <p style={{ fontSize: '0.9rem', fontStyle: 'italic', color: 'var(--text-primary)', margin: 0 }}>
                "{insight.foresight}"
              </p>
            </div>
          </div>

          <div>
            <h4 className="section-title" style={{ fontSize: '0.6rem' }}>Squad Training Focus</h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {insight.recommendations.map((rec, i) => (
                <li key={i} style={{ fontSize: '0.85rem', display: 'flex', gap: '12px', marginBottom: '10px' }}>
                  <div style={{ minWidth: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-cyan)', marginTop: '8px' }}></div>
                  <span style={{ color: 'var(--text-secondary)' }}>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <style jsx>{`
        .loading-spinner {
          font-size: 3rem;
          animation: spin 2s linear infinite;
          display: inline-block;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .animate-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .animate-fade-in {
          animation: fadeIn 0.4s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
