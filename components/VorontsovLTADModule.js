import React, { useState, useMemo } from 'react';

export default function VorontsovLTADModule({ swimmer, totalActualHours = 0 }) {
  const [maturityOffset, setMaturityOffset] = useState('normal');

  const chronologicalAge = useMemo(() => {
    if (!swimmer?.year_of_birth) return 12;
    return new Date().getFullYear() - swimmer.year_of_birth;
  }, [swimmer]);

  const biologicalAge = useMemo(() => {
    if (maturityOffset === 'early') return chronologicalAge + 1.5;
    if (maturityOffset === 'late') return chronologicalAge - 1.5;
    return chronologicalAge;
  }, [chronologicalAge, maturityOffset]);

  const isMale = swimmer?.gender === 'M' || swimmer?.gender === 'Male';

  const sensitivePeriods = [
    { trait: 'Aerobic Capacity', mStart: 12, mEnd: 15, fStart: 10, fEnd: 14, desc: 'Extensive aerobic mileage & efficiency' },
    { trait: 'Aerobic Power (VO2 max)', mStart: 14, mEnd: 17, fStart: 12, fEnd: 14, desc: 'High-end aerobic development' },
    { trait: 'Anaerobic Power', mStart: 14, mEnd: 18, fStart: 13, fEnd: 16, desc: 'Lactate tolerance & glycolytic capacity' },
    { trait: 'Maximal Strength', mStart: 15, mEnd: 18, fStart: 14, fEnd: 16, desc: 'Heavy resistance & hypertrophy' },
    { trait: 'Speed/Strength', mStart: 15, mEnd: 18, fStart: 13, fEnd: 16, desc: 'Explosive power & sprint execution' },
  ];

  return (
    <div className="animate-fade-in space-y-6">
      <div className="glass-card" style={{ padding: '2rem 2.5rem', borderLeft: '4px solid var(--accent-violet)' }}>
        <div className="flex justify-between items-start mb-6 flex-wrap gap-4">
          <div>
            <div className="insight-tag" style={{ color: 'var(--accent-violet)' }}>VORONTSOV SCIENTIFIC FRAMEWORK</div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 900, textTransform: 'uppercase' }}>Biological Maturation Engine</h3>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '12px', display: 'flex', gap: '0.5rem' }}>
            {['late', 'normal', 'early'].map(type => (
              <button
                key={type}
                onClick={() => setMaturityOffset(type)}
                style={{
                  padding: '8px 16px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 900, textTransform: 'uppercase',
                  background: maturityOffset === type ? 'var(--accent-violet)' : 'transparent',
                  color: maturityOffset === type ? '#000' : 'rgba(255,255,255,0.5)',
                  border: 'none', cursor: 'pointer', transition: 'all 0.2s'
                }}
              >
                {type} Developer
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div>
            <div className="flex items-baseline gap-4 mb-2">
              <div style={{ fontSize: '3rem', fontWeight: 950, lineHeight: 1 }}>{biologicalAge.toFixed(1)}</div>
              <div style={{ fontSize: '0.8rem', fontWeight: 800, opacity: 0.5, letterSpacing: '0.1em' }}>BIOLOGICAL YEARS</div>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
              Chronological age is {chronologicalAge}.{' '}
              {maturityOffset === 'early'
                ? 'Early developers (Accelerants) achieve Peak Height Velocity earlier, shifting their optimal training windows forward.'
                : maturityOffset === 'late'
                ? 'Late developers (Retardants) reach physical maturity later, requiring extended aerobic base building before heavy anaerobic loading.'
                : 'Normo-type development tracks with standard biological age brackets.'}
            </p>
          </div>

          {biologicalAge < (isMale ? 14 : 13) ? (
            <div style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', padding: '1.25rem', borderRadius: '12px' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--accent-cyan)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '1rem' }}>💧</span> AEROBIC DISPOSITION ACTIVE
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                Pre-pubescent physiology detected. Due to lower LDH and PFK enzyme activity, anaerobic lactate production is severely limited. Extensive aerobic mileage should be the primary form of endurance training.
              </p>
            </div>
          ) : (
            <div style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', padding: '1.25rem', borderRadius: '12px' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--accent-rose)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '1rem' }}>⚡</span> ANAEROBIC WINDOW OPEN
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                Post-pubertal physiology detected. The athlete has the enzymatic infrastructure to tolerate heavy lactate sets. Transition focus toward Maximal Power, Speed/Strength, and race-pace anaerobic endurance.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="glass-card" style={{ padding: '2rem 2.5rem' }}>
        <h4 style={{ fontSize: '1rem', fontWeight: 900, marginBottom: '1.5rem', textTransform: 'uppercase' }}>Windows of Opportunity (Sensitive Periods)</h4>
        <div className="space-y-4">
          {sensitivePeriods.map((sp, idx) => {
            const start = isMale ? sp.mStart : sp.fStart;
            const end = isMale ? sp.mEnd : sp.fEnd;
            const isActive = biologicalAge >= start && biologicalAge <= end;
            const isPast = biologicalAge > end;
            const statusColor = isActive ? 'var(--accent-emerald)' : (isPast ? 'var(--accent-amber)' : 'rgba(255,255,255,0.1)');

            return (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: `1px solid ${isActive ? 'rgba(16,185,129,0.3)' : 'transparent'}` }}>
                <div style={{ flex: '0 0 160px' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 900, color: '#fff' }}>{sp.trait}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Ages {start}–{end}</div>
                </div>
                <div style={{ flex: 1, height: '8px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
                  <div style={{
                    position: 'absolute', left: `${Math.max(0, (start - 8) / 12 * 100)}%`, width: `${((end - start) / 12) * 100}%`,
                    height: '100%', background: statusColor, borderRadius: '4px', opacity: isActive ? 1 : 0.3
                  }} />
                  {isActive && (
                    <div style={{
                      position: 'absolute', left: `${Math.max(0, (biologicalAge - 8) / 12 * 100)}%`,
                      width: '4px', height: '14px', top: '-3px', background: '#fff', borderRadius: '2px', boxShadow: '0 0 8px #fff'
                    }} />
                  )}
                </div>
                <div style={{ flex: '0 0 140px', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {sp.desc}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CoachesEye Biometrics Guide */}
      <div className="glass-card" style={{ padding: '2rem 2.5rem', borderLeft: '4px solid var(--accent-amber)' }}>
        <h4 style={{ fontSize: '1rem', fontWeight: 900, marginBottom: '1rem', textTransform: 'uppercase' }}>📖 CoachesEye Biometrics Guide</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <strong style={{ color: '#fff' }}>Early Developer (Accelerant)</strong><br />
            Reaches Peak Height Velocity (PHV) 1–2 years ahead of peers. Dominates age-group competition but risk of overtraining is highest. Aerobic window opens sooner — capitalise early.
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <strong style={{ color: '#fff' }}>Late Developer (Retardant)</strong><br />
            Reaches PHV 1–2 years behind peers. Often outperformed in youth but frequently overtakes in senior competition. Extended aerobic base investment is critical during this phase.
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <strong style={{ color: '#fff' }}>Normo-type</strong><br />
            Standard biological development. Sensitive period windows align with the age brackets shown above. Training load can follow the standard Vorontsov LTAD model without adjustment.
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <strong style={{ color: '#fff' }}>Pre-Pubescent Rule</strong><br />
            Before puberty, LDH and PFK enzyme activity is too low to sustain significant anaerobic lactate production. Prioritise aerobic mileage exclusively. Heavy lactate sets have no physiological return at this stage.
          </div>
        </div>
      </div>

      {/* Break Point Volume Calculator */}
      {(() => {
        const BREAK_POINT_TARGET = 660;
        const criticalStart = isMale ? 15 : 13;
        const criticalEnd = isMale ? 16 : 14;
        const inCriticalWindow = biologicalAge >= criticalStart && biologicalAge <= criticalEnd;
        const pct = Math.min(100, Math.round((totalActualHours / BREAK_POINT_TARGET) * 100));
        const shortfall = BREAK_POINT_TARGET - totalActualHours;
        const barColor = pct >= 100 ? 'var(--accent-emerald)' : inCriticalWindow && pct < 75 ? 'var(--accent-rose)' : 'var(--accent-amber)';

        return (
          <div className="glass-card" style={{ padding: '2rem 2.5rem', borderLeft: `4px solid ${barColor}` }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 900, marginBottom: '0.5rem', textTransform: 'uppercase' }}>
              Gender-Dimorphic Break Point Volume
            </h4>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              Vorontsov's rule: to prevent a decline in physical abilities and a plateau in performance, <strong>girls aged 13–14</strong> and <strong>boys aged 15–16</strong> must achieve a <em>break point volume</em> of 2,000–2,400 km (approx. <strong>660+ hours</strong>) per season.
            </p>
            <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)' }}>SEASONAL HOURS</span>
              <span style={{ fontSize: '1.1rem', fontWeight: 900 }}>{Math.round(totalActualHours)} <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>/ {BREAK_POINT_TARGET} hrs</span></span>
            </div>
            <div style={{ height: '10px', background: 'rgba(0,0,0,0.3)', borderRadius: '5px', overflow: 'hidden', marginBottom: '1rem' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '5px', transition: 'width 0.5s ease' }} />
            </div>
            {inCriticalWindow && pct < 100 && (
              <div style={{ background: `rgba(244,63,94,0.1)`, border: '1px solid rgba(244,63,94,0.3)', padding: '1rem', borderRadius: '10px', fontSize: '0.75rem', color: 'var(--accent-rose)', lineHeight: 1.5 }}>
                ⚠️ <strong>Critical window alert.</strong> This swimmer is currently in their break point biological age band ({criticalStart}–{criticalEnd} yrs) but is <strong>{Math.round(shortfall)} hours short</strong> of the seasonal target. Risk of performance plateau if mileage is not increased.
              </div>
            )}
            {pct >= 100 && (
              <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', padding: '1rem', borderRadius: '10px', fontSize: '0.75rem', color: 'var(--accent-emerald)', lineHeight: 1.5 }}>
                ✅ <strong>Break point volume achieved.</strong> Seasonal mileage target met — physiological adaptation threshold satisfied.
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
