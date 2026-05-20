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
    <div className="glass-card animate-fade-in" style={{ position: 'relative', overflow: 'visible', padding: '3.5rem' }}>
      <div className="flex justify-between items-center mb-12">
        <div className="flex items-center gap-6">
          <div className="section-title">COACHESEYE INTELLIGENCE LAB</div>
          {insight.flag && (
            <div className={`status-badge ${insight.risk_level === 'high' ? 'critical' : (insight.risk_level === 'medium' ? 'attention' : 'success')}`} style={{ fontSize: '0.7rem', padding: '6px 14px', borderRadius: '8px' }}>
              {insight.flag.toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 no-print">
          <button className="btn-premium-intel mini" onClick={generateInsight}>REFRESH AUDIT</button>
        </div>
      </div>

      <div className="mb-14">
        <h2 style={{ fontSize: '3.5rem', fontWeight: 950, marginBottom: '2rem', color: '#fff', letterSpacing: '-0.04em', lineHeight: 1.1 }}>{insight.headline}</h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 mb-12">
          <div className="lg:col-span-2">
             <div className="section-title" style={{ fontSize: '0.65rem', marginBottom: '1.5rem', opacity: 0.5 }}>GROUP PERFORMANCE PROFILE</div>
             <p style={{ fontSize: '1.15rem', lineHeight: '1.7', color: 'var(--text-primary)', marginBottom: '2.5rem', fontWeight: 500 }}>{insight.summary.assessment}</p>
             
             <div className="section-title" style={{ fontSize: '0.65rem', marginBottom: '1.5rem', opacity: 0.5 }}>TECHNICAL REVIEW</div>
             <div style={{ lineHeight: '1.8', color: 'rgba(255,255,255,0.7)', fontSize: '1rem' }}>
                {insight.analysis.split('\n').map((p, i) => <p key={i} style={{ marginBottom: '1.2rem' }}>{p}</p>)}
             </div>
          </div>

          <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-8 backdrop-blur-md">
            <div className="section-title" style={{ fontSize: '0.65rem', marginBottom: '2rem', justifyContent: 'center' }}>STRATEGIC SWOT</div>
            <div className="space-y-8">
              <div>
                <div style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 950, textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.1em' }}>Strengths</div>
                <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{insight.summary.swot.strengths}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--accent-rose)', fontWeight: 950, textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.1em' }}>Weaknesses</div>
                <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{insight.summary.swot.weaknesses}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)', fontWeight: 950, textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.1em' }}>Opportunities</div>
                <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{insight.summary.swot.opportunities}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 950, textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.1em' }}>Threats</div>
                <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{insight.summary.swot.threats}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-12 border-t border-white/10">
          <div>
            <div className="section-title" style={{ fontSize: '0.65rem' }}>SEASON OUTLOOK</div>
            <div style={{ padding: '2rem', background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.08), transparent)', borderRadius: '24px', border: '1px solid rgba(0, 212, 255, 0.15)' }}>
              <p style={{ fontSize: '1.1rem', fontStyle: 'italic', color: '#fff', margin: 0, lineHeight: 1.6, fontWeight: 500 }}>
                "{insight.foresight}"
              </p>
            </div>
          </div>

          <div>
            <div className="section-title" style={{ fontSize: '0.65rem' }}>SQUAD TRAINING FOCUS</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '1rem' }}>
              {insight.recommendations.map((rec, i) => (
                <li key={i} style={{ fontSize: '0.95rem', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-cyan)', marginTop: '8px', boxShadow: '0 0 10px var(--accent-cyan)' }}></div>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>{rec}</span>
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
