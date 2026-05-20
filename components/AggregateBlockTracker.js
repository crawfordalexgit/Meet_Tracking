import React, { useState, useEffect } from 'react';
import { 
  calculateAggregateBlock, 
  toLocalISO,
  getWeekKey
} from '../lib/analytics-utils';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine
} from 'recharts';

export default function AggregateBlockTracker({ title = "Squad Macro-Cycle ROI", swimmers = [], results = [], attendance = [], sessions = [] }) {
  const [deduplicatedMeets, setDeduplicatedMeets] = useState([]);
  const [selectedMeetId, setSelectedMeetId] = useState('');
  const [selectedMeet, setSelectedMeet] = useState(null);
  const [useCustomStart, setUseCustomStart] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [blockData, setBlockData] = useState(null);

  const getMondayDateStr = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const day = d.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const mon = new Date(d);
    mon.setDate(d.getDate() + diffToMonday);
    return toLocalISO(mon);
  };

  // Group swimmer results into unique meets on component mount/results or swimmers change
  useEffect(() => {
    if (!results || results.length === 0 || !swimmers || swimmers.length === 0) return;

    const cohortSwimmerIds = new Set(swimmers.map(s => s.id));
    const cohortResults = results.filter(r => cohortSwimmerIds.has(r.swimmer_id));

    const sortedMeets = [...cohortResults]
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
        // Calculate peak WA points for cohort this meet
        const meetResults = cohortResults.filter(res => {
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
  }, [results, swimmers]);

  // Recalculate block data whenever selectedMeet or parameters change
  useEffect(() => {
    if (!selectedMeet || swimmers.length === 0) return;

    const startOverride = useCustomStart && customStartDate ? customStartDate : null;
    const data = calculateAggregateBlock(selectedMeet, swimmers, results, attendance, sessions, startOverride);
    setBlockData(data);
  }, [selectedMeet, swimmers, results, attendance, sessions, useCustomStart, customStartDate]);

  const handleMeetChange = (e) => {
    const id = e.target.value;
    setSelectedMeetId(id);
    const meetObj = deduplicatedMeets.find(m => m.id === id);
    setSelectedMeet(meetObj);
  };

  const getTeiColor = (tei) => {
    if (tei >= 15) return 'var(--accent-emerald, #10b981)';
    if (tei >= 10) return 'var(--accent-amber, #f59e0b)';
    return 'var(--accent-rose, #f43f5e)';
  };

  return (
    <div className="glass-card animate-fade-in relative overflow-hidden" style={{ 
      padding: '2.5rem', 
      minHeight: '500px',
      background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.03) 0%, rgba(10, 25, 33, 0.95) 100%)' 
    }}>
      {/* Background glow */}
      <div style={{ position: 'absolute', top: '-10%', right: '-10%', width: '45%', height: '45%', background: 'radial-gradient(circle, rgba(6, 182, 212, 0.06) 0%, transparent 75%)', filter: 'blur(60px)', zIndex: 0 }}></div>

      <div className="relative z-10">
        {/* Header & Selectors */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-6">
          <div>
            <div className="section-title" style={{ fontSize: '0.75rem', marginBottom: 8, fontWeight: 900, letterSpacing: '0.2em', color: 'var(--accent-cyan)' }}>COHORT PERFORMANCE BENCHMARK</div>
            <h2 style={{ fontSize: '2rem', fontWeight: 900, marginBottom: '0.5rem', letterSpacing: '-0.02em', color: '#fff' }}>{title}</h2>
          </div>
          
          <div className="flex flex-col gap-1.5 no-print" style={{ minWidth: '280px' }}>
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

        {/* Description */}
        <p style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '2.5rem', lineHeight: 1.6, maxWidth: '800px' }}>
          This component aggregates training volume and performance outputs across the entire cohort. It measures average training load preceding a target gala and correlates it with average performance to calculate squad-wide return on investment.
        </p>

        {/* Fact Cards */}
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
              <div style={{ fontSize: '0.65rem', opacity: 0.4, marginBottom: 6, fontWeight: 900, letterSpacing: '0.05em' }}>AVERAGE VOLUME PER ATHLETE</div>
              <div className="text-2xl font-black text-cyan-400">{blockData.averageHours} hrs</div>
            </div>

            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col justify-between">
              <div style={{ fontSize: '0.65rem', opacity: 0.4, marginBottom: 6, fontWeight: 900, letterSpacing: '0.05em' }}>AVERAGE MEET WA POINTS</div>
              <div className="text-2xl font-black text-amber-400 mb-2">{blockData.averageWaPoints} pts</div>
              <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'rgba(255,255,255,0.6)' }}>
                PB Conversion: {blockData.totalRaces > 0 ? Math.round((blockData.totalPbs / blockData.totalRaces) * 100) : 0}% ({blockData.totalPbs}/{blockData.totalRaces} races)
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col justify-between" style={{ borderLeft: `4px solid ${getTeiColor(blockData.squadTei)}` }}>
              <div style={{ fontSize: '0.65rem', opacity: 0.4, marginBottom: 6, fontWeight: 900, letterSpacing: '0.05em' }}>COHORT EFFICIENCY INDEX (TEI)</div>
              <div className="text-2xl font-black" style={{ color: getTeiColor(blockData.squadTei) }}>
                {blockData.squadTei.toFixed(1)}
              </div>
              <div style={{ fontSize: '0.6rem', fontWeight: 900, color: getTeiColor(blockData.squadTei), opacity: 0.8, marginTop: 4, letterSpacing: '0.05em' }}>
                {blockData.squadTei >= 15 ? 'HIGH YIELD / EXCELLENT' : blockData.squadTei >= 10 ? 'MODERATE STIMULUS' : 'LOW YIELD / AUDIT REQUIRED'}
              </div>
            </div>
          </div>
        )}

        {/* Chart */}
        {blockData && blockData.chartData && (
          <div className="p-6 rounded-2xl bg-white/[0.01] border border-white/5">
            <div className="flex justify-between items-center mb-6">
              <div className="section-title" style={{ fontSize: '0.7rem', margin: 0, fontWeight: 900, color: 'rgba(255,255,255,0.6)' }}>Weekly Workload vs. Peak Performance in Block (Cohort Average)</div>
              <div className="flex gap-4 text-[10px] font-black opacity-60">
                <span style={{ color: 'var(--accent-cyan)' }}>■ Avg Hours</span>
                <span style={{ color: 'var(--accent-emerald)' }}>● Avg Peak WA</span>
              </div>
            </div>
            
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={blockData.chartData}>
                  <defs>
                    <linearGradient id="colorCyanAgg" x1="0" y1="0" x2="0" y2="1">
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
                  <YAxis yAxisId="left" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} label={{ value: 'Average Hours', angle: -90, position: 'insideLeft', fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} label={{ value: 'Average WA Points', angle: 90, position: 'insideRight', fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine 
                    x={getMondayDateStr(blockData.startDate)} 
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
                  <Bar yAxisId="left" dataKey="hours" name="Avg Hours" fill="url(#colorCyanAgg)" radius={[4, 4, 0, 0]} barSize={18} />
                  <Line yAxisId="right" type="monotone" dataKey="waPoints" name="Avg Peak WA" stroke="var(--accent-emerald, #10b981)" strokeWidth={3} activeDot={{ r: 8, fill: 'var(--accent-emerald)', strokeWidth: 2, stroke: '#fff' }} dot={{ fill: 'var(--accent-emerald)', r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
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
        .animate-fade-in {
          animation: fadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
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
          <span style={{ fontWeight: 700 }}>Cohort Avg Workload:</span> {hours} hrs
        </div>
        {waPoints !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--accent-emerald, #10b981)' }}>●</span>
            <span style={{ fontWeight: 700 }}>Cohort Avg Peak WA:</span> {waPoints}
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
