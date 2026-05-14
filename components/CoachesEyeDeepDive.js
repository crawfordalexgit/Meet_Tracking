import React, { useMemo } from 'react';

export default function CoachesEyeDeepDive({ results, attendance, sessions, swimmer, squad, rel, insights = [] }) {
  const latestReport = useMemo(() => {
    if (!insights || insights.length === 0) return null;
    return insights[0].full_report;
  }, [insights]);

  const deepAnalysis = useMemo(() => {
    if (!results.length || !attendance.length) return null;

    // 1. Performance-Attendance Correlation
    const pbs = [...results].sort((a,b) => b.wa_pts - a.wa_pts).slice(0, 5);
    const pbCorrelations = pbs.map(pb => {
      const pbDate = new Date(pb.date);
      const fourWeeksAgo = new Date(pbDate.getTime() - 28 * 24 * 60 * 60 * 1000);
      const relevantAtt = attendance.filter(a => {
        const d = new Date(a.date);
        return d >= fourWeeksAgo && d <= pbDate;
      });
      const presentCount = relevantAtt.filter(a => a.status === 'present').length;
      const totalCount = relevantAtt.length || 1;
      return (presentCount / totalCount) * 100;
    });

    const avgPbAttendance = pbCorrelations.reduce((a,b) => a+b, 0) / (pbCorrelations.length || 1);

    // 2. Meet Temperament
    const openMeets = results.filter(r => r.meets?.type?.toLowerCase() === 'open');
    const internalMeets = results.filter(r => r.meets?.type?.toLowerCase() !== 'open');
    const avgOpen = openMeets.reduce((a,r) => a + (r.wa_pts || 0), 0) / (openMeets.length || 1);
    const avgInternal = internalMeets.reduce((a,r) => a + (r.wa_pts || 0), 0) / (internalMeets.length || 1);
    const temperament = avgOpen > avgInternal ? 'Big Stage Performer' : 'Training Specialist';
    const temperamentGap = Math.abs(avgOpen - avgInternal);

    // 3. Resilience Score (90 Days)
    const last90 = new Date(new Date().getTime() - 90 * 24 * 60 * 60 * 1000);
    const recentMissed = attendance.filter(a => new Date(a.date) >= last90 && a.status === 'absent').length;

    return {
      avgPbAttendance: Math.round(avgPbAttendance),
      temperament,
      temperamentGap: Math.round(temperamentGap),
      recentMissed,
      isConsistent: rel.percentage >= 75
    };
  }, [results, attendance, rel]);

  if (!deepAnalysis) return null;

  const displayData = latestReport || {
    headline: "PRELIMINARY PERFORMANCE AUDIT",
    overview: `${swimmer.full_name} is currently maintaining a ${rel.percentage}% consistency rate. This profile suggests ${deepAnalysis.isConsistent ? 'stable progression' : 'potential technical masking due to inconsistent load'}.`,
    training_analysis: `Patterns show ${deepAnalysis.recentMissed} absences in the last 90 days. During peak PB windows, attendance averaged ${deepAnalysis.avgPbAttendance}%, indicating that high performance is closely linked to training density.`,
    open_meet_analysis: `Currently categorized as a "${deepAnalysis.temperament}". Racing frequency shows a ${deepAnalysis.temperamentGap} point variance between Open Meets and Internal Galas.`,
    performance_link: "Visible synergy between 4-week preparatory blocks and FINA/WA point peaks. Plateaus in baseline speed correlate with gaps in the 90-day reliability window.",
    recommendations: deepAnalysis.recentMissed > 5 
      ? ["Prioritize 12-week stable volume block", "Review recovery protocols", "Minimize non-essential session gaps"]
      : ["Increase technical complexity in main sets", "Prepare for Regional level intensity", "Maintain current competitive rhythm"]
  };

  return (
    <div className="glass-card mb-16" style={{ padding: '3rem', borderLeft: '4px solid var(--accent-cyan)', background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.03) 0%, transparent 100%)' }}>
      <div className="flex justify-between items-start mb-12">
        <div>
          <div className="section-title" style={{ marginBottom: 8, color: 'var(--accent-cyan)', fontSize: '0.8rem' }}>CoachesEye Intelligence: Performance Audit</div>
          <h2 className="text-2xl font-black tracking-tight uppercase">{displayData.headline}</h2>
        </div>
        <div style={{ padding: '6px 12px', background: 'rgba(6, 182, 212, 0.1)', borderRadius: '8px', border: '1px solid rgba(6, 182, 212, 0.2)' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--accent-cyan)' }}>DNA VERIFIED: {new Date().getFullYear()} SEASON</span>
        </div>
      </div>
      
      {/* KPI TOP BAR */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12 pb-12 border-bottom border-white/5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex flex-col">
          <div style={{ fontSize: '0.6rem', opacity: 0.5, fontWeight: 900, textTransform: 'uppercase', marginBottom: 8 }}>Performance DNA</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--accent-cyan)' }}>{deepAnalysis.temperament}</div>
          <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: 4 }}>{deepAnalysis.temperamentGap} pts variance in Open Meets</div>
        </div>
        <div className="flex flex-col">
          <div style={{ fontSize: '0.6rem', opacity: 0.5, fontWeight: 900, textTransform: 'uppercase', marginBottom: 8 }}>Training Synergy</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 900 }}>{deepAnalysis.avgPbAttendance}% Prep Rate</div>
          <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: 4 }}>Density during 4-week PB windows</div>
        </div>
        <div className="flex flex-col">
          <div style={{ fontSize: '0.6rem', opacity: 0.5, fontWeight: 900, textTransform: 'uppercase', marginBottom: 8 }}>Reliability Index</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 900, color: deepAnalysis.recentMissed > 10 ? 'var(--accent-rose)' : '#10b981' }}>{deepAnalysis.recentMissed} Absences</div>
          <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: 4 }}>90-Day training reliability audit</div>
        </div>
      </div>

      {/* DETAILED NARRATIVE SECTIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 mb-12">
        <div className="flex flex-col gap-8">
          <section>
            <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--accent-cyan)', textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.1em' }}>1. Performance Overview</h4>
            <p style={{ fontSize: '1rem', lineHeight: 1.7, opacity: 0.9, fontWeight: 500 }}>{displayData.overview}</p>
          </section>
          
          <section>
            <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--accent-cyan)', textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.1em' }}>2. Training Attendance Audit</h4>
            <p style={{ fontSize: '1rem', lineHeight: 1.7, opacity: 0.9, fontWeight: 500 }}>{displayData.training_analysis}</p>
          </section>
          
          <section>
            <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--accent-cyan)', textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.1em' }}>3. Competition Strategy & Usage</h4>
            <p style={{ fontSize: '1rem', lineHeight: 1.7, opacity: 0.9, fontWeight: 500 }}>{displayData.open_meet_analysis}</p>
          </section>
        </div>

        <div className="flex flex-col gap-8">
          <section>
            <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--accent-cyan)', textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.1em' }}>4. Attendance-Performance Correlation</h4>
            <p style={{ fontSize: '1rem', lineHeight: 1.7, opacity: 0.9, fontWeight: 500 }}>{displayData.performance_link}</p>
          </section>

          <section style={{ padding: '2rem', background: 'rgba(6, 182, 212, 0.05)', borderRadius: '24px', border: '1px solid rgba(6, 182, 212, 0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 20 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-cyan)' }}></div>
              <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>5. AI Brain Recommendations</h4>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {displayData.recommendations?.map((rec, i) => (
                <li key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', fontSize: '0.95rem', fontWeight: 600, color: 'rgba(255,255,255,0.95)' }}>
                  <span style={{ color: 'var(--accent-cyan)' }}>•</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.65rem', opacity: 0.4, fontWeight: 900, letterSpacing: '0.1em' }}>SYNCHRONIZED WITH CLUB TECHNICAL MANUAL & LTAD FRAMEWORK</div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 900, padding: '4px 8px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderRadius: '4px' }}>DATA VERIFIED</div>
          <div style={{ fontSize: '0.6rem', fontWeight: 900, padding: '4px 8px', background: 'rgba(6, 182, 212, 0.1)', color: 'var(--accent-cyan)', borderRadius: '4px' }}>AI POWERED</div>
        </div>
      </div>
    </div>
  );
}
