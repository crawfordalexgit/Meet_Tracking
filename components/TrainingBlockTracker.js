import React, { useState, useEffect } from 'react';
import { 
  calculateTrainingBlock, 
  calculateDropOffRatio, 
  calculateReliability,
  toLocalISO,
  getWeekKey
} from '../lib/analytics-utils';
import PremiumOrb from './PremiumOrb';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine
} from 'recharts';

export default function TrainingBlockTracker({ swimmer, results = [], attendance = [], sessions = [] }) {
  const [deduplicatedMeets, setDeduplicatedMeets] = useState([]);
  const [selectedMeetId, setSelectedMeetId] = useState('');
  const [selectedMeet, setSelectedMeet] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState('all');
  const [useCustomStart, setUseCustomStart] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [blockData, setBlockData] = useState(null);
  const [weeksData, setWeeksData] = useState([]);
  
  // AI Assessment State
  const [loading, setLoading] = useState(false);
  const [briefing, setBriefing] = useState(null);
  const [error, setError] = useState(null);

  const getMondayDateStr = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const day = d.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const mon = new Date(d);
    mon.setDate(d.getDate() + diffToMonday);
    return toLocalISO(mon);
  };

  // 1. Group swimmer results into unique meets on component mount/results change
  useEffect(() => {
    if (!results || results.length === 0) return;

    const sortedMeets = [...results]
      .filter(r => r.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date)); // Newest first

    const uniqueMeets = [];
    sortedMeets.forEach(r => {
      const mName = r.meets?.name || r.meet_name || `Meet @ ${r.date}`;
      const rDate = new Date(r.date);
      
      const existing = uniqueMeets.find(m => 
        m.name === mName && 
        Math.abs((new Date(m.date) - rDate) / (1000 * 60 * 60 * 24)) <= 3
      );
      
      if (!existing) {
        // Calculate peak WA points for this meet
        const meetResults = results.filter(res => {
          const nameMatch = (res.meets?.name || res.meet_name) === mName;
          const dateDiff = Math.abs((new Date(res.date) - rDate) / (1000 * 60 * 60 * 24)) <= 3;
          return nameMatch && dateDiff;
        });
        const peakWa = meetResults.length > 0 ? Math.max(...meetResults.map(res => res.wa_pts || 0)) : 0;

        uniqueMeets.push({
          id: r.meet_id || mName,
          name: mName,
          date: r.date,
          peakWa
        });
      }
    });

    setDeduplicatedMeets(uniqueMeets);
    if (uniqueMeets.length > 0) {
      setSelectedMeetId(uniqueMeets[0].id);
      setSelectedMeet(uniqueMeets[0]);
    }
  }, [results]);

  // 1.5 Derived specific meet results and target WA points
  const meetResults = selectedMeet ? results.filter(r => {
    const meetIdMatch = selectedMeet.id && r.meet_id === selectedMeet.id;
    const dateMatch = toLocalISO(new Date(r.date)) === toLocalISO(new Date(selectedMeet.date));
    return meetIdMatch || dateMatch;
  }) : [];

  let targetWaPoints = 0;
  let isPb = false;
  let eventName = 'All Events (Meet Average)';
  
  if (selectedEventId === 'all') {
    if (meetResults.length > 0) {
      targetWaPoints = Math.round(meetResults.reduce((sum, r) => sum + (r.wa_pts || 0), 0) / meetResults.length);
    } else {
      targetWaPoints = selectedMeet?.peakWa || 0;
    }
  } else {
    const specificResult = meetResults.find(r => r.id === selectedEventId || r.event === selectedEventId);
    targetWaPoints = specificResult?.wa_pts || 0;
    isPb = specificResult?.is_pb || false;
    eventName = specificResult?.event || eventName;
  }

  // 2. Recalculate block data and weeks whenever selectedMeet changes
  useEffect(() => {
    if (!selectedMeet || !results || !attendance || !sessions) return;

    // A. Calculate main block statistics
    const data = calculateTrainingBlock(selectedMeet, results, attendance, sessions, targetWaPoints, useCustomStart && customStartDate ? customStartDate : null);
    setBlockData(data);

    // B. Calculate weekly chart data inside the block window
    if (data.startDate && data.endDate) {
      // Calculate reliability to get workload details (reusing our robust holiday & shutdown math!)
      const rel = calculateReliability(swimmer, attendance, sessions, results, 365);
      const workloadDetails = rel.details || {};

      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      
      const weeks = [];
      let current = new Date(start);
      // Align current to the Monday of its week
      const day = current.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      current.setDate(current.getDate() + diffToMonday);
      current.setHours(0,0,0,0);
      
      while (current <= end) {
        const weekKey = getWeekKey(current);
        const wLoad = workloadDetails[weekKey] || { trainingHours: 0, galaHours: 0 };
        const hours = wLoad.trainingHours + wLoad.galaHours;
        
        // Find peak WA points achieved in this specific week
        const weekStart = new Date(current);
        const weekEnd = new Date(current);
        weekEnd.setDate(weekEnd.getDate() + 6);
        weekEnd.setHours(23,59,59,999);
        
        const weekResults = results.filter(r => {
          const d = new Date(r.date);
          return d >= weekStart && d <= weekEnd;
        });
        const peakWa = weekResults.length > 0 ? Math.max(...weekResults.map(r => r.wa_pts || 0)) : null;
        const meetNames = [...new Set(weekResults.map(r => r.meets?.name || r.meet_name).filter(Boolean))];
        
        weeks.push({
          weekLabel: `Wk ${weeks.length + 1}`,
          dateStr: toLocalISO(weekStart),
          hours: parseFloat(hours.toFixed(1)),
          waPoints: peakWa,
          galaName: meetNames.length > 0 ? meetNames.join(', ') : null
        });
        
        current.setDate(current.getDate() + 7);
      }

      // Fill in progressive WA points for continuous line rendering
      let lastPeak = 0;
      const preBlockResults = results.filter(r => new Date(r.date) < new Date(data.startDate));
      if (preBlockResults.length > 0) {
        lastPeak = Math.max(...preBlockResults.map(r => r.wa_pts || 0));
      }
      
      const chartData = weeks.map(w => {
        if (w.waPoints !== null) {
          lastPeak = w.waPoints;
        }
        return {
          ...w,
          waPoints: lastPeak > 0 ? lastPeak : null
        };
      });

      setWeeksData(chartData);
    }
  }, [selectedMeet, results, attendance, sessions, swimmer, targetWaPoints, useCustomStart, customStartDate]);

  // Handle dropdown change
  const handleMeetChange = (e) => {
    const id = e.target.value;
    setSelectedMeetId(id);
    const meetObj = deduplicatedMeets.find(m => m.id === id);
    setSelectedMeet(meetObj);
    setSelectedEventId('all');
    setBriefing(null); // Clear previous AI briefing
    setError(null);
  };

  // 3. Drop-off ratio calculation for primary strokes
  const strokes = ['Free', 'Back', 'Breast', 'Fly'];
  const dropOffs = strokes.map(s => {
    const ratio = calculateDropOffRatio(results, s);
    return { stroke: s, ratio };
  }).filter(d => d.ratio !== null);

  // 4. Generate AI block audit report
  const generateAudit = async () => {
    if (!selectedMeet || !blockData) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          swimmerId: swimmer.id,
          type: 'block_audit',
          blockData: {
            meetName: selectedMeet.name,
            meetDate: selectedMeet.date,
            startDate: blockData.startDate,
            endDate: blockData.endDate,
            totalHours: blockData.totalHours,
            waPoints: blockData.waPoints,
            tei: blockData.tei,
            dropOffs: dropOffs
          },
          instructions: [
            "MANDATORY: Analyze the swimmer's Training Block ROI (Return on Investment) data.",
            `CONTEXT: This analysis is focused on ${selectedEventId === 'all' ? 'the overall meet average' : `the specific event: ${eventName}`}.`,
            `PERFORMANCE: The swimmer achieved ${targetWaPoints} WA points in this target. ${isPb ? 'This was a LIFETIME PB.' : ''}`,
            useCustomStart ? `The coach has manually defined this as a macro-cycle starting on ${customStartDate}, ignoring intermediate practice meets. Focus the narrative on long-term macro-cycle endurance and peak conversion.` : null,
            "Evaluate the Training Efficiency Index (TEI) which represents points yielded per hour of training.",
            "Evaluate the stroke drop-off ratios. A ratio > 2.1 indicates technical breakdown or endurance decay over the second 50m of a 100m race.",
            "State specific technical and metabolic recommendations to address speed endurance decay or maintain high efficiency."
          ].filter(Boolean)
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBriefing(data);
    } catch (err) {
      setError(err.message || 'Failed to generate block audit assessment');
    } finally {
      setLoading(false);
    }
  };

  const getTeiColor = (tei) => {
    if (tei >= 15) return 'var(--accent-emerald, #10b981)';
    if (tei >= 10) return 'var(--accent-amber, #f59e0b)';
    return 'var(--accent-rose, #f43f5e)';
  };

  const getTeiLevel = (tei) => {
    if (tei >= 15) return 'HIGH YIELD / EXCELLENT EFFICIENCY';
    if (tei >= 10) return 'MODERATE / STABLE STIMULUS';
    return 'LOW YIELD / AUDIT REQUIRED';
  };

  const getOrbColor = (ratio) => {
    if (ratio <= 2.05) return 'cyan';
    if (ratio <= 2.1) return 'amber';
    return 'white'; // white theme is mapped to red glow in CSS for ratio values in PremiumOrb if customized or default
  };

  const getRiskBadgeClass = (risk) => {
    if (risk === 'low') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (risk === 'medium') return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
  };

  return (
    <div className="glass-card animate-fade-in relative overflow-hidden" style={{ 
      padding: '2.5rem', 
      minHeight: '500px',
      background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.05) 0%, rgba(10, 25, 33, 0.9) 100%)' 
    }}>
      {/* Background glow */}
      <div style={{ position: 'absolute', top: '-10%', right: '-10%', width: '40%', height: '40%', background: 'radial-gradient(circle, rgba(6, 182, 212, 0.08) 0%, transparent 70%)', filter: 'blur(50px)', zIndex: 0 }}></div>

      <div className="relative z-10">
        {/* Header & Selector */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-6">
          <div>
            <div className="section-title" style={{ fontSize: '0.75rem', marginBottom: 8, fontWeight: 900, letterSpacing: '0.2em', color: 'var(--accent-cyan)' }}>TRAINING BLOCK PERFORMANCE ROI</div>
            <h2 style={{ fontSize: '2rem', fontWeight: 900, marginBottom: '0.5rem', letterSpacing: '-0.02em', color: '#fff' }}>Training Block ROI Tracker</h2>
          </div>
          
          <div className="flex flex-col gap-1.5 no-print" style={{ minWidth: '260px' }}>
            <label style={{ fontSize: '0.65rem', fontWeight: 900, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Select Target Racing Meet</label>
            <select 
              value={selectedMeetId} 
              onChange={handleMeetChange}
              style={{
                background: 'rgba(0,0,0,0.5)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff',
                padding: '0.75rem 1rem',
                borderRadius: '12px',
                fontSize: '0.85rem',
                fontWeight: 700,
                outline: 'none',
                cursor: 'pointer',
                width: '100%',
                marginBottom: '8px'
              }}
            >
              {deduplicatedMeets.map(m => (
                <option key={m.id} value={m.id} style={{ background: '#0a0a0f', color: '#fff' }}>
                  {m.name} ({new Date(m.date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}) — Peak: {m.peakWa} WA
                </option>
              ))}
            </select>
            <label style={{ fontSize: '0.65rem', fontWeight: 900, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Event Target</label>
            <select 
              value={selectedEventId} 
              onChange={(e) => setSelectedEventId(e.target.value)}
              style={{
                background: 'rgba(0,0,0,0.5)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff',
                padding: '0.75rem 1rem',
                borderRadius: '12px',
                fontSize: '0.85rem',
                fontWeight: 700,
                outline: 'none',
                cursor: 'pointer',
                width: '100%',
                marginBottom: '8px'
              }}
            >
              <option value="all" style={{ background: '#0a0a0f', color: '#fff' }}>All Events (Meet Average)</option>
              {meetResults.map((r, i) => (
                <option key={r.id || i} value={r.id || r.event} style={{ background: '#0a0a0f', color: '#fff' }}>
                  {r.event} — {r.time}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2 mt-2" style={{ marginBottom: '8px' }}>
              <input 
                type="checkbox" 
                id="macroCycleOverride"
                checked={useCustomStart} 
                onChange={(e) => setUseCustomStart(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <label 
                htmlFor="macroCycleOverride"
                style={{ fontSize: '0.75rem', fontWeight: 900, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', textTransform: 'uppercase' }}
              >
                Macro-Cycle Override
              </label>
            </div>
            
            {useCustomStart && (
              <div className="flex flex-col gap-1 mt-1">
                <label style={{ fontSize: '0.65rem', fontWeight: 900, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Custom Start Date</label>
                <input 
                  type="date" 
                  className="tactical-search-input" 
                  value={customStartDate} 
                  onChange={(e) => setCustomStartDate(e.target.value)} 
                  onClick={(e) => {
                    try {
                      if (e.target.showPicker) e.target.showPicker();
                    } catch (err) {}
                  }}
                  onFocus={(e) => {
                    try {
                      if (e.target.showPicker) e.target.showPicker();
                    } catch (err) {}
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Explanations */}
        <p style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '2.5rem', lineHeight: 1.6, maxWidth: '800px' }}>
          This tool isolates the specific training hours logged prior to a target meet to determine how efficiently training volume translates into racing speed.
        </p>

        {/* Isolated Window Fact Cards */}
        {blockData && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col justify-between">
              <div style={{ fontSize: '0.65rem', opacity: 0.4, marginBottom: 6, fontWeight: 900, letterSpacing: '0.05em' }}>BLOCK DURATION</div>
              <div className="text-lg font-black tracking-tight" style={{ color: '#fff' }}>
                {new Date(blockData.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} 
                <span className="mx-2 opacity-30">→</span>
                {new Date(blockData.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </div>
            </div>
            
            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col justify-between">
              <div style={{ fontSize: '0.65rem', opacity: 0.4, marginBottom: 6, fontWeight: 900, letterSpacing: '0.05em' }}>ISOLATED TRAINING HOURS</div>
              <div className="text-2xl font-black text-cyan-400">{blockData.totalHours} hrs</div>
            </div>

            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col justify-between">
              <div style={{ fontSize: '0.65rem', opacity: 0.4, marginBottom: 6, fontWeight: 900, letterSpacing: '0.05em' }}>
                {selectedEventId === 'all' ? 'AVERAGE WA POINTS ACHIEVED' : 'EVENT WA POINTS ACHIEVED'}
              </div>
              <div className="text-2xl font-black text-amber-400 mb-2">{blockData.waPoints} pts</div>
              {selectedEventId === 'all' ? (
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'rgba(255,255,255,0.6)' }}>
                  PB Conversion: {meetResults.length > 0 ? Math.round((meetResults.filter(r => r.is_pb).length / meetResults.length) * 100) : 0}%
                </div>
              ) : (
                isPb && (
                  <div className="status-badge-premium success" style={{ fontSize: '0.65rem', padding: '4px 8px', alignSelf: 'flex-start', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '6px', fontWeight: 900, textShadow: '0 0 10px rgba(16, 185, 129, 0.5)' }}>
                    🌟 LIFETIME PB ACHIEVED
                  </div>
                )
              )}
            </div>

            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col justify-between" style={{ borderLeft: `4px solid ${getTeiColor(blockData.tei)}` }}>
              <div style={{ fontSize: '0.65rem', opacity: 0.4, marginBottom: 6, fontWeight: 900, letterSpacing: '0.05em' }}>TRAINING EFFICIENCY INDEX</div>
              <div className="text-2xl font-black" style={{ color: getTeiColor(blockData.tei) }}>
                {typeof blockData.tei === 'number' ? blockData.tei.toFixed(1) : blockData.tei}
              </div>
            </div>
          </div>
        )}

        {/* Grid: Chart & TEI Explanation */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
          {/* Chart Section */}
          <div className="lg:col-span-2 p-6 rounded-2xl bg-white/[0.01] border border-white/5">
            <div className="flex justify-between items-center mb-6">
              <div className="section-title" style={{ fontSize: '0.7rem', margin: 0, fontWeight: 900, color: 'rgba(255,255,255,0.6)' }}>Weekly Workload vs. Peak Performance in Block</div>
              <div className="flex gap-4 text-[10px] font-black opacity-60">
                <span style={{ color: 'var(--accent-cyan)' }}>■ Hours</span>
                <span style={{ color: 'var(--accent-emerald)' }}>● Peak WA</span>
              </div>
            </div>
            
            <div style={{ height: 300 }}>
              {weeksData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={weeksData}>
                    <defs>
                      <linearGradient id="colorCyan" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--accent-cyan, #00d4ff)" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="var(--accent-cyan, #00d4ff)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.03)" />
                    <XAxis 
                      dataKey="dateStr" 
                      tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700 }} 
                      axisLine={false} 
                      tickLine={false} 
                      tickFormatter={(tick) => {
                        if (!tick) return '';
                        try {
                          const dateObj = new Date(tick);
                          return dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                        } catch (e) {
                          return tick;
                        }
                      }}
                    />
                    <YAxis yAxisId="left" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} label={{ value: 'Hours', angle: -90, position: 'insideLeft', fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} label={{ value: 'Peak WA Points', angle: 90, position: 'insideRight', fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
                    <Tooltip 
                      content={<CustomTooltip />}
                    />
                    <ReferenceLine 
                      x={getMondayDateStr(blockData?.startDate)} 
                      stroke="rgba(255,255,255,0.25)" 
                      strokeDasharray="3 3" 
                      label={{ 
                        value: useCustomStart ? 'Macro-Cycle Start' : 'Block Start', 
                        fill: 'rgba(255,255,255,0.4)', 
                        fontSize: 8, 
                        position: 'insideTopLeft',
                        fontWeight: 900 
                      }} 
                    />
                    <Bar yAxisId="left" dataKey="hours" name="Workload Hours" fill="url(#colorCyan)" radius={[4, 4, 0, 0]} barSize={18} />
                    <Line yAxisId="right" type="monotone" dataKey="waPoints" name="Peak WA Standard" stroke="var(--accent-emerald, #10b981)" strokeWidth={3} activeDot={{ r: 8, fill: 'var(--accent-emerald)', strokeWidth: 2, stroke: '#fff' }} dot={{ fill: 'var(--accent-emerald)', r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-white/30 text-sm">Generating block timeline...</div>
              )}
            </div>
          </div>

          {/* TEI Deep-Dive Card */}
          <div className="p-6 rounded-2xl bg-white/[0.01] border border-white/5 flex flex-col justify-between">
            <div>
              <div className="section-title" style={{ fontSize: '0.65rem', marginBottom: 12, fontWeight: 900, color: 'rgba(255,255,255,0.4)' }}>TEI ANALYSIS ENGINE</div>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 900, marginBottom: '1rem', color: '#fff' }}>Training Efficiency Index</h3>
              
              <p style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.75)', lineHeight: '1.6', marginBottom: '1.5rem' }}>
                TEI measures FINA/WA points yielded per hour of training. Higher numbers indicate high-yield blocks.
              </p>

              {blockData && (
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 mb-6">
                  <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontWeight: 900, letterSpacing: '0.05em', marginBottom: '4px' }}>CURRENT BLOCK PROFILE</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: getTeiColor(blockData.tei) }}>
                    {getTeiLevel(blockData.tei)}
                  </div>
                </div>
              )}
            </div>

            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', lineHeight: 1.5 }}>
              Note: An efficiency ratio above 15.0 indicates a highly responsive neural and cardiovascular system, where small blocks of volume yield massive racing returns. Ratios below 10.0 indicate high volumes with stagnating performance, highlighting potential fatigue or plateauing.
            </div>
          </div>
        </div>

        {/* Drop-off Ratios */}
        <div className="p-8 rounded-3xl bg-white/[0.01] border border-white/5 mb-12">
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="section-title" style={{ fontSize: '0.75rem', marginBottom: 8, fontWeight: 900, color: 'var(--accent-cyan)' }}>SPEED ENDURANCE INDEX</div>
              <h3 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#fff', marginBottom: '0.5rem' }}>50m vs. 100m Drop-off Ratios</h3>
              <p style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.65)', margin: 0 }}>
                A ratio &gt; 2.1 indicates technical breakdown or endurance decay over the second 50m of a 100m race.
              </p>
            </div>
          </div>

          {dropOffs.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 justify-items-center py-6">
              {dropOffs.map(d => {
                // Calculate circular percentage for PremiumOrb (ideal ratio is 2.0 or less = 100%, 2.2 or higher = 0%)
                const pct = Math.max(0, Math.min(100, Math.round((2.2 - d.ratio) / 0.2 * 100)));
                return (
                  <div key={d.stroke} className="flex flex-col items-center">
                    <PremiumOrb 
                      value={pct} 
                      customValue={d.ratio.toFixed(2)}
                      label={`${d.stroke} ratio`}
                      size={100}
                      unit="%"
                      color={getOrbColor(d.ratio)}
                    />
                    <div style={{ 
                      fontSize: '0.7rem', 
                      fontWeight: 900, 
                      marginTop: '8px', 
                      padding: '2px 8px', 
                      borderRadius: '4px',
                      background: d.ratio > 2.1 ? 'rgba(244,63,94,0.1)' : 'rgba(16,185,129,0.1)',
                      color: d.ratio > 2.1 ? '#f43f5e' : '#10b981'
                    }}>
                      {d.ratio > 2.1 ? 'DECAY DETECTED' : 'EFFICIENT PACE'}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-10 text-white/30 text-sm">
              Insufficient racing data (requires both 50m and 100m results in a single stroke to calculate drop-off curves).
            </div>
          )}
        </div>

        {/* AI Block Audit Trigger Button */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <button 
            className="btn-premium-intel flex items-center justify-center gap-2" 
            onClick={generateAudit}
            disabled={loading || !blockData}
            style={{ width: '100%', padding: '1.25rem', borderRadius: '16px', fontWeight: 900, fontSize: '1rem', transition: 'all 0.3s' }}
          >
            {loading ? (
              <>
                <span className="loading-spinner-small">✨</span> Synthesizing Training Block ROI Audit...
              </>
            ) : (
              "✨ Generate Block Audit"
            )}
          </button>
          {error && <p style={{ color: 'var(--accent-rose, #f43f5e)', fontSize: '0.85rem', fontWeight: 700, margin: 0 }}>⚠️ {error}</p>}
        </div>

        {/* Resulting AI Text Block */}
        {loading && (
          <div className="animate-pulse mt-8" style={{ padding: '4rem 2rem', textAlign: 'center', background: 'rgba(255, 255, 255, 0.01)', borderRadius: '24px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <div className="loading-spinner" style={{ marginBottom: '1.5rem', display: 'inline-block' }}>✨</div>
            <p style={{ fontSize: '1.1rem', fontWeight: 900, margin: 0, color: '#fff' }}>Analyzing Physiological Return on Investment...</p>
            <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginTop: '8px', margin: '8px 0 0' }}>Correlating pre-meet workload (hours) with peak performance outputs (WA Points) and pacing efficiency ratios...</p>
          </div>
        )}

        {briefing && !loading && (
          <div className="animate-fade-in mt-8 p-8 rounded-3xl bg-white/[0.02] border border-white/5 flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <div className="flex items-center gap-4">
                <div className="section-title" style={{ fontSize: '0.75rem', margin: 0, fontWeight: 900, letterSpacing: '0.15em', color: 'var(--accent-cyan)' }}>COACHESEYE BLOCK AUDIT REPORT</div>
                {briefing.flag && (
                  <div className={`px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${getRiskBadgeClass(briefing.risk_level)}`}>
                    {briefing.flag}
                  </div>
                )}
              </div>
              <div className="flex gap-2 no-print">
                <button 
                  className="px-3 py-1.5 rounded-xl text-[10px] font-black transition-all bg-white/5 text-white/40 hover:bg-white/10" 
                  onClick={() => setBriefing(null)}
                >
                  Clear Audit
                </button>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-white/[0.01] border border-white/5">
              <h3 style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--accent-cyan, #0ea5e9)', marginBottom: '1.25rem', letterSpacing: '-0.02em' }}>
                {briefing.headline}
              </h3>
              
              <p style={{ fontSize: '0.95rem', lineHeight: '1.7', color: '#fff', fontWeight: 400, margin: 0 }}>
                {briefing.summary?.assessment}
              </p>
            </div>

            {briefing.recommendations && briefing.recommendations.length > 0 && (
              <div className="p-6 rounded-2xl bg-white/[0.01] border border-white/5">
                <div style={{ fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', color: 'var(--accent-cyan)', letterSpacing: '0.15em', marginBottom: '1rem' }}>
                  Targeted Skill & Pace Interventions
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {briefing.recommendations.map((rec, i) => (
                    <li key={i} style={{ fontSize: '0.85rem', display: 'flex', gap: '10px', marginBottom: '12px', lineHeight: 1.5 }}>
                      <div style={{ minWidth: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-cyan, #0ea5e9)', marginTop: '8px' }}></div>
                      <span style={{ color: 'rgba(255, 255, 255, 0.85)' }}>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {briefing.foresight && (
              <div className="p-6 rounded-2xl bg-white/[0.01] border border-white/5">
                <div style={{ fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', color: 'var(--accent-cyan)', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>
                  Block Development Outlook
                </div>
                <p style={{ fontSize: '0.85rem', fontStyle: 'italic', color: '#fff', margin: 0, lineHeight: 1.55 }}>
                  "{briefing.foresight}"
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .loading-spinner {
          font-size: 3rem;
          animation: spin 2.5s linear infinite;
        }
        .loading-spinner-small {
          font-size: 1.2rem;
          display: inline-block;
          animation: spin 2s linear infinite;
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
          animation: fadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .tactical-search-input {
          background: rgba(0, 0, 0, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 0.75rem 1rem;
          color: white;
          font-size: 0.85rem;
          font-weight: 700;
          transition: all 0.3s ease;
          outline: none;
          width: 100%;
          cursor: pointer;
        }
        .tactical-search-input:focus {
          background: rgba(0, 0, 0, 0.7);
          border-color: var(--accent-cyan);
          box-shadow: 0 0 20px rgba(6, 182, 212, 0.15);
        }
        .tactical-search-input::-webkit-calendar-picker-indicator {
          filter: invert(1);
          cursor: pointer;
          opacity: 0.7;
          transition: opacity 0.2s ease;
        }
        .tactical-search-input::-webkit-calendar-picker-indicator:hover {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    let formattedDate = label;
    try {
      formattedDate = new Date(label).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) {}

    const data = payload[0].payload;
    const hours = data.hours;
    const waPoints = data.waPoints;
    const galaName = data.galaName;

    return (
      <div style={{
        background: 'rgba(10, 10, 15, 0.95)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        padding: '12px 16px',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
        fontSize: '0.8rem',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px'
      }}>
        <div style={{ fontWeight: 900, opacity: 0.4, fontSize: '0.65rem', letterSpacing: '0.05em' }}>
          WEEK COMMENCING {formattedDate.toUpperCase()}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: 'var(--accent-cyan, #00d4ff)' }}>■</span>
          <span style={{ fontWeight: 700 }}>Workload:</span> {hours} hrs
        </div>
        {waPoints !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--accent-emerald, #10b981)' }}>●</span>
            <span style={{ fontWeight: 700 }}>Peak WA Points:</span> {waPoints}
          </div>
        )}
        {galaName && (
          <div style={{ 
            marginTop: '4px', 
            paddingTop: '6px', 
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            color: '#38bdf8', 
            fontWeight: 800,
            fontSize: '0.75rem',
            textShadow: '0 0 8px rgba(56, 189, 248, 0.3)'
          }}>
            🏆 {galaName}
          </div>
        )}
      </div>
    );
  }
  return null;
};
