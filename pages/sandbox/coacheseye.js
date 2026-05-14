import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import Head from 'next/head';
import { supabase } from '../../lib/supabase';
import * as Diff from 'diff';

export default function CoachesEyeSandbox() {
  const [swimmers, setSwimmers] = useState([]);
  const [selectedSwimmerId, setSelectedSwimmerId] = useState('2310750a-21c3-4ba9-a480-7eb4bc5df8a9');
  const [facet, setFacet] = useState('training');
  const [prompt, setPrompt] = useState('');
  const [originalPrompt, setOriginalPrompt] = useState('');
  const [showDiff, setShowDiff] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [coachFeedback, setCoachFeedback] = useState('');
  const [refining, setRefining] = useState(false);
  const [lastDNA, setLastDNA] = useState(null);
  const [history, setHistory] = useState([]);
  const [countdown, setCountdown] = useState(0);
  const [lastSynced, setLastSynced] = useState(null);
  const [analysisPeriod, setAnalysisPeriod] = useState(365);
  const [previewMetrics, setPreviewMetrics] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);




  // Handle Quota Countdown
  useEffect(() => {
    let timer;
    if (countdown > 0) {
      timer = setInterval(() => {
        setCountdown(c => c - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  useEffect(() => {
    fetchSwimmers();
    loadPrompt(facet);
  }, []);

  const fetchSwimmers = async () => {
    const { data } = await supabase.from('swimmers').select('id, full_name').order('full_name');
    setSwimmers(data || []);
    // Only set default if not already set by state
    if (data?.length > 0 && !selectedSwimmerId) setSelectedSwimmerId(data[0].id);
  };

  useEffect(() => {
    if (selectedSwimmerId) {
      fetchPreviewMetrics();
    }
  }, [selectedSwimmerId, analysisPeriod]);

  const fetchPreviewMetrics = async () => {
    setLoadingPreview(true);
    try {
      const res = await fetch('/api/ai/sandbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ swimmerId: selectedSwimmerId, period: analysisPeriod, previewOnly: true, facet: 'training' })
      });
      const data = await res.json();
      if (data.metrics) setPreviewMetrics(data.metrics);
    } catch (e) {
      console.error("Preview fetch failed", e);
    } finally {
      setLoadingPreview(false);
    }
  };

  const loadPrompt = async (facetName) => {

    try {
      const res = await fetch(`/api/prompts/load?facet=${facetName}`);
      const data = await res.json();
      setPrompt(data.content || '');
      setOriginalPrompt(data.content || '');
      setShowDiff(false);
      setLastSynced(new Date().toLocaleTimeString());
      fetchHistory(facetName);

    } catch (err) {
      console.error("Failed to load prompt:", err);
    }
  };

  const fetchHistory = async (facetName) => {
    try {
      const res = await fetch(`/api/prompts/history?facet=${facetName}`);
      const data = await res.json();
      setHistory(data.history || []);
    } catch (err) {
      console.error("Failed to fetch history:", err);
    }
  };

  const rollback = async (filename) => {
    if (!confirm("Rollback to this version? A backup of the current state will be created.")) return;
    try {
      const res = await fetch('/api/prompts/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facet, filename })
      });
      const data = await res.json();
      if (data.success) {
        setPrompt(data.content);
        fetchHistory(facet);
        alert("Rollback successful!");
      } else throw new Error(data.error);
    } catch (err) {
      alert("Rollback failed: " + err.message);
    }
  };

  const handleFacetChange = (newFacet) => {
    setFacet(newFacet);
    loadPrompt(newFacet);
  };

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/ai/sandbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ swimmerId: selectedSwimmerId, facet, customPrompt: prompt, period: analysisPeriod })

      });
      const data = await res.json();
      if (data.result?.error) {
        setError(data.result);
        if (data.result.isQuotaLimit && data.result.retryAfter) {
          setCountdown(data.result.retryAfter);
        }
      } else {
        setResult(data.result);
        setLastDNA(data.dna);
      }
    } catch (err) {
      setError({ message: "Network error occurred." });
    }
    setLoading(false);
  };

  const refinePrompt = async () => {
    if (!coachFeedback) return alert("Please enter feedback first.");
    setRefining(true);
    setOriginalPrompt(prompt); // Snapshot before change
    try {
      const res = await fetch('/api/ai/refine-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facet,
          currentPrompt: prompt,
          dna: lastDNA,
          originalOutput: result,
          feedback: coachFeedback
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPrompt(data.updatedPrompt);
      setCoachFeedback('');
      setShowDiff(true);
      fetchHistory(facet);
    } catch (err) {
      alert("Refinement failed: " + err.message);
    }
    setRefining(false);
  };

  const promoteToProduction = async () => {
    if (!confirm(`Are you sure you want to promote this prompt to production for ${facet}? This will create a backup of the current version.`)) return;
    setSaving(true);
    try {
      const res = await fetch('/api/prompts/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facet, content: prompt })
      });
      const data = await res.json();
      if (data.success) alert("Prompt promoted to production successfully!");
      else throw new Error(data.error);
    } catch (err) {
      alert("Promotion failed: " + err.message);
    }
    setSaving(false);
  };

  return (
    <Layout>
      <Head>
        <title>CoachesEye Sandbox | Tonbridge SC</title>
      </Head>

      <div className="profile-header mb-8">
        <div>
          <h1 className="text-4xl font-black mb-2">CoachesEye Sandbox</h1>
          <p className="text-dim">Test and refine AI coaching intelligence in a safe environment.</p>
        </div>
        <div className="flex gap-4">
          <button 
            className="btn-premium" 
            onClick={promoteToProduction}
            disabled={saving || !prompt}
            style={{ background: 'var(--accent-emerald)', borderColor: 'var(--accent-emerald)' }}
          >
            {saving ? 'Saving...' : 'Promote to Production'}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Configuration Panel */}
        <div className="glass-card p-6">
          <div className="kpi-label mb-4">Configuration</div>
          
          <div className="mb-6">
            <label className="block text-xs font-bold opacity-40 mb-2 uppercase tracking-wider">Select Swimmer</label>
            <select 
              className="search-input w-full bg-deep" 
              value={selectedSwimmerId} 
              onChange={(e) => setSelectedSwimmerId(e.target.value)}
              style={{ padding: '12px' }}
            >
              {swimmers.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>

          <div className="mb-6">
            <label className="block text-xs font-bold opacity-40 mb-2 uppercase tracking-wider">Intelligence Facet</label>
            <div className="flex gap-2">
              {['training', 'racing', 'technical', 'pathway'].map(f => (
                <button 
                  key={f}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${facet === f ? 'text-black' : 'bg-white/5 opacity-60 hover:opacity-100'}`}
                  onClick={() => handleFacetChange(f)}
                  style={facet === f ? { background: 'var(--accent-cyan)', color: '#000', boxShadow: '0 0 15px rgba(6,182,212,0.4)' } : {}}
                >
                  {f.toUpperCase()}
                </button>

              ))}
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-xs font-bold opacity-40 mb-2 uppercase tracking-wider">Analysis Window</label>
            <div className="flex gap-2">
              {[30, 90, 365].map(p => (
                <button 
                  key={p}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${analysisPeriod === p ? 'text-black' : 'bg-white/5 opacity-60 hover:opacity-100'}`}
                  onClick={() => setAnalysisPeriod(p)}
                  style={analysisPeriod === p ? { background: 'var(--accent-amber)', color: '#000', boxShadow: '0 0 15px rgba(245,158,11,0.4)' } : {}}
                >
                  {p} DAYS
                </button>
              ))}
            </div>
          </div>

          {previewMetrics && (
            <div className="mb-6 p-4 rounded-xl border border-white/5 bg-white/[0.02]">
              <div className="flex justify-between items-center mb-3">
                <label className="text-[10px] font-black opacity-30 uppercase tracking-widest">Calculated DNA Metrics ({previewMetrics.analysis_period}d)</label>
                {loadingPreview && <span className="text-[10px] animate-pulse text-amber-500">Recalculating...</span>}
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-xl font-black" style={{ color: previewMetrics.consistency_pct >= 75 ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>{previewMetrics.consistency_pct}%</div>
                  <div className="text-[9px] font-bold opacity-40 uppercase">Consistency</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-black" style={{ color: previewMetrics.volume_pct >= 75 ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>{previewMetrics.volume_pct}%</div>
                  <div className="text-[9px] font-bold opacity-40 uppercase">Volume</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-black text-cyan-400">{previewMetrics.peak_wa}</div>
                  <div className="text-[9px] font-bold opacity-40 uppercase">Peak WA</div>
                </div>
              </div>
            </div>
          )}


          <div className="mb-6">
            <div className="flex justify-between items-end mb-2">
              <label className="text-xs font-bold opacity-40 uppercase tracking-wider">
                Prompt Editor (.md) 
                {lastSynced && <span className="ml-2 text-cyan-500/60">[Synced {lastSynced}]</span>}
              </label>
              <div className="flex gap-2">
                <button 
                  className="px-3 py-1 rounded text-[10px] font-black bg-white/5 hover:bg-white/10 transition-all flex items-center gap-1"
                  onClick={() => loadPrompt(facet)}
                  title="Reload from file system"
                >
                  🔄 SYNC FROM DISK
                </button>
                <button 
                  className={`px-3 py-1 rounded text-[10px] font-black transition-all ${!showDiff ? 'bg-cyan-500 text-white' : 'bg-white/5'}`}
                  onClick={() => setShowDiff(false)}
                >
                  EDITOR
                </button>

                <button 
                  className={`px-3 py-1 rounded text-[10px] font-black transition-all ${showDiff ? 'bg-amber-500 text-white' : 'bg-white/5'}`}
                  onClick={() => setShowDiff(true)}
                  disabled={!originalPrompt}
                >
                  VIEW CHANGES
                </button>
              </div>
            </div>
            
            {showDiff ? (
              <div className="w-full h-96 bg-black/40 border border-white/10 rounded-xl p-4 font-mono text-[11px] overflow-auto">
                {Diff.diffLines(originalPrompt, prompt).map((part, i) => (
                  <div 
                    key={i} 
                    className={`${part.added ? 'bg-emerald-500/20 text-emerald-300' : part.removed ? 'bg-red-500/20 text-red-300 line-through' : 'opacity-50'}`}
                    style={{ whiteSpace: 'pre-wrap' }}
                  >
                    {part.added ? '+ ' : part.removed ? '- ' : '  '}{part.value}
                  </div>
                ))}
              </div>
            ) : (
              <textarea 
                className="w-full h-96 bg-black/40 border border-white/10 rounded-xl p-4 font-mono text-sm focus:border-cyan-500 outline-none transition-all"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                spellCheck="false"
              />
            )}
          </div>

          <button 
            className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-black rounded-xl transition-all shadow-lg shadow-cyan-900/20"
            onClick={runAnalysis}
            disabled={loading}
          >
            {loading ? 'Analyzing DNA...' : 'Run Sandbox Analysis'}
          </button>
        </div>

        {/* Results Panel */}
        <div className="flex flex-col gap-8">
          <div className="glass-card p-6 flex-1 overflow-auto">
            <div className="flex justify-between items-center mb-6">
              <div className="kpi-label">AI Insights Output</div>
              {result && <div className="status-badge success">JSON PARSED</div>}
            </div>

            {error && (
            <div className={`p-6 rounded-2xl mb-8 border animate-fade-in ${error.isQuotaLimit ? 'bg-amber-500/10 border-amber-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
              <div className="flex gap-4">
                <div className="text-2xl">{error.isQuotaLimit ? '⏳' : '❌'}</div>
                <div>
                  <h3 className={`text-lg font-black mb-1 ${error.isQuotaLimit ? 'text-amber-400' : 'text-red-400'}`}>
                    {error.isQuotaLimit ? 'AI Brain is Cooling Down' : 'Analysis Encountered a Glitch'}
                  </h3>
                  <p className="text-sm opacity-70 leading-relaxed mb-4">
                    {error.isQuotaLimit 
                      ? `The AI free-tier quota (20 requests/min) is full. This resets every 60 seconds. You can continue editing the prompt manually while we wait.`
                      : error.message || "An unexpected error occurred. Please try refreshing the page."}
                  </p>
                  {error.isQuotaLimit && (
                    <button 
                      onClick={runAnalysis}
                      disabled={countdown > 0}
                      className={`px-4 py-2 text-white text-xs font-black rounded-lg transition-all ${countdown > 0 ? 'bg-white/10 opacity-50 cursor-not-allowed' : 'bg-amber-500 hover:bg-amber-400'}`}
                    >
                      {countdown > 0 ? `RETRY IN ${countdown}S` : 'RETRY ANALYSIS NOW'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

            {!result && !loading && !error && (
              <div className="h-full flex flex-center flex-col opacity-20">
                <div className="text-6xl mb-4">🧠</div>
                <p>Run analysis to see how the AI interprets the swimmer's DNA.</p>
              </div>
            )}

            {loading && (
              <div className="h-full flex flex-center flex-col">
                <div className="animate-spin text-4xl mb-4">🌀</div>
                <p className="animate-pulse">Consulting the Performance Analyst...</p>
              </div>
            )}

            {result && (
              <div className="animate-fade-in">
                <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl mb-6">
                  <h3 className="text-xl font-black text-cyan-400 mb-1">{result.headline || "Analysis Outcome"}</h3>
                  <div className="flex gap-2">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                      (result.compliance_rating || result.compliance_status?.rating) === 'GREEN' ? 'bg-emerald-500/20 text-emerald-400' :
                      (result.compliance_rating || result.compliance_status?.rating) === 'AMBER' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      Rating: {result.compliance_rating || result.compliance_status?.rating || 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Stakeholder Perspectives (Resilient Rendering) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  {(result.stakeholder_insights || result.metric_overview || result.metrics_deep_dive) ? (
                    <>
                      <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                        <div className="text-[10px] font-black text-cyan-400/60 mb-2 uppercase tracking-widest">Parent View</div>
                        <p className="text-xs opacity-70 leading-relaxed">
                          {result.stakeholder_insights?.parent_view || result.metric_overview?.yearly_baseline || result.overview || "See Raw DNA for details."}
                        </p>
                      </div>
                      <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                        <div className="text-[10px] font-black text-amber-400/60 mb-2 uppercase tracking-widest">Coach View</div>
                        <p className="text-xs opacity-70 leading-relaxed">
                          {result.stakeholder_insights?.coach_view || result.analysts_verdict || result.metric_overview?.three_month_trend || "See Raw DNA for details."}
                        </p>
                      </div>
                      <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                        <div className="text-[10px] font-black text-purple-400/60 mb-2 uppercase tracking-widest">Club View</div>
                        <p className="text-xs opacity-70 leading-relaxed">
                          {result.stakeholder_insights?.club_view || result.metric_overview?.one_month_status || result.compliance_status?.reasoning || "See Raw DNA for details."}
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="col-span-3 text-center py-8 opacity-40 italic text-xs">Awaiting stakeholder insight structure...</div>
                  )}
                </div>

                {/* SWOT Analysis Grid */}
                {result.swot_analysis && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                    <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                      <div className="text-[10px] font-black text-emerald-400 mb-2 uppercase tracking-widest">Strengths</div>
                      <p className="text-xs opacity-80 leading-relaxed">{result.swot_analysis.strengths}</p>
                    </div>
                    <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-xl">
                      <div className="text-[10px] font-black text-red-400 mb-2 uppercase tracking-widest">Weaknesses</div>
                      <p className="text-xs opacity-80 leading-relaxed">{result.swot_analysis.weaknesses}</p>
                    </div>
                    <div className="p-4 bg-cyan-500/5 border border-cyan-500/10 rounded-xl">
                      <div className="text-[10px] font-black text-cyan-400 mb-2 uppercase tracking-widest">Opportunities</div>
                      <p className="text-xs opacity-80 leading-relaxed">{result.swot_analysis.opportunities}</p>
                    </div>
                    <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                      <div className="text-[10px] font-black text-amber-400 mb-2 uppercase tracking-widest">Threats</div>
                      <p className="text-xs opacity-80 leading-relaxed">{result.swot_analysis.threats}</p>
                    </div>
                  </div>
                )}

                {/* Deep Dive & Metrics */}
                <div className="space-y-6">
                  {(result.metrics_deep_dive || result.metric_overview) && (
                    <div className="grid grid-cols-1 gap-4">
                      {Object.entries(result.metrics_deep_dive || result.metric_overview || {}).map(([key, value]) => (
                        <div key={key} className="p-4 bg-black/20 rounded-xl border border-white/5">
                          <div className="text-[10px] font-black opacity-40 mb-2 uppercase tracking-widest">{key.replace(/_/g, ' ')}</div>
                          <p className="text-sm opacity-80">{typeof value === 'string' ? value : JSON.stringify(value)}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Risk Flags */}
                  {result.risk_flags && result.risk_flags.length > 0 && (
                    <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl">
                      <div className="text-[10px] font-black text-red-400 mb-3 uppercase tracking-widest">Critical Risk Flags</div>
                      <div className="space-y-2">
                        {result.risk_flags.map((flag, i) => (
                          <div key={i} className="flex gap-2 text-xs text-red-300/80">
                            <span>⚠</span> {flag}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Priority Action Items */}
                  {result.action_items && (
                    <div>
                      <div className="text-[10px] font-black opacity-40 mb-3 uppercase tracking-widest">Priority Action Items</div>
                      <div className="space-y-3">
                        {result.action_items.map((item, i) => (
                          <div key={i} className="flex gap-3 text-sm">
                            <div className="w-6 h-6 bg-cyan-500/20 text-cyan-400 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0">{i+1}</div>
                            <div className="opacity-80 pt-1">{item}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Catch-all for other JSON keys */}
                  <details className="mt-8 opacity-20 hover:opacity-100 transition-all">
                    <summary className="text-[10px] font-black cursor-pointer uppercase tracking-widest">View Raw Intelligence DNA</summary>
                    <pre className="mt-4 p-4 bg-black/60 rounded-lg text-[10px] font-mono overflow-auto max-h-64 border border-white/5">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  </details>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Feedback Loop - Full Width Below */}
      <div className="glass-card p-6 mt-8" style={{ borderTop: '4px solid var(--accent-amber)' }}>
        <div className="kpi-label mb-4">Coach Feedback Loop</div>
        <p className="text-[10px] opacity-40 mb-4 uppercase tracking-wider">Help the AI learn your coaching style. Tell it what was wrong or what it missed.</p>
        
        <textarea 
          className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-4 text-sm focus:border-amber-500 outline-none transition-all mb-4"
          placeholder="e.g., 'Be more critical of the meet attendance; 2 meets in 6 months is too low for this squad...'"
          value={coachFeedback}
          onChange={(e) => setCoachFeedback(e.target.value)}
        />

        <button 
          className="w-full py-4 bg-amber-600 hover:bg-amber-500 text-white font-black rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-amber-900/20"
          onClick={refinePrompt}
          disabled={refining || !result || !coachFeedback}
        >
          {refining ? 'Meta-AI Refining Prompt...' : 'Apply Correction & Auto-Save'}
        </button>
      </div>

      {/* Version History */}
      <div className="glass-card p-6 mt-8">
        <div className="kpi-label mb-4">Version History & Rollback</div>
        {history.length === 0 ? (
          <p className="text-sm opacity-40 italic">No previous versions found for this facet.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-auto">
            {history.map((h, i) => (
              <div key={i} className="flex justify-between items-center p-3 bg-white/5 rounded-lg border border-white/5 hover:border-white/10 transition-all">
                <div>
                  <div className="text-sm font-bold">{new Date(h.date).toLocaleString('en-GB')}</div>
                  <div className="text-[10px] opacity-40 font-mono">{h.filename}</div>
                </div>
                <button 
                  className="px-4 py-1.5 bg-white/10 hover:bg-white/20 rounded text-[10px] font-black uppercase tracking-widest transition-all"
                  onClick={() => rollback(h.filename)}
                >
                  Restore Version
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .bg-deep { background: var(--bg-deep, #0a0a0a); }
        .flex-center { display: flex; align-items: center; justify-content: center; }
        .btn-premium {
          padding: 12px 24px;
          border-radius: 12px;
          font-weight: 900;
          font-size: 0.85rem;
          border: 1px solid rgba(255,255,255,0.1);
          transition: all 0.2s;
          cursor: pointer;
        }
        .btn-premium:hover:not(:disabled) {
          transform: translateY(-2px);
          filter: brightness(1.1);
        }
        .btn-premium:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        select option {
          background: #111;
          color: white;
        }
      `}</style>
    </Layout>
  );
}
