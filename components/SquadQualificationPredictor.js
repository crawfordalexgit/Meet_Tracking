import React, { useState, useMemo } from 'react';
import PremiumOrb from './PremiumOrb';
import { normalizeEvent, timeToSeconds } from '../lib/analytics-utils';
import { getBenchmarks, timeStringToSeconds, secondsToTimeString } from '../lib/qualifying-times';

function isLongCourse(r) {
  const meetName = r.meets?.name?.toLowerCase() || '';
  const license = r.meets?.license || '';
  return meetName.includes('lc') || meetName.includes('long course') || license.startsWith('1');
}

function getStandardEventName(event) {
  if (!event) return '';
  const normalized = normalizeEvent(event).trim().toLowerCase();
  const parts = normalized.split(' ');
  if (parts.length >= 2) {
    const dist = parts[0];
    const stroke = parts[1].toUpperCase() === 'IM' ? 'IM' : parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
    return `${dist} ${stroke}`;
  }
  return event;
}

export default function SquadQualificationPredictor({ swimmers = [], results = [], squads = [] }) {
  const [targetLevel, setTargetLevel] = useState('COUNTY');
  const [manualYearOverride, setManualYearOverride] = useState(null);
  const [eventCategory, setEventCategory] = useState('sprints');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState('all'); // 'all', 'auto_met', 'cons_met'
  const [selectedSquad, setSelectedSquad] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) return ' ↕️';
    return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
  };

  const formatTime = (totalSeconds) => {
    if (!totalSeconds || totalSeconds === Infinity) return 'N/A';
    const mins = Math.floor(totalSeconds / 60);
    const secs = (totalSeconds % 60).toFixed(2);
    return mins > 0 ? `${mins}:${secs.padStart(5, '0')}` : secs;
  };

  const categories = {
    sprints: ['50 Free', '100 Free', '50 Back', '100 Back', '50 Breast', '100 Breast', '50 Fly', '100 Fly'],
    middle: ['200 Free', '400 Free', '200 Back', '200 Breast', '200 Fly'],
    distance_im: ['800 Free', '1500 Free', '100 IM', '200 IM', '400 IM']
  };

  const activeEvents = categories[eventCategory] || categories.sprints;

  const currentMonth = new Date().getMonth(); // 0-indexed
  const rolloverMonth = 4; // May
  const calculatedYear = currentMonth > rolloverMonth 
    ? new Date().getFullYear() + 1 
    : new Date().getFullYear();
  const targetYear = manualYearOverride || calculatedYear;

  const handlePrint = () => {
    window.print();
  };

  const processedSwimmers = useMemo(() => {
    return swimmers.map(swimmer => {
      const yob = swimmer.year_of_birth || (swimmer.date_of_birth ? new Date(swimmer.date_of_birth).getFullYear() : null);
      const swimmerAge = yob ? (targetYear - yob) : '?';
      
      const eventStats = {};
      
      activeEvents.forEach(evt => {
        if (!yob) {
          eventStats[evt] = { bestAuto: null, bestCons: null, targets: null, targetAge: null };
          return;
        }
        
        const targetAge = targetYear - yob;
        const evtResults = results.filter(r => r.swimmer_id === swimmer.id && normalizeEvent(r.event) === normalizeEvent(evt));
        const fastestSC = Math.min(...evtResults.filter(r => r.course === 'SC').map(r => timeToSeconds(r.time) || Infinity));
        const fastestLC = Math.min(...evtResults.filter(r => r.course === 'LC').map(r => timeToSeconds(r.time) || Infinity));
        const targets = getBenchmarks(targetAge, swimmer.gender, evt, targetLevel);
        
        if (!targets) {
          eventStats[evt] = { bestAuto: null, bestCons: null, targets: null, targetAge: null };
          return;
        }

        const scResult = evtResults.find(r => r.course === 'SC' && timeToSeconds(r.time) === fastestSC);
        const lcResult = evtResults.find(r => r.course === 'LC' && timeToSeconds(r.time) === fastestLC);

        const gaps = [];

        if (fastestSC !== Infinity) {
          gaps.push({
            type: 'Auto',
            course: 'SC',
            time: scResult ? scResult.time : '',
            target: targets.autoSC,
            gap: {
              timeGap: fastestSC - targets.autoSC,
              pctGap: (fastestSC - targets.autoSC) / targets.autoSC
            },
            isQualified: fastestSC <= targets.autoSC
          });
          gaps.push({
            type: 'Cons',
            course: 'SC',
            time: scResult ? scResult.time : '',
            target: targets.consSC,
            gap: {
              timeGap: fastestSC - targets.consSC,
              pctGap: (fastestSC - targets.consSC) / targets.consSC
            },
            isQualified: fastestSC <= targets.consSC
          });
        }

        if (fastestLC !== Infinity) {
          gaps.push({
            type: 'Auto',
            course: 'LC',
            time: lcResult ? lcResult.time : '',
            target: targets.autoLC,
            gap: {
              timeGap: fastestLC - targets.autoLC,
              pctGap: (fastestLC - targets.autoLC) / targets.autoLC
            },
            isQualified: fastestLC <= targets.autoLC
          });
          gaps.push({
            type: 'Cons',
            course: 'LC',
            time: lcResult ? lcResult.time : '',
            target: targets.consLC,
            gap: {
              timeGap: fastestLC - targets.consLC,
              pctGap: (fastestLC - targets.consLC) / targets.consLC
            },
            isQualified: fastestLC <= targets.consLC
          });
        }

        const bestAuto = gaps.filter(g => g.type === 'Auto' && g.gap).sort((a,b) => a.gap.pctGap - b.gap.pctGap)[0] || null;
        const bestCons = gaps.filter(g => g.type === 'Cons' && g.gap).sort((a,b) => a.gap.pctGap - b.gap.pctGap)[0] || null;
        
        eventStats[evt] = { bestAuto, bestCons, targets, targetAge };
      });
      
      return {
        ...swimmer,
        yob,
        swimmerAge,
        eventStats
      };
    });
  }, [swimmers, results, targetYear, targetLevel, activeEvents]);

  const orbStats = useMemo(() => {
    let athletesWithQual = 0;
    let totalQualSwims = 0;
    let eligibleCount = 0;

    processedSwimmers.forEach(swimmer => {
      const squadId = swimmer.squad_id || swimmer.squads?.id;
      if (!squadId) return;

      if (squads && squads.length > 0) {
        const isCompetitive = squads.some(s => s.id === squadId);
        if (!isCompetitive) return;
      }

      if (selectedSquad !== 'all' && String(squadId) !== String(selectedSquad)) {
        return;
      }

      eligibleCount++;
      let hasQual = false;
      if (swimmer.eventStats) {
        Object.values(swimmer.eventStats).forEach(stat => {
          if (stat.bestAuto && stat.bestAuto.gap && stat.bestAuto.gap.timeGap <= 0) {
            hasQual = true;
            totalQualSwims++;
          }
        });
      }
      if (hasQual) athletesWithQual++;
    });

    const conversionPct = eligibleCount > 0 ? Math.round((athletesWithQual / eligibleCount) * 100) : 0;

    return { athletesWithQual, totalQualSwims, conversionPct, eligibleCount };
  }, [processedSwimmers, squads, selectedSquad]);

  const filteredAndSorted = useMemo(() => {
    let filtered = processedSwimmers.filter(swimmer => {
      // Squad filter (competitive only + selected squad override)
      const squadId = swimmer.squad_id || swimmer.squads?.id;
      if (!squadId) return false;

      if (squads && squads.length > 0) {
        const isCompetitive = squads.some(s => s.id === squadId);
        if (!isCompetitive) return false;
      }

      if (selectedSquad !== 'all' && String(squadId) !== String(selectedSquad)) {
        return false;
      }

      // Search filter
      const name = (swimmer.full_name || swimmer.known_as || '').toLowerCase();
      if (searchTerm && !name.includes(searchTerm.toLowerCase())) {
        return false;
      }
      
      // Filter mode: 'all', 'auto_met', 'cons_met'
      if (filterMode === 'auto_met') {
        return Object.values(swimmer.eventStats).some(stat => stat.bestAuto?.isQualified);
      }
      if (filterMode === 'cons_met') {
        return Object.values(swimmer.eventStats).some(stat => stat.bestCons?.isQualified);
      }
      
      return true;
    });
    
    // Sorting logic
    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let valA, valB;
        if (sortConfig.key === 'name') {
          valA = (a.full_name || a.known_as || '').toLowerCase();
          valB = (b.full_name || b.known_as || '').toLowerCase();
          if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
          if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        } else if (sortConfig.key === 'age') {
          valA = typeof a.swimmerAge === 'number' ? a.swimmerAge : (sortConfig.direction === 'asc' ? Infinity : -Infinity);
          valB = typeof b.swimmerAge === 'number' ? b.swimmerAge : (sortConfig.direction === 'asc' ? Infinity : -Infinity);
          if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
          if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        } else {
          // Event sorting by pctGap
          const gapA = a.eventStats[sortConfig.key]?.bestAuto?.gap?.pctGap;
          const gapB = b.eventStats[sortConfig.key]?.bestAuto?.gap?.pctGap;
          
          const hasA = gapA !== undefined && gapA !== null;
          const hasB = gapB !== undefined && gapB !== null;
          
          if (!hasA && !hasB) return 0;
          if (!hasA) return 1;
          if (!hasB) return -1;
          
          if (gapA < gapB) return sortConfig.direction === 'asc' ? -1 : 1;
          if (gapA > gapB) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        }
      });
    }
    
    return filtered;
  }, [processedSwimmers, searchTerm, filterMode, sortConfig, selectedSquad, squads]);

  return (
    <div className="glass-card predictor-card" style={{ padding: '2rem', marginTop: '1rem', border: '1px solid rgba(255, 255, 255, 0.1)', background: 'var(--bg-card)' }}>
      {/* Header controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 pb-6 border-b border-white/5 no-print">
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 950, margin: 0, letterSpacing: '-0.02em' }}>
            Targeting <span style={{ color: 'var(--accent-cyan)' }}>{targetYear}</span> {targetLevel === 'COUNTY' ? 'Kent County' : 'Regional'} Championships
          </h2>
          <div className="no-print" style={{ marginTop: '8px', fontSize: '0.8rem', fontWeight: 600, display: 'flex', gap: '8px', alignItems: 'center' }}>
            {manualYearOverride ? (
              <span style={{ color: 'var(--accent-amber)' }}>
                ⚠️ Manually overriding to evaluate against {targetYear} standards and age groups.
              </span>
            ) : targetYear > new Date().getFullYear() ? (
              <span style={{ color: 'var(--accent-cyan)' }}>
                ℹ️ Current year championships have passed. Auto-evaluating against next season's ({targetYear}) standards.
              </span>
            ) : (
              <span style={{ color: 'var(--text-dim)' }}>
                Evaluating against current {targetYear} season standards.
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: 4 }}>
            SC/LC Best Path math engine analyzing individual qualification metrics.
          </p>
        </div>

        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', opacity: 0.6 }}>Level:</span>
            <select
              value={targetLevel}
              onChange={(e) => setTargetLevel(e.target.value)}
              className="select-custom"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: 'white',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.75rem',
                fontWeight: 700,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="COUNTY" style={{ background: '#0d1117' }}>County</option>
              <option value="REGIONAL" style={{ background: '#0d1117' }}>Regional</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', opacity: 0.6 }}>Target Year:</span>
            <select
              value={manualYearOverride || ''}
              onChange={(e) => setManualYearOverride(e.target.value ? parseInt(e.target.value) : null)}
              className="select-custom"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: 'white',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.75rem',
                fontWeight: 700,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="" style={{ background: '#0d1117' }}>Auto ({calculatedYear})</option>
              <option value="2025" style={{ background: '#0d1117' }}>2025</option>
              <option value="2026" style={{ background: '#0d1117' }}>2026</option>
              <option value="2027" style={{ background: '#0d1117' }}>2027</option>
            </select>
          </div>

          <button
            onClick={handlePrint}
            className="btn-premium-intel"
            style={{
              padding: '6px 16px',
              fontSize: '0.75rem',
              fontWeight: 800,
              background: 'linear-gradient(135deg, var(--accent-cyan) 0%, rgba(0, 212, 255, 0.8) 100%)',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
            Print PDF
          </button>
        </div>
      </div>

      {/* Premium Orb Summary Row */}
      <div className="flex flex-wrap gap-8 justify-center items-center py-6 mb-8 border-b border-white/5 no-print" style={{ background: 'rgba(255,255,255,0.01)', borderRadius: '12px', padding: '1.5rem 2rem' }}>
        <PremiumOrb 
          value={orbStats.conversionPct} 
          customValue={`${orbStats.athletesWithQual} / ${orbStats.eligibleCount}`}
          unit="" 
          label="Qualified Athletes" 
          size={100} 
        />
        <PremiumOrb 
          value={orbStats.totalQualSwims > 0 ? 100 : 0} 
          customValue={`${orbStats.totalQualSwims}`}
          unit="" 
          label="Total QTs Met" 
          size={100} 
          color="amber" 
        />
        <PremiumOrb 
          value={orbStats.conversionPct} 
          unit="%" 
          label="Squad Conversion" 
          size={100} 
        />
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 mb-6 border-b border-white/5 pb-4 no-print">
        {[
          { id: 'sprints', label: '⚡ Sprints (50/100)' },
          { id: 'middle', label: '⏱️ Middle Distance (200/400)' },
          { id: 'distance_im: ', label: '🏁 Distance & IM' }
        ].map((tab) => {
          const tabId = tab.id.trim().replace(':', '');
          const isActive = eventCategory === tabId;
          return (
            <button
              key={tabId}
              onClick={() => setEventCategory(tabId)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '0.7rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                border: 'none',
                background: isActive ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
                color: isActive ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.4)',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: isActive ? 'rgba(0, 212, 255, 0.3)' : 'transparent',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6 no-print" style={{ alignItems: 'center', justifyContent: 'space-between', marginTop: '1.5rem' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: '320px' }}>
          <input
            type="text"
            placeholder="Search swimmers by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '8px 12px 8px 32px',
              fontSize: '0.8rem',
              color: 'white',
              outline: 'none',
              transition: 'all 0.2s ease'
            }}
          />
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>

        <div className="flex items-center gap-2" style={{ width: '100%', sm: 'auto', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {squads && squads.length > 0 && (
            <select 
              className="tactical-search-input" 
              style={{ 
                width: 'auto', 
                padding: '10px 16px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: 'white',
                borderRadius: '8px',
                fontSize: '0.75rem',
                fontWeight: 700,
                outline: 'none',
                cursor: 'pointer'
              }} 
              value={selectedSquad} 
              onChange={e => setSelectedSquad(e.target.value)}
            >
              <option value="all" style={{ background: '#0d1117' }}>All Competitive Squads</option>
              {squads.map(s => <option key={s.id} value={s.id} style={{ background: '#0d1117' }}>{s.name}</option>)}
            </select>
          )}

          <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', opacity: 0.6, marginLeft: '8px' }}>Filter Met QTs:</span>
          <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', padding: '2px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            {[
              { id: 'all', label: 'All Swimmers' },
              { id: 'auto_met', label: 'Auto Met' },
              { id: 'cons_met', label: 'Cons Met' }
            ].map(option => {
              const active = filterMode === option.id;
              return (
                <button
                  key={option.id}
                  onClick={() => setFilterMode(option.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    border: 'none',
                    background: active ? 'rgba(0, 212, 255, 0.15)' : 'transparent',
                    color: active ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.6)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <th
                onClick={() => requestSort('name')}
                className="cursor-pointer hover-accent"
                style={{ padding: '1rem', fontWeight: 800, userSelect: 'none', cursor: 'pointer' }}
              >
                Athlete (Age in {targetYear}){getSortIndicator('name')}
              </th>
              {activeEvents.map(evt => (
                <th
                  key={evt}
                  onClick={() => requestSort(evt)}
                  className="cursor-pointer hover-accent"
                  style={{ padding: '1rem', fontWeight: 800, textTransform: 'uppercase', whiteSpace: 'nowrap', userSelect: 'none', textAlign: 'center', cursor: 'pointer' }}
                >
                  {evt}{getSortIndicator(evt)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredAndSorted.length === 0 ? (
              <tr>
                <td colSpan={activeEvents.length + 1} style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255, 255, 255, 0.4)' }}>
                  No swimmers match the search term or filter criteria.
                </td>
              </tr>
            ) : (
              filteredAndSorted.map((swimmer) => {
                const yob = swimmer.yob;
                const swimmerAge = swimmer.swimmerAge;
                return (
                  <tr key={swimmer.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                    <td style={{ padding: '1rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ color: 'white' }}>{swimmer.full_name || swimmer.known_as}</span>
                        <span style={{ fontSize: '0.65rem', opacity: 0.5, marginTop: '2px' }}>
                          {swimmer.gender} • {swimmerAge} Yrs (YOB: {yob || '?'})
                        </span>
                      </div>
                    </td>
                    {activeEvents.map(evt => {
                      const { bestAuto, bestCons, targets, targetAge } = swimmer.eventStats[evt] || { bestAuto: null, bestCons: null, targets: null, targetAge: null };

                      const tooltipText = targets
                        ? `${targetLevel} Target Times (${targetAge} Yrs):\n• Auto SC: ${formatTime(targets.autoSC)} | LC: ${formatTime(targets.autoLC)}\n• Cons SC: ${formatTime(targets.consSC)} | LC: ${formatTime(targets.consLC)}`
                        : 'No standard targets defined for this age/event';

                      let bg = 'rgba(255, 255, 255, 0.01)';
                      let borderLeft = 'none';

                      if (bestAuto && bestAuto.isQualified) {
                        bg = 'rgba(16, 185, 129, 0.08)';
                        borderLeft = '3px solid #10b981';
                      } else if (bestCons && bestCons.isQualified) {
                        bg = 'rgba(245, 158, 11, 0.08)';
                        borderLeft = '3px solid #f59e0b';
                      } else if (bestAuto && bestAuto.gap.timeGap > 0) {
                        bg = 'rgba(239, 68, 68, 0.03)';
                        borderLeft = '3px solid rgba(239, 68, 68, 0.3)';
                      }

                      return (
                        <td key={evt} style={{ padding: '0.75rem 1rem', background: bg, borderLeft: borderLeft, transition: 'all 0.2s ease', position: 'relative' }}>
                          <div 
                            title={tooltipText}
                            style={{ 
                              display: 'flex', 
                              flexDirection: 'column', 
                              gap: '3px', 
                              cursor: 'help', 
                              transition: 'all 0.2s' 
                            }}
                          >
                            {bestAuto ? (
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontWeight: 800, color: 'white' }}>{bestAuto.time}</span>
                                  <span style={{ fontSize: '0.6rem', padding: '1px 4px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.05)', opacity: 0.8 }}>{bestAuto.course}</span>
                                </div>
                                <div style={{ fontSize: '0.65rem', fontWeight: 700, marginTop: '2px', color: bestAuto.isQualified ? '#10b981' : 'rgba(255,255,255,0.5)' }}>
                                  {bestAuto.isQualified ? `Qualified [${bestAuto.course}]` : `Auto: +${bestAuto.gap.timeGap.toFixed(2)}s`}
                                </div>
                              </div>
                            ) : (
                              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>No Entry</div>
                            )}
                            {bestCons && !bestAuto?.isQualified && (
                              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: bestCons.isQualified ? '#f59e0b' : 'rgba(255,255,255,0.4)', marginTop: '1px' }}>
                                {bestCons.isQualified ? `Cons Met [${bestCons.course}]` : `Cons: +${bestCons.gap.timeGap.toFixed(2)}s`}
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
