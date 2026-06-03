import { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import PremiumOrb from '../components/PremiumOrb';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine
} from 'recharts';

export default function ReportsCenter({ session }) {
  // Navigation & Loading States
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('briefings');
  const [squads, setSquads] = useState([]);
  
  // Selection Filters
  const [squadId, setSquadId] = useState('all');
  const [period, setPeriod] = useState('365');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isCustomDate, setIsCustomDate] = useState(false);

  // Loaded Data
  const [reportData, setReportData] = useState(null);
  const [aiReport, setAiReport] = useState(null);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [compilingBooklet, setCompilingBooklet] = useState(false);
  const [savedPdfs, setSavedPdfs] = useState([]);

  // Preset mapping to set dates
  const handlePeriodChange = (val) => {
    setPeriod(val);
    if (val === 'custom') {
      setIsCustomDate(true);
    } else {
      setIsCustomDate(false);
      const days = parseInt(val);
      const start = new Date(new Date() - days * 86400000);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(new Date().toISOString().split('T')[0]);
    }
  };

  // Run on page load
  useEffect(() => {
    // Set default dates to 365 days ago
    const start = new Date(new Date() - 365 * 86400000);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(new Date().toISOString().split('T')[0]);
    fetchReport();
  }, []);

  // Fetch report payload from Next.js API
  const fetchReport = async () => {
    setLoading(true);
    try {
      const payload = {
        squadId,
        period: period !== 'custom' ? parseInt(period) : undefined,
        startDate: isCustomDate ? startDate : undefined,
        endDate: isCustomDate ? endDate : undefined
      };

      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        setReportData(data);
        if (data.squads) setSquads(data.squads);
        if (data.savedReports) setSavedPdfs(data.savedReports);
        
        // Fetch saved AI briefings
        if (squadId !== 'all') {
          fetchAiReport(squadId);
        } else {
          setAiReport(null);
        }
      }
    } catch (e) {
      console.error('Failed to load compliance report data:', e);
    } finally {
      setLoading(false);
    }
  };

  // Fetch previously compiled AI briefings from db
  const fetchAiReport = async (targetSquadId) => {
    try {
      const { data, error } = await supabase
        .from('ai_reports')
        .select('*')
        .eq('squad_id', targetSquadId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;
      if (data && data.length > 0) {
        setAiReport(data[0]);
      } else {
        setAiReport(null);
      }
    } catch (err) {
      console.error('Failed to fetch AI report:', err);
    }
  };

  // Compile AI Briefing on demand
  const compileAiBriefing = async () => {
    if (squadId === 'all') return;
    setGeneratingBrief(true);
    try {
      const activeSquad = squads.find(s => s.id === squadId);
      const payload = {
        squadId,
        squadName: activeSquad?.name || 'Squad Overview',
        stats: {
          athletes: reportData.swimmersData.length,
          avgConsistency: Math.round(reportData.swimmersData.reduce((a, b) => a + b.trainingPct, 0) / reportData.swimmersData.length),
          avgVolume: Math.round(reportData.swimmersData.reduce((a, b) => a + b.volumePct, 0) / reportData.swimmersData.length),
          complianceRate: Math.round(reportData.swimmersData.filter(s => s.isMet).length / reportData.swimmersData.length * 100),
          peakStandard: Math.round(reportData.swimmersData.reduce((a, b) => a + b.peakPoints, 0) / reportData.swimmersData.length)
        },
        swimmers: reportData.swimmersData
      };

      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data) {
        await fetchAiReport(squadId);
      }
    } catch (e) {
      console.error('Error compiling intelligence brief:', e);
    } finally {
      setGeneratingBrief(false);
    }
  };

  // Compile PDF Compliance Booklet on demand
  const handleCompileBooklet = async () => {
    if (squadId === 'all') return;
    setCompilingBooklet(true);
    try {
      const activeSquad = squads.find(s => s.id === squadId);
      const res = await fetch('/api/export-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          squadId,
          squadName: activeSquad?.name,
          period: parseInt(period) || 365
        })
      });

      const data = await res.json();
      if (data.success) {
        // Refresh report data to get the updated PDF history
        await fetchReport();
      }
    } catch (e) {
      console.error('PDF Booklet compile error:', e);
    } finally {
      setCompilingBooklet(false);
    }
  };

  // Custom tooltips for Recharts scatter plot
  const CustomScatterTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const info = payload[0].payload;
      return (
        <div className="glass-card p-4 text-xs font-semibold" style={{ background: 'rgba(6, 11, 20, 0.95)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <p className="text-white text-sm font-bold uppercase mb-1">{info.name}</p>
          <p className="text-cyan-400 mb-1">Primary Discipline: <span className="text-white font-bold">{info.primaryGroup}</span></p>
          <p className="text-emerald-400">TEI (Perf): <span className="font-bold">{info.x.toFixed(2)}</span> pts/hr <span className="text-white/40">({info.peakPoints} pts)</span></p>
          <p className="text-pink-400">TEI-Δ (Improv): <span className="font-bold">{info.y >= 0 ? `+${info.y.toFixed(3)}` : info.y.toFixed(3)}</span> pts/hr <span className="text-white/40">({info.deltaWA >= 0 ? `+${info.deltaWA}` : info.deltaWA} pts)</span></p>
          <p className="text-amber-400 mt-1">Banked Hours: <span className="text-white font-bold">{Math.round(info.totalHours)}h</span></p>
        </div>
      );
    }
    return null;
  };

  // PB Conversion Leaderboard Calculation
  const pbLeaderboard = useMemo(() => {
    if (!reportData || !reportData.swimmersData) return [];
    return [...reportData.swimmersData]
      .filter(s => s.pbCount > 0 || s.wa_pts > 0)
      .map(s => {
        const totalRaces = s.pbCount + (s.avgPoints > 0 ? Math.round(s.totalHours / 12) : 2); // Approximation of competitive history in period
        const convRate = totalRaces > 0 ? Math.round((s.pbCount / totalRaces) * 100) : 0;
        return { ...s, totalRaces, convRate };
      })
      .sort((a, b) => b.convRate - a.convRate);
  }, [reportData]);


  // Scatter plot data compiling with TEI as x and TEI-Δ as y
  const scatterData = useMemo(() => {
    if (!reportData || !reportData.swimmersData) return [];
    return reportData.swimmersData.map(sw => ({
      x: sw.efficiency,
      y: sw.teiDelta,
      name: sw.preferred_name,
      primaryGroup: sw.primaryGroup,
      peakPoints: sw.peakPoints,
      deltaWA: sw.deltaWA,
      totalHours: sw.totalHours,
      efficiency: sw.efficiency,
      teiDelta: sw.teiDelta
    }));
  }, [reportData]);

  // Get swimmer cohort badge helper mapped to the 4 quadrants
  const getSwimmerCohortBadge = (swimmerId) => {
    if (!reportData || !reportData.cohorts) return null;
    if (reportData.cohorts.eliteResponders?.some(s => s.id === swimmerId)) {
      return <span className="bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 text-[9px] font-black px-2.5 py-1 rounded tracking-wider uppercase">Elite Responder</span>;
    }
    if (reportData.cohorts.stableElites?.some(s => s.id === swimmerId)) {
      return <span className="bg-cyan-400/10 text-cyan-400 border border-cyan-400/20 text-[9px] font-black px-2.5 py-1 rounded tracking-wider uppercase">Stable Elite</span>;
    }
    if (reportData.cohorts.developingResponders?.some(s => s.id === swimmerId)) {
      return <span className="bg-amber-400/10 text-amber-400 border border-amber-400/20 text-[9px] font-black px-2.5 py-1 rounded tracking-wider uppercase">Developing Responder</span>;
    }
    if (reportData.cohorts.lowResponders?.some(s => s.id === swimmerId)) {
      return <span className="bg-rose-400/10 text-rose-400 border border-rose-400/20 text-[9px] font-black px-2.5 py-1 rounded tracking-wider uppercase">Low Responder</span>;
    }
    return <span className="bg-white/5 text-white/50 border border-white/5 text-[9px] font-black px-2.5 py-1 rounded tracking-wider uppercase">Standard Baseline</span>;
  };


  return (
    <Layout session={session}>
      <Head>
        <title>Performance Reporting Center | CoachesEye</title>
      </Head>

      {/* Hero Section */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-8 mb-12">
        <div>
          <div className="flex items-center gap-4 mb-4">
            <div style={{ width: 4, height: 24, background: 'var(--accent-cyan)' }}></div>
            <span style={{ fontSize: '0.75rem', fontWeight: 950, letterSpacing: '0.2em', opacity: 0.8 }}>ON-DEMAND AUDITING SUITE</span>
          </div>
          <h1 style={{ fontSize: '3.5rem', fontWeight: 950, margin: 0, letterSpacing: '-0.04em', lineHeight: 1 }}>REPORTING <span style={{ color: 'var(--accent-cyan)' }}>CENTER</span></h1>
          <p style={{ fontSize: '1rem', opacity: 0.9, marginTop: 12, maxWidth: '650px' }}>
            Generate and audit deep athletic intelligence on demand. Cross-reference training efficiency ratios, benchmark gap analyses, and export legal-ready compliance booklets.
          </p>
        </div>

        {/* Filter Bar Controls */}
        <div className="glass-card flex flex-wrap gap-6 p-6 w-full xl:w-auto items-end">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black tracking-widest text-cyan-400/80 uppercase">Squad Focus</label>
            <select
              value={squadId}
              onChange={(e) => setSquadId(e.target.value)}
              className="bg-slate-900 border border-white/10 rounded-lg p-2 text-white text-xs font-semibold focus:border-cyan-400 outline-none w-48"
            >
              <option value="all">All Active Squads</option>
              {squads.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black tracking-widest text-cyan-400/80 uppercase">Auditing Period</label>
            <select
              value={period}
              onChange={(e) => handlePeriodChange(e.target.value)}
              className="bg-slate-900 border border-white/10 rounded-lg p-2 text-white text-xs font-semibold focus:border-cyan-400 outline-none w-36"
            >
              <option value="30">Last 30 Days</option>
              <option value="90">Last 90 Days</option>
              <option value="180">Last 180 Days</option>
              <option value="365">Last 365 Days</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {isCustomDate && (
            <>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black tracking-widest text-cyan-400/80 uppercase">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-slate-900 border border-white/10 rounded-lg p-2 text-white text-xs font-semibold focus:border-cyan-400 outline-none w-36"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black tracking-widest text-cyan-400/80 uppercase">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-slate-900 border border-white/10 rounded-lg p-2 text-white text-xs font-semibold focus:border-cyan-400 outline-none w-36"
                />
              </div>
            </>
          )}

          <button
            onClick={fetchReport}
            disabled={loading}
            className="btn-premium-intel bg-cyan-400 hover:bg-cyan-300 text-black px-6 py-2 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-2 h-fit"
            style={{ minHeight: '38px' }}
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-b-2 border-black"></div>
                Compiling...
              </>
            ) : (
              'Compile'
            )}
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-white/5 mb-10 overflow-x-auto select-none no-scrollbar">
        {[
          { id: 'briefings', label: 'AI Intel Briefings' },
          { id: 'efficiency', label: 'Load & Efficiency Matrix' },
          { id: 'pathway', label: 'Championship Pathway Audit' },
          { id: 'temperament', label: 'Competitive Temperament' },
          { id: 'export', label: 'PDF Export Cockpit' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`py-4 px-6 text-xs font-black tracking-widest uppercase transition-all duration-300 relative border-b-2 ${
              activeTab === tab.id
                ? 'text-cyan-400 border-cyan-400'
                : 'text-white/60 hover:text-white border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 gap-6">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-cyan-400"></div>
          <div className="text-xs font-black tracking-widest uppercase text-cyan-400/80">Synthesizing Analytical Datasets...</div>
        </div>
      ) : reportData ? (
        <div className="space-y-12">
          
          {/* TAB 1: AI INTEL BRIEFINGS */}
          {activeTab === 'briefings' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              <div className="lg:col-span-2 space-y-8">
                <div className="glass-card p-8">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-md font-black tracking-wider text-white uppercase">Latest Squad Briefing</h3>
                    {squadId !== 'all' && (
                      <button
                        onClick={compileAiBriefing}
                        disabled={generatingBrief}
                        className="bg-cyan-500 hover:bg-cyan-400 text-black text-[10px] font-black tracking-widest uppercase px-4 py-2 rounded-lg flex items-center gap-2"
                      >
                        {generatingBrief ? (
                          <>
                            <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-black"></div>
                            Analyzing Squad DNA...
                          </>
                        ) : (
                          'Compile New AI Briefing'
                        )}
                      </button>
                    )}
                  </div>

                  {squadId === 'all' ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-white/10 rounded-2xl">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/30 mb-4"><path d="M12 2a10 10 0 0 0-10 10c0 5.523 4.477 10 10 10s10-4.477 10-10A10 10 0 0 0 12 2zm0 15a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm1-4a1 1 0 0 1-2 0V9a1 1 0 0 1 2 0v4z"/></svg>
                      <h4 className="text-sm font-bold uppercase text-white/80">Select a specific squad</h4>
                      <p className="text-xs text-white/50 max-w-[300px] mt-2">AI briefings are customized at the squad or cohort level. Please select a specific squad in the header controls to view or compile intelligence briefings.</p>
                    </div>
                  ) : aiReport ? (
                    <div className="prose prose-invert max-w-none text-white/90 text-sm leading-relaxed space-y-6">
                      <div className="flex items-center gap-4 text-xs font-black tracking-wider text-cyan-400 uppercase mb-4">
                        <span>Report Compiled: {new Date(aiReport.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      
                      {/* Formatted rendering of structured analysis narrative */}
                      {typeof aiReport.content === 'object' ? (
                        <div className="space-y-8">
                          {aiReport.content.headline && (
                            <div className="border-l-4 border-cyan-400 bg-cyan-400/5 p-6 rounded-r-xl">
                              <h4 className="text-cyan-400 text-xs font-black uppercase tracking-wider mb-2">Tactical Headline</h4>
                              <p className="text-lg font-bold text-white leading-snug">{aiReport.content.headline}</p>
                            </div>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {aiReport.content.strengths && (
                              <div className="glass-card p-6 border border-emerald-400/10">
                                <h4 className="text-emerald-400 text-xs font-black uppercase tracking-wider mb-4 flex items-center gap-2">
                                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-400"></div> Technical Strengths
                                </h4>
                                <ul className="space-y-3">
                                  {Array.isArray(aiReport.content.strengths) ? aiReport.content.strengths.map((s, i) => (
                                    <li key={i} className="text-xs text-white/80 flex items-start gap-2"><span>•</span> {s}</li>
                                  )) : <p className="text-xs">{aiReport.content.strengths}</p>}
                                </ul>
                              </div>
                            )}

                            {aiReport.content.concerns && (
                              <div className="glass-card p-6 border border-rose-400/10">
                                <h4 className="text-rose-400 text-xs font-black uppercase tracking-wider mb-4 flex items-center gap-2">
                                  <div className="h-1.5 w-1.5 rounded-full bg-rose-400"></div> Load Risks & Red Flags
                                </h4>
                                <ul className="space-y-3">
                                  {Array.isArray(aiReport.content.concerns) ? aiReport.content.concerns.map((c, i) => (
                                    <li key={i} className="text-xs text-white/80 flex items-start gap-2"><span>•</span> {c}</li>
                                  )) : <p className="text-xs">{aiReport.content.concerns}</p>}
                                </ul>
                              </div>
                            )}
                          </div>

                          {aiReport.content.actionables && (
                            <div className="glass-card p-6 border border-amber-400/10">
                              <h4 className="text-amber-400 text-xs font-black uppercase tracking-wider mb-4">Immediate Coaching Actions</h4>
                              <ul className="space-y-3">
                                {Array.isArray(aiReport.content.actionables) ? aiReport.content.actionables.map((a, i) => (
                                  <li key={i} className="text-xs text-white/80 flex items-start gap-2"><span>•</span> {a}</li>
                                )) : <p className="text-xs">{aiReport.content.actionables}</p>}
                              </ul>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap">{aiReport.content}</div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-white/10 rounded-2xl">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/30 mb-4"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <h4 className="text-sm font-bold uppercase text-white/80">No AI Briefing Compiled</h4>
                      <p className="text-xs text-white/50 max-w-[280px] mt-2 mb-6">Create a dynamic intelligence brief covering squad progression patterns on demand.</p>
                      <button
                        onClick={compileAiBriefing}
                        disabled={generatingBrief}
                        className="bg-cyan-500 hover:bg-cyan-400 text-black text-[10px] font-black tracking-widest uppercase px-6 py-2.5 rounded-lg flex items-center gap-2"
                      >
                        {generatingBrief ? (
                          <>
                            <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-b-2 border-black"></div>
                            Auditing Performance Data...
                          </>
                        ) : (
                          'Compile First Briefing'
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar Quick Stats */}
              <div className="space-y-8">
                <div className="glass-card p-6">
                  <h3 className="text-xs font-black tracking-wider text-white uppercase mb-6">Squad Health Index</h3>
                  <div className="flex justify-center mb-6">
                    <PremiumOrb
                      value={reportData.swimmersData.length ? Math.round(reportData.swimmersData.reduce((a, b) => a + (b.isMet ? 100 : 30), 0) / reportData.swimmersData.length) : 0}
                      label="Aggregate Compliance"
                      size={120}
                    />
                  </div>
                  <div className="space-y-4 pt-4 border-t border-white/5">
                    <div className="flex justify-between text-xs">
                      <span className="text-white/60 font-semibold">Total Audited Swimmers</span>
                      <span className="text-white font-bold">{reportData.swimmersData.length}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-white/60 font-semibold">PBs Logged in Period</span>
                      <span className="text-white font-bold text-cyan-400">{reportData.swimmersData.reduce((a, b) => a + b.pbCount, 0)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-white/60 font-semibold">National-Level Standards</span>
                      <span className="text-white font-bold text-amber-400">{reportData.benchmarksSummary.nationalCount}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: LOAD & EFFICIENCY MATRIX */}
          {activeTab === 'efficiency' && (
            <div className="space-y-10">
              
              {/* Scatter Plot Visualizer */}
              <div className="glass-card p-8">
                <h3 className="text-md font-black tracking-wider text-white uppercase mb-2">Training & Improvement Efficiency Matrix</h3>
                <p className="text-xs text-white/60 mb-6">Plots current competitive capacity (TEI — Performance Efficiency on X-axis) against rolling progress (TEI-Δ — Improvement Efficiency on Y-axis). Targets the identification of elite responders and plateaus relative to workload.</p>
                
                <div style={{ width: '100%', height: 380 }}>
                  <ResponsiveContainer>
                    <ScatterChart margin={{ top: 20, right: 30, bottom: 25, left: 15 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        name="TEI"
                        unit=" pts/hr"
                        stroke="rgba(255,255,255,0.4)"
                        fontSize={10}
                        domain={['auto', 'auto']}
                        label={{ value: 'TEI — Performance Efficiency (Peak WA / Banked Hours)', position: 'bottom', fill: 'rgba(255,255,255,0.5)', fontSize: 11, offset: 10 }}
                      />
                      <YAxis
                        type="number"
                        dataKey="y"
                        name="TEI-Δ"
                        unit=" pts/hr"
                        stroke="rgba(255,255,255,0.4)"
                        fontSize={10}
                        domain={['auto', 'auto']}
                        label={{ value: 'TEI-Δ — Improvement Efficiency (Δ WA / Banked Hours)', angle: -90, position: 'insideLeft', fill: 'rgba(255,255,255,0.5)', fontSize: 11, offset: -5 }}
                      />
                      <ReferenceLine
                        x={reportData.avgTEI || 2.0}
                        stroke="rgba(6, 182, 212, 0.4)"
                        strokeDasharray="4 4"
                        label={{ value: `Squad Avg TEI (${(reportData.avgTEI || 2.0).toFixed(2)})`, fill: 'rgba(6, 182, 212, 0.7)', fontSize: 9, position: 'top' }}
                      />
                      <ReferenceLine
                        y={reportData.avgTEIDelta || 0.0}
                        stroke="rgba(236, 72, 153, 0.4)"
                        strokeDasharray="4 4"
                        label={{ value: `Squad Avg TEI-Δ (${(reportData.avgTEIDelta || 0.0).toFixed(3)})`, fill: 'rgba(236, 72, 153, 0.7)', fontSize: 9, position: 'right' }}
                      />
                      <Tooltip content={<CustomScatterTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                      <Scatter name="Swimmers" data={scatterData}>
                        {scatterData.map((entry, index) => {
                          // Color code points by their 4-Quadrant Cohort
                          const hasHighTEI = entry.efficiency >= (reportData.avgTEI || 2.0);
                          const hasHighTEIDelta = entry.teiDelta > 0.0;
                          
                          let color = '#a8a29e'; // default fallback
                          if (hasHighTEI && hasHighTEIDelta) color = '#10b981'; // Elite Responders - Emerald
                          else if (hasHighTEI && !hasHighTEIDelta) color = '#06b6d4'; // Stable Elites - Cyan
                          else if (!hasHighTEI && hasHighTEIDelta) color = '#f59e0b'; // Developing Responders - Amber
                          else color = '#ef4444'; // Low Responders - Rose

                          return <Cell key={`cell-${index}`} fill={color} />;
                        })}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>

                {/* TEI Index Explainer Legend */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 mt-6 border-t border-white/5 text-[11px] leading-relaxed">
                  <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                    <h5 className="font-black text-cyan-400 uppercase tracking-widest text-[9px] mb-2">A. TEI — Performance Efficiency</h5>
                    <p className="text-white/70 mb-2">This metric shows how elite a swimmer’s current performance level is relative to the training hours they’ve banked. It reflects technical efficiency, power-to-weight ratio, and event specialization.</p>
                    <code className="text-cyan-300 font-bold bg-black/40 px-1.5 py-0.5 rounded text-[10px]">Peak WA / Total Hours</code>
                  </div>
                  <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                    <h5 className="font-black text-pink-400 uppercase tracking-widest text-[9px] mb-2">B. TEI-Δ — Improvement Efficiency</h5>
                    <p className="text-white/70 mb-2">This metric shows how effectively training hours are converting into performance gains. It measures how many World Aquatics points are gained per hour of training across the selected period.</p>
                    <code className="text-pink-300 font-bold bg-black/40 px-1.5 py-0.5 rounded text-[10px]">Δ WA / Total Hours</code>
                  </div>
                  <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                    <h5 className="font-black text-amber-400 uppercase tracking-widest text-[9px] mb-2">C. Combined Interpretation</h5>
                    <p className="text-white/70 mb-1">Together, these two metrics show both current competitive level and improvement velocity. <strong>High TEI + High TEI-Δ</strong> indicates an elite responder.</p>
                    <p className="text-white/50">Swimmers with different meet frequencies are normalized fairly via hours trained to ensure equal developmental tracking.</p>
                  </div>
                </div>
              </div>


              {/* 4-Quadrant Visual Matrix Display */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                
                {/* Quadrant 1: Elite Responders */}
                <div className="glass-card p-6 border-l-4 border-emerald-400">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-emerald-400 text-xs font-black uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      Elite Responders (High TEI, High TEI-Δ)
                    </h4>
                    <span className="text-[10px] font-black text-white/50 uppercase">{(reportData.cohorts.eliteResponders || []).length} Swimmers</span>
                  </div>
                  <p className="text-[11px] text-white/60 mb-6 leading-relaxed">Strong performers who are also improving rapidly. These swimmers are responding extremely well to training volumes and mechanical instructions.</p>
                  
                  {(reportData.cohorts.eliteResponders || []).length > 0 ? (
                    <div className="space-y-3 max-h-[250px] overflow-y-auto no-scrollbar">
                      {(reportData.cohorts.eliteResponders || []).map(sw => (
                        <div key={sw.id} className="flex justify-between items-center p-3 rounded-lg bg-white/5 text-xs font-semibold">
                          <div className="flex flex-col">
                            <span className="text-white font-bold">{sw.preferred_name}</span>
                            <span className="text-[9px] text-white/40 italic">{sw.primaryGroup} Discipline</span>
                          </div>
                          <div className="flex gap-4 items-center">
                            <span className="text-emerald-400 font-black">TEI: {sw.efficiency.toFixed(2)}</span>
                            <span className="text-emerald-300 font-bold">TEI-Δ: +{sw.teiDelta.toFixed(3)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-white/40 italic">No swimmers in this quadrant for this period.</p>
                  )}
                </div>

                {/* Quadrant 2: Stable Elites */}
                <div className="glass-card p-6 border-l-4 border-cyan-400">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-cyan-400 text-xs font-black uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                      Stable Elites (High TEI, Low TEI-Δ)
                    </h4>
                    <span className="text-[10px] font-black text-white/50 uppercase">{(reportData.cohorts.stableElites || []).length} Swimmers</span>
                  </div>
                  <p className="text-[11px] text-white/60 mb-6 leading-relaxed">Strong performers who are currently plateauing. Highly efficient baseline capability, but require novel training stimuli to restart progression.</p>
                  
                  {(reportData.cohorts.stableElites || []).length > 0 ? (
                    <div className="space-y-3 max-h-[250px] overflow-y-auto no-scrollbar">
                      {(reportData.cohorts.stableElites || []).map(sw => (
                        <div key={sw.id} className="flex justify-between items-center p-3 rounded-lg bg-white/5 text-xs font-semibold">
                          <div className="flex flex-col">
                            <span className="text-white font-bold">{sw.preferred_name}</span>
                            <span className="text-[9px] text-white/40 italic">{sw.primaryGroup} Discipline</span>
                          </div>
                          <div className="flex gap-4 items-center">
                            <span className="text-cyan-400 font-black">TEI: {sw.efficiency.toFixed(2)}</span>
                            <span className="text-white/40">TEI-Δ: {sw.teiDelta >= 0 ? `+${sw.teiDelta.toFixed(3)}` : sw.teiDelta.toFixed(3)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-white/40 italic">No swimmers in this quadrant for this period.</p>
                  )}
                </div>

                {/* Quadrant 3: Developing Responders */}
                <div className="glass-card p-6 border-l-4 border-amber-400">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-amber-400 text-xs font-black uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                      Developing Responders (Low TEI, High TEI-Δ)
                    </h4>
                    <span className="text-[10px] font-black text-white/50 uppercase">{(reportData.cohorts.developingResponders || []).length} Swimmers</span>
                  </div>
                  <p className="text-[11px] text-white/60 mb-6 leading-relaxed">Swimmers who aren't elite yet, but are improving rapidly per hour trained. High coaching responsiveness; volume is effectively driving development.</p>
                  
                  {(reportData.cohorts.developingResponders || []).length > 0 ? (
                    <div className="space-y-3 max-h-[250px] overflow-y-auto no-scrollbar">
                      {(reportData.cohorts.developingResponders || []).map(sw => (
                        <div key={sw.id} className="flex justify-between items-center p-3 rounded-lg bg-white/5 text-xs font-semibold">
                          <div className="flex flex-col">
                            <span className="text-white font-bold">{sw.preferred_name}</span>
                            <span className="text-[9px] text-white/40 italic">{sw.primaryGroup} Discipline</span>
                          </div>
                          <div className="flex gap-4 items-center">
                            <span className="text-rose-400 font-black">TEI: {sw.efficiency.toFixed(2)}</span>
                            <span className="text-emerald-400 font-bold">TEI-Δ: +{sw.teiDelta.toFixed(3)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-white/40 italic">No swimmers in this quadrant for this period.</p>
                  )}
                </div>

                {/* Quadrant 4: Low Responders */}
                <div className="glass-card p-6 border-l-4 border-rose-400">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-rose-400 text-xs font-black uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                      Low Responders (Low TEI, Low TEI-Δ)
                    </h4>
                    <span className="text-[10px] font-black text-white/50 uppercase">{(reportData.cohorts.lowResponders || []).length} Swimmers</span>
                  </div>
                  <p className="text-[11px] text-white/60 mb-6 leading-relaxed">Plateaued at a lower performance standard. Candidates for immediate coaching intervention (technical stroke analysis, load reviews, or recovery tracking).</p>
                  
                  {(reportData.cohorts.lowResponders || []).length > 0 ? (
                    <div className="space-y-3 max-h-[250px] overflow-y-auto no-scrollbar">
                      {(reportData.cohorts.lowResponders || []).map(sw => (
                        <div key={sw.id} className="flex justify-between items-center p-3 rounded-lg bg-white/5 text-xs font-semibold">
                          <div className="flex flex-col">
                            <span className="text-white font-bold">{sw.preferred_name}</span>
                            <span className="text-[9px] text-white/40 italic">{sw.primaryGroup} Discipline</span>
                          </div>
                          <div className="flex gap-4 items-center">
                            <span className="text-rose-400 font-black">TEI: {sw.efficiency.toFixed(2)}</span>
                            <span className="text-rose-400 font-bold">TEI-Δ: {sw.teiDelta.toFixed(3)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-white/40 italic">No swimmers in this quadrant for this period.</p>
                  )}
                </div>

              </div>

              {/* Full Squad Roster & Efficiency Registry */}
              <div className="glass-card p-8">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-md font-black tracking-wider text-white uppercase mb-1">Full Squad Roster & TEI Registry</h3>
                    <p className="text-xs text-white/60">An exhaustive registry of all active squad athletes audited during this period, detailing their expected expected attendance, hours, baseline/final progression, and dual-metric TEI scores.</p>
                  </div>
                  <span className="bg-cyan-400/10 border border-cyan-400/30 text-cyan-400 text-xs font-black tracking-widest uppercase px-4 py-1.5 rounded-lg">
                    {reportData.swimmersData.length} Audited Athletes
                  </span>
                </div>

                <div className="overflow-x-auto text-left">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="p-4 text-[10px] font-black uppercase text-white/60 tracking-wider">Swimmer Name</th>
                        <th className="p-4 text-[10px] font-black uppercase text-white/60 tracking-wider">Attendance Rate</th>
                        <th className="p-4 text-[10px] font-black uppercase text-white/60 tracking-wider">Banked Hours</th>
                        <th className="p-4 text-[10px] font-black uppercase text-white/60 tracking-wider">Performance Delta</th>
                        <th className="p-4 text-[10px] font-black uppercase text-white/60 tracking-wider">Performance TEI</th>
                        <th className="p-4 text-[10px] font-black uppercase text-white/60 tracking-wider">Improvement TEI-Δ</th>
                        <th className="p-4 text-[10px] font-black uppercase text-white/60 tracking-wider text-right">Quadrant Cohort</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.swimmersData.map((sw) => (
                        <tr key={sw.id} className="border-b border-white/5 hover:bg-white/5 transition-all text-xs font-semibold">
                          <td className="p-4 flex flex-col justify-center">
                            <div className="flex items-center gap-2">
                              <span className="text-white font-bold">{sw.preferred_name}</span>
                              {sw.isExempt && (
                                <span className="bg-amber-400/10 text-amber-400 text-[8px] font-black px-1.5 py-0.5 rounded tracking-widest uppercase border border-amber-400/20">Exempt</span>
                              )}
                            </div>
                            <span className="text-[10px] text-white/40 italic">{sw.primaryGroup || 'Freestyle'} Specialist</span>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <span className="text-white font-bold">{sw.trainingPct}%</span>
                              <div className="w-16 bg-white/5 h-1 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full ${sw.trainingPct >= 75 ? 'bg-emerald-400' : sw.trainingPct >= 60 ? 'bg-amber-400' : 'bg-rose-400'}`}
                                  style={{ width: `${Math.min(100, sw.trainingPct)}%` }}
                                ></div>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 text-white/80">{Math.round(sw.totalHours)}h</td>
                          <td className="p-4">
                            <div className="flex flex-col">
                              <span className="text-cyan-400 font-bold">{sw.peakPoints} Peak pts</span>
                              <span className="text-[10px] text-white/40 font-medium">
                                {sw.startPoints} → {sw.endPoints} ({sw.deltaWA >= 0 ? `+${sw.deltaWA}` : sw.deltaWA} pts)
                              </span>
                            </div>
                          </td>
                          <td className="p-4 font-black">
                            <span className={sw.efficiency >= (reportData.avgTEI || 2.0) ? 'text-emerald-400' : 'text-rose-400'}>
                              {sw.efficiency.toFixed(2)} pts/hr
                            </span>
                          </td>
                          <td className="p-4 font-black">
                            <span className={sw.teiDelta > 0 ? 'text-emerald-400' : sw.teiDelta < 0 ? 'text-rose-400' : 'text-white/40'}>
                              {sw.teiDelta >= 0 ? `+${sw.teiDelta.toFixed(3)}` : sw.teiDelta.toFixed(3)} pts/hr
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            {getSwimmerCohortBadge(sw.id)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CHAMPIONSHIP PATHWAY AUDIT */}
          {activeTab === 'pathway' && (
            <div className="space-y-12">
              
              {/* Pathway qualification rates */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-card p-6 text-center">
                  <div className="text-[10px] font-black tracking-widest text-white/50 uppercase mb-2">County Level Qualifiers</div>
                  <div className="text-3xl font-black text-white">{reportData.benchmarksSummary.countyCount} <span className="text-xs text-white/60">/ {reportData.benchmarksSummary.total}</span></div>
                  <div className="w-full bg-white/5 h-1.5 rounded-full mt-4">
                    <div className="bg-white h-1.5 rounded-full" style={{ width: `${Math.round(reportData.benchmarksSummary.countyCount / reportData.benchmarksSummary.total * 100)}%` }}></div>
                  </div>
                </div>

                <div className="glass-card p-6 text-center">
                  <div className="text-[10px] font-black tracking-widest text-cyan-400/80 uppercase mb-2">Regional Level Qualifiers</div>
                  <div className="text-3xl font-black text-cyan-400">{reportData.benchmarksSummary.regionalCount} <span className="text-xs text-white/60">/ {reportData.benchmarksSummary.total}</span></div>
                  <div className="w-full bg-white/5 h-1.5 rounded-full mt-4">
                    <div className="bg-cyan-400 h-1.5 rounded-full" style={{ width: `${Math.round(reportData.benchmarksSummary.regionalCount / reportData.benchmarksSummary.total * 100)}%` }}></div>
                  </div>
                </div>

                <div className="glass-card p-6 text-center">
                  <div className="text-[10px] font-black tracking-widest text-amber-400/80 uppercase mb-2">National Level Qualifiers</div>
                  <div className="text-3xl font-black text-amber-400">{reportData.benchmarksSummary.nationalCount} <span className="text-xs text-white/60">/ {reportData.benchmarksSummary.total}</span></div>
                  <div className="w-full bg-white/5 h-1.5 rounded-full mt-4">
                    <div className="bg-amber-400 h-1.5 rounded-full" style={{ width: `${Math.round(reportData.benchmarksSummary.nationalCount / reportData.benchmarksSummary.total * 100)}%` }}></div>
                  </div>
                </div>
              </div>

              {/* On the Cusp table */}
              <div className="glass-card p-8">
                <h3 className="text-md font-black tracking-wider text-white uppercase mb-2">Championship Pathways: "On the Cusp" Tracker</h3>
                <p className="text-xs text-white/60 mb-6">Identifies swimmers currently within 1.8% of a county, regional, or national qualification milestone time. Focus target drop percentages on next meet sheet.</p>

                {reportData.onTheCusp.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="p-4 text-[10px] font-black uppercase text-white/60 tracking-wider">Swimmer</th>
                          <th className="p-4 text-[10px] font-black uppercase text-white/60 tracking-wider">Squad</th>
                          <th className="p-4 text-[10px] font-black uppercase text-white/60 tracking-wider">Event</th>
                          <th className="p-4 text-[10px] font-black uppercase text-white/60 tracking-wider">Course</th>
                          <th className="p-4 text-[10px] font-black uppercase text-white/60 tracking-wider">Swimmer PB</th>
                          <th className="p-4 text-[10px] font-black uppercase text-white/60 tracking-wider">Standard Target</th>
                          <th className="p-4 text-[10px] font-black uppercase text-white/60 tracking-wider">Benchmark Time</th>
                          <th className="p-4 text-[10px] font-black uppercase text-white/60 tracking-wider">Gap Required</th>
                          <th className="p-4 text-[10px] font-black uppercase text-white/60 tracking-wider text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.onTheCusp.map((item, idx) => (
                          <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-all text-xs font-semibold">
                            <td className="p-4 text-white font-bold">{item.swimmerName}</td>
                            <td className="p-4 text-white/70">{item.squadName}</td>
                            <td className="p-4 text-cyan-400 font-bold uppercase">{item.event}</td>
                            <td className="p-4 text-white/60">{item.course}</td>
                            <td className="p-4 text-white font-black">{item.time}</td>
                            <td className="p-4">
                              <span className={`px-2.5 py-1 rounded text-[9px] font-black tracking-wider ${
                                item.targetStandard === 'NATIONAL' ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20' :
                                item.targetStandard === 'REGIONAL' ? 'bg-cyan-400/10 text-cyan-400 border border-cyan-400/20' :
                                'bg-white/10 text-white border border-white/20'
                              }`}>
                                {item.targetStandard}
                              </span>
                            </td>
                            <td className="p-4 text-white/80">{item.targetTime}</td>
                            <td className="p-4 font-black text-rose-400">+{item.gapSeconds}s <span className="text-[10px] font-medium text-white/40">({item.diffPct}%)</span></td>
                            <td className="p-4 text-right">
                              <span className="bg-cyan-400/10 border border-cyan-400/30 text-cyan-400 text-[9px] font-black tracking-widest uppercase px-3 py-1 rounded">
                                Target {item.diffPct}% Drop
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12 italic text-white/40 text-xs">No cusp swimmers identified in the selected period and squad combination.</div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: COMPETITIVE TEMPERAMENT */}
          {activeTab === 'temperament' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              
              {/* Leaderboard left */}
              <div className="lg:col-span-2 space-y-8">
                <div className="glass-card p-8">
                  <h3 className="text-md font-black tracking-wider text-white uppercase mb-2">PB Conversion Rate Leaderboard</h3>
                  <p className="text-xs text-white/60 mb-6">Swimmers ranked by their PB conversion efficiency (Personal Best races vs total entries) during active meets.</p>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="p-4 text-[10px] font-black uppercase text-white/60 tracking-wider w-16">Rank</th>
                          <th className="p-4 text-[10px] font-black uppercase text-white/60 tracking-wider">Athlete</th>
                          <th className="p-4 text-[10px] font-black uppercase text-white/60 tracking-wider">Squad</th>
                          <th className="p-4 text-[10px] font-black uppercase text-white/60 tracking-wider">Total Races</th>
                          <th className="p-4 text-[10px] font-black uppercase text-white/60 tracking-wider">PB Count</th>
                          <th className="p-4 text-[10px] font-black uppercase text-white/60 tracking-wider text-right">PB Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pbLeaderboard.slice(0, 15).map((sw, idx) => (
                          <tr key={sw.id} className="border-b border-white/5 hover:bg-white/5 transition-all text-xs font-semibold">
                            <td className="p-4 font-black text-cyan-400">#{idx + 1}</td>
                            <td className="p-4 text-white font-bold uppercase">{sw.preferred_name}</td>
                            <td className="p-4 text-white/70">{sw.squad_name}</td>
                            <td className="p-4 text-white/60">{sw.totalRaces}</td>
                            <td className="p-4 text-emerald-400 font-black">{sw.pbCount}</td>
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-3">
                                <span className="font-black text-emerald-400">{sw.convRate}%</span>
                                <div className="w-16 bg-white/5 h-1.5 rounded-full">
                                  <div className="bg-emerald-400 h-1.5 rounded-full" style={{ width: `${sw.convRate}%` }}></div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Cross-gala temperament metrics right */}
              <div className="space-y-8">
                <div className="glass-card p-6 border-t-4 border-cyan-400">
                  <h3 className="text-xs font-black tracking-wider text-white uppercase mb-6">Cross-Gala Temperament</h3>
                  
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-[10px] font-black text-white/50 uppercase">Avg L1/L2 Championship Points</div>
                        <div className="text-2xl font-black text-white mt-1">{reportData.meetTemperament.avgL1Points} <span className="text-xs font-medium text-white/40">WA</span></div>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] font-black bg-cyan-400/10 border border-cyan-400/20 text-cyan-400 px-2 py-0.5 rounded">HIGH PRESSURE</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-[10px] font-black text-white/50 uppercase">Avg L3/Club Match Points</div>
                        <div className="text-2xl font-black text-white mt-1">{reportData.meetTemperament.avgL3Points} <span className="text-xs font-medium text-white/40">WA</span></div>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] font-black bg-white/10 border border-white/20 text-white/70 px-2 py-0.5 rounded">STANDARD</span>
                      </div>
                    </div>

                    <div className="pt-6 border-t border-white/5">
                      <div className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-3">AI Temperament Assessment</div>
                      <p className="text-xs font-bold leading-relaxed text-white/80">{reportData.meetTemperament.temperamentNote}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: PDF EXPORT COCKPIT */}
          {activeTab === 'export' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              
              {/* Export Trigger */}
              <div className="lg:col-span-2 space-y-8">
                <div className="glass-card p-8 border-l-4 border-cyan-400">
                  <h3 className="text-md font-black tracking-wider text-white uppercase mb-2">Compile PDF Performance & Compliance Booklet</h3>
                  <p className="text-xs text-white/60 mb-8">Creates a multi-page, formatted A4 audit booklet detailing training consistency baselines, open meet compliance indexes, standard qualifying statistics, and the full athlete registry for the selected squad.</p>
                  
                  {squadId === 'all' ? (
                    <div className="p-6 bg-amber-400/5 border border-amber-400/10 rounded-xl text-xs font-semibold text-amber-400 flex items-start gap-3">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>
                      <div>
                        <p className="font-black uppercase tracking-wider mb-1">Squad selection required</p>
                        <p className="opacity-80">Booklets must be generated for a specific squad pathway. Please select a squad other than "All Active Squads" in the header controls to enable the PDF export compiler.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
                      <button
                        onClick={handleCompileBooklet}
                        disabled={compilingBooklet}
                        className="bg-cyan-400 hover:bg-cyan-300 text-black font-black uppercase tracking-widest text-[10px] px-8 py-3.5 rounded-lg flex items-center gap-3 transition-all duration-300 h-fit"
                      >
                        {compilingBooklet ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-black"></div>
                            Generating Booklet PDF...
                          </>
                        ) : (
                          'Compile Booklet PDF'
                        )}
                      </button>
                      <div className="text-xs text-white/50 font-semibold leading-relaxed">
                        <p className="font-bold text-white mb-0.5">Puppeteer A4 Target PDF Print System</p>
                        <p>Compiles in ~10-15 seconds. File is saved securely to server disk and listed in the history tab.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* History right */}
              <div className="space-y-8">
                <div className="glass-card p-6">
                  <h3 className="text-xs font-black tracking-wider text-white uppercase mb-6">Previously Generated Booklets</h3>

                  {savedPdfs.length > 0 ? (
                    <div className="space-y-4 max-h-[350px] overflow-y-auto no-scrollbar">
                      {savedPdfs.map((pdf, idx) => (
                        <div key={idx} className="p-3 rounded-lg bg-white/5 flex flex-col gap-2 border border-white/5 hover:border-cyan-400/20 transition-all">
                          <div className="text-[10px] font-black text-white uppercase truncate" title={pdf.fileName}>{pdf.fileName}</div>
                          <div className="flex justify-between items-center text-[9px] font-semibold text-white/50">
                            <span>{new Date(pdf.createdAt).toLocaleDateString('en-GB')} ({Math.round(pdf.sizeBytes / 1024)} KB)</span>
                            <a
                              href={`/api/download-report?file=${encodeURIComponent(pdf.fileName)}`}
                              className="text-cyan-400 hover:text-cyan-300 font-black uppercase tracking-widest"
                            >
                              Download
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-10 border border-dashed border-white/5 rounded-xl italic text-white/40 text-xs">No booklets compiled yet.</div>
                  )}
                </div>
              </div>

            </div>
          )}

        </div>
      ) : (
        <div className="text-center py-20 italic text-white/40 text-xs">Failed to load reporting dashboard dataset. Please compile again.</div>
      )}

      {/* Styled JSX Custom CSS to add high-fidelity responsive styling */}
      <style jsx global>{`
        .btn-premium-intel {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 0 10px rgba(6, 182, 212, 0.1);
        }
        .btn-premium-intel:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 0 20px rgba(6, 182, 212, 0.3);
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </Layout>
  );
}
