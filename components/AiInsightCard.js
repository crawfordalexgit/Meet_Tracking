import React, { useState } from 'react';

export default function AiInsightCard({ 
  swimmerId, 
  coachId, 
  performance_slope = 0,
  totalActualHours = 0,
  meetsAttended = 0,
  targetMeets = 0,
  complianceRate = 0,
  squadTargetCompliance = 75,
  insight,
  loading,
  onGenerate
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [correction, setCorrection] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [coachNotes, setCoachNotes] = useState('');

  const generateInsight = async (type = 'general') => {
    if (onGenerate) {
      await onGenerate(type, coachNotes);
    }
  };

  const saveFeedback = async (isPositive) => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/ai/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          swimmerId,
          coachId,
          originalInsight: insight,
          coachCorrection: isPositive ? 'PRECISION CONFIRMED' : correction,
          isPositive,
          prompt_refinement: "summary: MANDATORY: 3-4 substantial, narrative paragraphs. You are a professional sports editor. Paragraph 1: Set the scene of the meet and the club's presence. Paragraph 2: Discuss the medalists and elite finalists. Paragraph 3: Discuss the broader squad progress (PBs and Near Misses). Paragraph 4: Closing tactical reflection. Integrate specific names and stats directly into the narrative. Be descriptive, celebratory, and detailed."
        })
      });
      
      if (res.ok) {
        alert("Thank you! Your feedback has been saved and will be used to refine the performance engine.");
        setIsEditing(false);
        setCorrection('');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFeedback = (isPositive) => {
    if (isPositive) {
      saveFeedback(true);
    } else {
      setIsEditing(true);
    }
  };

  if (!insight && !loading) {
    return (
      <div className="glass-card animate-fade-in no-print" style={{ textAlign: 'center', padding: '3rem' }}>
        <div className="section-title" style={{ justifyContent: 'center' }}>CoachesEye Insights Lab</div>
        <h3 style={{ marginBottom: '1rem', fontSize: '1.8rem', fontWeight: 900 }}>Technical Performance Analysis</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', maxWidth: '500px', margin: '0 auto 2rem', fontSize: '0.9rem' }}>
          Synthesizing technical metrics, drop-off ratios, and technical conversion benchmarks into an actionable technical roadmap.
        </p>
        <div style={{ maxWidth: '500px', margin: '0 auto 2rem', textAlign: 'left' }}>
          <label style={{ fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', color: 'var(--accent-cyan)', display: 'block', marginBottom: '8px' }}>Coach Notes (AI Instructions)</label>
          <textarea
            className="glass-input w-full"
            placeholder="Specify focus areas for this analysis (e.g. 'Focus on training consistency gap' or 'Technical progression in Backstroke')..."
            value={coachNotes}
            onChange={(e) => setCoachNotes(e.target.value)}
            style={{ 
              minHeight: '80px', 
              fontSize: '0.85rem', 
              background: 'rgba(0,0,0,0.3)', 
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px',
              color: '#fff',
              padding: '12px',
              width: '100%',
              fontFamily: 'inherit',
              resize: 'vertical'
            }}
          />
        </div>
        <div className="flex justify-between gap-4" style={{ justifyContent: 'center' }}>
          <button className="intel-toggle" onClick={() => generateInsight('general')}>
            <span>✨</span> Performance Insight
          </button>
          <button className="intel-toggle" onClick={() => generateInsight('burnout')} style={{ borderColor: 'var(--accent-rose)', color: 'var(--accent-rose)', background: 'rgba(244, 63, 94, 0.1)' }}>
            <span>🔥</span> Burnout Check
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="glass-card animate-fade-in no-print" style={{ padding: '4rem', textAlign: 'center' }}>
        <div className="loading-spinner" style={{ marginBottom: '1.5rem' }}>✨</div>
        <p className="animate-pulse" style={{ fontSize: '1.1rem', fontWeight: 600 }}>Synthesizing Technical Roadmap...</p>
        <p style={{ fontSize: '0.7rem', opacity: 0.5, marginTop: '10px' }}>Analyzing Technical DNA & Meet Temperament</p>
      </div>
    );
  }

  return (
    <div className="group relative overflow-hidden rounded-xl bg-slate-900/40 border border-slate-800/50 p-6 transition-all hover:bg-slate-900/60 hover:border-blue-500/30 hover:shadow-[0_0_20px_rgba(59,130,246,0.1)]">
      {/* Subtle Glow Effect */}
      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-blue-500/5 blur-3xl transition-all group-hover:bg-blue-500/10" />
      
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <div className="section-title">CoachesEye Insights: Technical Profile</div>
          {insight.flag && (
            <div className={`status-badge ${insight.risk_level === 'high' ? 'critical' : (insight.risk_level === 'medium' ? 'attention' : 'success')}`} style={{ fontSize: '0.6rem', padding: '4px 10px' }}>
              {insight.flag}
            </div>
          )}
        </div>
        <div className="flex gap-2 no-print">
          <button className="period-btn" onClick={() => handleFeedback(true)} style={{ fontSize: '0.6rem', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>👍 Precise</button>
          <button className="period-btn" onClick={() => handleFeedback(false)} style={{ fontSize: '0.6rem', background: 'rgba(244, 63, 94, 0.1)', color: 'var(--accent-rose)' }}>👎 Correct</button>
          <button className="period-btn" onClick={() => generateInsight(insight?.type || 'general')} style={{ fontSize: '0.6rem', background: 'rgba(0, 150, 255, 0.15)', color: 'var(--accent-cyan)' }}>🔄 Refresh</button>
          <button className="period-btn" onClick={() => onGenerate('reset')} style={{ fontSize: '0.6rem' }}>Reset</button>
        </div>
      </div>

      {isEditing && (
        <div className="no-print mb-8 animate-fade-in" style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <h4 style={{ fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '1rem', color: 'var(--accent-rose)' }}>Coach Correction</h4>
          <textarea 
            className="glass-input w-full" 
            placeholder="Type your technical correction here (e.g. 'April Regionals were LC, not SC' or 'Target achieved last week')..."
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            style={{ minHeight: '100px', marginBottom: '1rem', fontSize: '0.9rem' }}
          />
          <div className="flex justify-end gap-3">
            <button className="period-btn" onClick={() => setIsEditing(false)}>Cancel</button>
            <button className="btn-premium-action" onClick={() => saveFeedback(false)} disabled={isSaving || !correction.trim()} style={{ fontSize: '0.7rem', padding: '8px 20px' }}>
              {isSaving ? 'Saving...' : 'Save Correction'}
            </button>
          </div>
        </div>
      )}

      <div className="mb-10">
        <h2 style={{ fontSize: '2.2rem', fontWeight: 900, marginBottom: '1.5rem', color: 'var(--accent-cyan)', letterSpacing: '-0.03em' }}>{insight.headline}</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div className="md:col-span-2">
             <h4 className="section-title" style={{ fontSize: '0.6rem', marginBottom: '1rem' }}>Executive Profile</h4>
             <p style={{ fontSize: '1rem', lineHeight: '1.6', color: 'var(--text-primary)', marginBottom: '1.5rem' }}>{insight.summary.assessment}</p>
             
             <h4 className="section-title" style={{ fontSize: '0.6rem', marginBottom: '1rem' }}>Technical Review</h4>
             <div style={{ lineHeight: '1.7', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
               {insight.analysis.split('\n').map((p, i) => <p key={i} style={{ marginBottom: '1rem' }}>{p}</p>)}
             </div>
          </div>

          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6">
            <h4 className="section-title" style={{ fontSize: '0.6rem', marginBottom: '1.5rem', justifyContent: 'center' }}>SWOT Analysis</h4>
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
            <h4 className="section-title" style={{ fontSize: '0.6rem' }}>CoachesEye Insights: Predictive Foresight</h4>
            <div style={{ padding: '1.25rem', background: 'rgba(var(--accent-cyan-rgb), 0.05)', borderRadius: '16px', border: '1px solid rgba(var(--accent-cyan-rgb), 0.1)' }}>
              <p style={{ fontSize: '0.9rem', fontStyle: 'italic', color: 'var(--text-primary)', margin: 0 }}>
                "{insight.foresight}"
              </p>
            </div>
          </div>

          <div>
            <h4 className="section-title" style={{ fontSize: '0.6rem' }}>Strategic Recommendations</h4>
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

      <div className="no-print mt-8 pt-6 border-t border-white/5">
        <h4 className="section-title" style={{ fontSize: '0.65rem', marginBottom: '0.75rem', color: 'var(--accent-cyan)' }}>Coach Notes (Instructions for next generation)</h4>
        <textarea
          className="glass-input w-full"
          placeholder="Enter custom focus areas or notes (e.g. 'Flag the 100m Free PB', 'Emphasize LC technical endurance')..."
          value={coachNotes}
          onChange={(e) => setCoachNotes(e.target.value)}
          style={{ 
            minHeight: '80px', 
            fontSize: '0.85rem', 
            background: 'rgba(0,0,0,0.2)', 
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            color: '#fff',
            padding: '12px',
            width: '100%',
            fontFamily: 'inherit',
            resize: 'vertical'
          }}
        />
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
