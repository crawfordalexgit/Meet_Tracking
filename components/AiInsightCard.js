import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function AiInsightCard({ 
  swimmerId, 
  coachId, 
  performance_slope = 0,
  totalActualHours = 0,
  meetsAttended = 0,
  targetMeets = 0,
  complianceRate = 0,
  squadTargetCompliance = 75,
  insight: initialInsight,
  loading: initialLoading,
  onGenerate
}) {
  const [insight, setInsight] = useState(initialInsight || null);
  const [loading, setLoading] = useState(initialLoading || false);
  const [isEditing, setIsEditing] = useState(false);
  const [correction, setCorrection] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [coachNotes, setCoachNotes] = useState('');
  const [parentInsight, setParentInsight] = useState(null);
  const [loadingParent, setLoadingParent] = useState(false);

  useEffect(() => {
    if (swimmerId) fetchLatestInsight();
  }, [swimmerId]);

  const fetchLatestInsight = async () => {
    try {
      const { data, error } = await supabase
        .from('swimmer_insights')
        .select('*')
        .eq('swimmer_id', swimmerId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        setInsight(data[0].full_report || data[0]);
      }
    } catch (err) {
      console.error('Failed to fetch insight', err);
    }
  };

  useEffect(() => {
    if (initialInsight) {
      setInsight(initialInsight);
    }
  }, [initialInsight]);

  useEffect(() => {
    if (initialLoading !== undefined) {
      setLoading(initialLoading);
    }
  }, [initialLoading]);

  const generateInsight = async (type = 'general') => {
    if (onGenerate) {
      await onGenerate(type, coachNotes);
    }
  };

  const generateParentInsight = async () => {
    setLoadingParent(true);
    setParentInsight(null);
    try {
      if (onGenerate) {
        const result = await onGenerate('parent_audit', coachNotes, true);
        if (result) setParentInsight(result);
      }
    } catch (e) {
      setParentInsight({ error: true, headline: 'Generation failed', overview: e.message });
    } finally {
      setLoadingParent(false);
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
      <div className="glass-card animate-fade-in no-print" style={{ padding: '1.5rem 2rem' }}>
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div style={{ flex: '1 1 30%', minWidth: '200px' }}>
            <div className="section-title" style={{ fontSize: '0.65rem', marginBottom: '4px' }}>CoachesEye Insights Lab</div>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.1em', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '1.5rem', marginTop: '1rem' }}>Technical Performance Analysis</h3>
            <p style={{ fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.6, margin: 0 }}>
              Synthesizing technical metrics, drop-off ratios, and technical benchmarks into an actionable technical roadmap.
            </p>
          </div>
          
          <div style={{ flex: '2 1 45%', width: '100%', minWidth: '250px' }}>
            <label style={{ fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', color: 'var(--accent-cyan)', display: 'block', marginBottom: '6px', letterSpacing: '0.05em' }}>
              Coach Notes (AI Instructions)
            </label>
            <textarea
              className="glass-input w-full"
              placeholder="Specify focus areas for this analysis (e.g. 'Focus on training consistency gap')..."
              value={coachNotes}
              onChange={(e) => setCoachNotes(e.target.value)}
              style={{ 
                minHeight: '60px', 
                fontSize: '0.8rem', 
                background: 'rgba(0,0,0,0.3)', 
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
                color: '#fff',
                padding: '8px 12px',
                width: '100%',
                fontFamily: 'inherit',
                resize: 'none'
              }}
            />
          </div>
          
          <div className="flex flex-col gap-2" style={{ flex: '1 1 20%', minWidth: '160px', width: '100%' }}>
            <button className="intel-toggle w-full" onClick={() => generateInsight('general')} style={{ padding: '10px 16px', fontSize: '0.8rem' }}>
              <span>✨</span> Performance Insight
            </button>
            <button 
              className="intel-toggle w-full" 
              onClick={() => generateInsight('burnout')} 
              style={{ 
                borderColor: 'var(--accent-rose)', 
                color: 'var(--accent-rose)', 
                background: 'rgba(244, 63, 94, 0.1)',
                padding: '10px 16px',
                fontSize: '0.8rem'
              }}
            >
              <span>🔥</span> Burnout Check
            </button>
            <button className="intel-toggle w-full" onClick={generateParentInsight} style={{ borderColor: 'var(--accent-amber)', color: 'var(--accent-amber)', background: 'rgba(245,158,11,0.1)', padding: '10px 16px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>👪</span> Parent Audit
            </button>
          </div>
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
    <div className="flex flex-col gap-6">
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
        <div className="flex gap-2 items-center no-print flex-wrap" style={{ zIndex: 10 }}>
          <button className="btn-premium-action" style={{ padding: '6px 12px', fontSize: '0.65rem' }} onClick={() => generateInsight('general')}>
            <span>✨</span> PERFORMANCE
          </button>
          <button className="btn-premium-intel" style={{ padding: '6px 12px', fontSize: '0.65rem', borderColor: 'var(--accent-rose)', color: 'var(--accent-rose)' }} onClick={() => generateInsight('burnout')}>
            <span>🔥</span> BURNOUT
          </button>
          <button className="btn-premium-intel" style={{ padding: '6px 12px', fontSize: '0.65rem', borderColor: 'var(--accent-amber)', color: 'var(--accent-amber)' }} onClick={generateParentInsight}>
            <span>👪</span> PARENT
          </button>
          <button className="period-btn" onClick={() => handleFeedback(true)} style={{ fontSize: '0.6rem', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>👍</button>
          <button className="period-btn" onClick={() => handleFeedback(false)} style={{ fontSize: '0.6rem', background: 'rgba(244, 63, 94, 0.1)', color: 'var(--accent-rose)' }}>👎</button>
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
        <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.1em', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '1.5rem', marginTop: '1rem' }}>{insight.headline}</h3>

      {insight.summary && <><div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div className="md:col-span-2">
             <h4 className="section-title" style={{ fontSize: '0.6rem', marginBottom: '1rem' }}>Executive Profile</h4>
             <p style={{ fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.6, marginBottom: '1.5rem' }}>{insight.summary.assessment}</p>
             
             <h4 className="section-title" style={{ fontSize: '0.6rem', marginBottom: '1rem' }}>Technical Review</h4>
             <div style={{ fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.6 }}>
               {(insight.analysis || '').split('\n').map((p, i) => <p key={i} style={{ marginBottom: '1rem' }}>{p}</p>)}
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

        {/* Beautiful SWOT Quadrant Grid */}
        {insight.swot_analysis && (
            <div style={{ marginTop: '2.5rem', marginBottom: '2.5rem' }}>
                <h3 className="section-title" style={{ color: 'var(--accent-cyan)', marginBottom: '1.5rem' }}>SWOT Analysis</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                    {[
                        { title: 'STRENGTHS', data: insight.swot_analysis.strengths, color: 'var(--accent-emerald)', bg: 'rgba(16, 185, 129, 0.05)' },
                        { title: 'WEAKNESSES', data: insight.swot_analysis.weaknesses, color: 'var(--accent-rose)', bg: 'rgba(244, 63, 94, 0.05)' },
                        { title: 'OPPORTUNITIES', data: insight.swot_analysis.opportunities, color: 'var(--accent-cyan)', bg: 'rgba(0, 212, 255, 0.05)' },
                        { title: 'THREATS', data: insight.swot_analysis.threats, color: 'var(--accent-amber)', bg: 'rgba(251, 191, 36, 0.05)' }
                    ].map((item, idx) => (
                        <div key={idx} style={{ background: item.bg, border: `1px solid ${item.color}`, borderRadius: '12px', padding: '1.5rem' }}>
                            <h4 style={{ color: item.color, margin: '0 0 1rem 0', fontSize: '0.85rem', fontWeight: 900, letterSpacing: '0.1em' }}>{item.title}</h4>
                            <div 
                                style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.85)', lineHeight: '1.7' }} 
                                dangerouslySetInnerHTML={{ 
                                    __html: (item.data || 'No data generated.')
                                        // Replace **Text** with White Bold Text
                                        .replace(/\*\*(.*?)\*\*/g, '<strong style="color: white; font-weight: 800;">$1</strong>')
                                        // Replace * with clean bullet points and line breaks
                                        .replace(/(?:\r\n|\r|\n)?\*\s+/g, '<br/><span style="opacity: 0.5; margin-right: 6px;">•</span>')
                                        // Clean up any leading breaks
                                        .replace(/^<br\/>/, '')
                                }} 
                            />
                        </div>
                    ))}
                </div>
            </div>
        )}

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
              {(insight.recommendations || []).map((rec, i) => (
                <li key={i} style={{ fontSize: '0.85rem', display: 'flex', gap: '12px', marginBottom: '10px' }}>
                  <div style={{ minWidth: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-cyan)', marginTop: '8px' }}></div>
                  <span style={{ color: 'var(--text-secondary)' }}>{rec}</span>
                </li>
              ))}
            </ul>
        </div>
      </div>
      </>}
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

    {/* Parent Audit Section — outside main card, inside flex wrapper */}
    {(loadingParent || parentInsight) && (
      <div className="glass-card animate-fade-in" style={{ padding: '2rem 2.5rem', borderLeft: '4px solid var(--accent-amber)' }}>
        <div className="flex justify-between items-center mb-4">
          <div>
            <div className="insight-tag" style={{ color: 'var(--accent-amber)' }}>VORONTSOV PARENTAL FRAMEWORK</div>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.1em', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '1.5rem', marginTop: '1rem' }}>Parent Development Audit</h3>
          </div>
          <button className="period-btn" onClick={() => setParentInsight(null)} style={{ fontSize: '0.6rem' }}>✕ Close</button>
        </div>
        {loadingParent && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--accent-amber)', fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.6 }}>👪 Generating parental guidance report...</div>}
        {parentInsight && !parentInsight.error && (
          <div className="space-y-4">
            <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>{parentInsight.headline}</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{parentInsight.overview}</p>
            {parentInsight.development_context && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6, background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '10px' }}>{parentInsight.development_context}</p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {parentInsight.vorontsov_dos?.length > 0 && (
                <div style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)', padding: '1rem', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--accent-emerald)', marginBottom: '0.75rem' }}>✅ DO</div>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                    {parentInsight.vorontsov_dos.map((d, i) => <li key={i} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px', lineHeight: 1.5 }}>• {d}</li>)}
                  </ul>
                </div>
              )}
              {parentInsight.vorontsov_donts?.length > 0 && (
                <div style={{ background: 'rgba(244,63,94,0.07)', border: '1px solid rgba(244,63,94,0.2)', padding: '1rem', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--accent-rose)', marginBottom: '0.75rem' }}>🚫 AVOID</div>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                    {parentInsight.vorontsov_donts.map((d, i) => <li key={i} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px', lineHeight: 1.5 }}>• {d}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
        {parentInsight?.error && <p style={{ color: 'var(--accent-rose)', fontSize: '0.85rem' }}>{parentInsight.overview}</p>}
      </div>
    )}
    </div>
  );
}
