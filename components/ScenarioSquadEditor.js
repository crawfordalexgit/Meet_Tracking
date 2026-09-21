import { useMemo } from 'react';
import { LTAD_VERDICT_LABELS } from '../lib/restructure-glossary';
import Term from './restructure/Term';
import {
  ltadBandForAgeRange, ltadScore, isBandTooWide, resolveEffectiveTargetHours
} from '../lib/restructure-solver';

/**
 * Editor for the proposed squad structure.
 *
 * Age bands are in swimming age — the age reached by 31 December — because that
 * is what squads and championship age groups are built on. Each card shows the
 * LTAD volume band its age range implies and how far the squad's weekly hours
 * sit from it, so re-banding a squad and re-targeting its hours are visibly the
 * same decision.
 */
export default function ScenarioSquadEditor({ squads, ageHistogram = {}, ltadTable = 'unified', onChange }) {
  const ages = useMemo(() => {
    const keys = Object.keys(ageHistogram).map(Number).filter(n => n > 0).sort((a, b) => a - b);
    if (!keys.length) return { keys: [], max: 0 };
    return { keys, max: Math.max(...keys.map(k => ageHistogram[k])) };
  }, [ageHistogram]);

  const update = (id, patch) => onChange(squads.map(s => (s.id === id ? { ...s, ...patch } : s)));
  const remove = id => onChange(squads.filter(s => s.id !== id));

  const addSquad = () => onChange(squads.concat([{
    id: `sq_new_${squads.length + 1}`,
    name: 'New squad', sourceSquadId: null,
    minAge: 11, maxAge: 13, targetSize: 20, swimmersPerLane: 8,
    targetSessionsPerWeek: 3, targetHoursPerWeek: 4.5,
    requireWeekend: false, competitive: true,
    priority: squads.length + 1, allowSharedSlot: true, homeVenue: null
  }]));

  /** Split a band at its midpoint into two squads sharing the roster. */
  const split = id => {
    const sq = squads.find(s => s.id === id);
    if (!sq || sq.maxAge <= sq.minAge) return;
    const mid = Math.floor((sq.minAge + sq.maxAge) / 2);
    const half = Math.round(sq.targetSize / 2);
    onChange(squads.flatMap(s => s.id !== id ? [s] : [
      { ...s, maxAge: mid, targetSize: half, name: `${s.name} (younger)` },
      {
        ...s, id: `${s.id}_split`, minAge: mid + 1,
        targetSize: sq.targetSize - half, name: `${s.name} (older)`,
        sourceSquadId: null
      }
    ]));
  };

  return (
    <div>
      {ages.keys.length > 0 && (
        <div className="glass-card" style={{ padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
          <div className="sq-hist-title">CLUB ROSTER BY SWIMMING AGE (AGE REACHED BY 31 DEC)</div>
          <div className="sq-hist">
            {ages.keys.map(age => (
              <div key={age} className="sq-hist-col" title={`${ageHistogram[age]} swimmers aged ${age}`}>
                <div className="sq-hist-bar" style={{ height: `${(ageHistogram[age] / ages.max) * 100}%` }} />
                <div className="sq-hist-n">{ageHistogram[age]}</div>
                <div className="sq-hist-age">{age}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="sq-grid">
        {squads.map(sq => {
          const band = ltadBandForAgeRange(Number(sq.minAge), Number(sq.maxAge), ltadTable);
          const resolved = resolveEffectiveTargetHours(sq);
          const score = ltadScore(resolved.hours, band);
          const tooWide = isBandTooWide(Number(sq.minAge), Number(sq.maxAge), band);
          const inBand = countInBand(ageHistogram, sq.minAge, sq.maxAge);
          const verdictColour = score.verdict === 'OPTIMAL' ? 'var(--accent-emerald)'
            : score.verdict === 'UNKNOWN' ? 'var(--text-secondary)' : 'var(--accent-amber)';

          return (
            <div key={sq.id} className="glass-card sq-card">
              <div className="sq-head">
                <input className="sq-name" type="text" value={sq.name}
                  onChange={e => update(sq.id, { name: e.target.value })} />
                <button type="button" className="sq-mini sq-mini-danger"
                  onClick={() => remove(sq.id)} title="Remove squad">✕</button>
              </div>

              <div className="sq-fields">
                <Field label="Min age" hint="swimming age">
                  <input type="number" min="5" max="25" value={sq.minAge}
                    onChange={e => update(sq.id, { minAge: Number(e.target.value) })} />
                </Field>
                <Field label="Max age" hint="swimming age">
                  <input type="number" min="5" max="25" value={sq.maxAge}
                    onChange={e => update(sq.id, { maxAge: Number(e.target.value) })} />
                </Field>
                <Field label="Target size">
                  <input type="number" min="0" max="200" value={sq.targetSize}
                    onChange={e => update(sq.id, { targetSize: Number(e.target.value) })} />
                </Field>
                <Field label="Per lane">
                  <input type="number" min="1" max="16" value={sq.swimmersPerLane}
                    onChange={e => update(sq.id, { swimmersPerLane: Number(e.target.value) })} />
                </Field>
                <Field label="Sessions / wk">
                  <input type="number" min="0" max="14" value={sq.targetSessionsPerWeek}
                    onChange={e => update(sq.id, { targetSessionsPerWeek: Number(e.target.value) })} />
                </Field>
                <Field label="Hours / wk">
                  <input type="number" min="0" max="30" step="0.5" value={sq.targetHoursPerWeek}
                    onChange={e => update(sq.id, { targetHoursPerWeek: Number(e.target.value) })} />
                </Field>
              </div>

              <div className="sq-toggles">
                <label>
                  <input type="checkbox" checked={!!sq.requireWeekend}
                    onChange={e => update(sq.id, { requireWeekend: e.target.checked })} />
                  <span>Needs a weekend session</span>
                </label>
                <label>
                  <input type="checkbox" checked={sq.competitive !== false}
                    onChange={e => update(sq.id, { competitive: e.target.checked })} />
                  <span>Competitive (counts toward the training volume guide)</span>
                </label>
              </div>

              <div className="sq-ltad">
                <div className="sq-ltad-row">
                  <span className="sq-ltad-label"><Term k="volumeGuide">Volume guide</Term></span>
                  <span className="sq-ltad-value">
                    {band.stageCount ? `${band.min}–${band.max} h/wk` : 'n/a'}
                  </span>
                </div>
                <div className="sq-ltad-stages">{band.stageNames.join(' · ') || '—'}</div>
                <div className="sq-ltad-row" style={{ marginTop: '0.5rem' }}>
                  <span className="sq-ltad-label">This squad</span>
                  <span className="sq-ltad-value" style={{ color: verdictColour }}>
                    {resolved.hours} h{resolved.derived ? ' (derived)' : ''} · {LTAD_VERDICT_LABELS[score.verdict] || score.verdict}
                    {score.gapHours !== 0 && ` (${score.gapHours > 0 ? '+' : ''}${score.gapHours} h)`}
                  </span>
                </div>
                <div className="sq-ltad-row">
                  <span className="sq-ltad-label">Swimmers in this age band today</span>
                  <span className="sq-ltad-value">{inBand}</span>
                </div>
              </div>

              {resolved.derived && (
                <p className="sq-note">
                  Weekly hours are zero in the club record, so they are derived from
                  sessions × session length for scoring only. Nothing is written back.
                </p>
              )}
              {tooWide && (
                <p className="sq-note sq-note-warn">
                  This band spans {band.stageCount} development stages across {band.min}–{band.max} h/wk.
                  No single weekly volume suits all of it — consider splitting.
                </p>
              )}

              <div className="sq-actions">
                <button type="button" className="sq-mini" onClick={() => split(sq.id)}
                  disabled={sq.maxAge <= sq.minAge}>Split band</button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '1.25rem' }}>
        <button type="button" className="btn-premium-intel" onClick={addSquad}>+ Add a squad</button>
      </div>

      <style jsx>{`
        .sq-hist-title {
          font-size: 0.62rem; font-weight: 900; letter-spacing: 0.12em;
          color: var(--text-secondary); margin-bottom: 0.9rem;
        }
        .sq-hist { display: flex; align-items: flex-end; gap: 4px; height: 110px; }
        .sq-hist-col {
          flex: 1; display: flex; flex-direction: column; align-items: center;
          justify-content: flex-end; height: 100%; min-width: 22px;
        }
        .sq-hist-bar {
          width: 100%; background: rgba(var(--accent-cyan-rgb), 0.5);
          border-radius: 3px 3px 0 0; min-height: 2px;
        }
        .sq-hist-n { font-size: 0.58rem; font-weight: 800; opacity: 0.8; }
        .sq-hist-age {
          font-size: 0.62rem; font-weight: 900; color: var(--text-secondary);
          border-top: 1px solid var(--glass-border); width: 100%; text-align: center; padding-top: 2px;
        }
        .sq-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 1.25rem;
        }
        .sq-card { padding: 1.15rem 1.25rem; }
        .sq-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.9rem; }
        .sq-name {
          flex: 1; background: transparent; border: none; border-bottom: 2px solid var(--glass-border);
          color: inherit; font-size: 1.05rem; font-weight: 900; padding: 3px 0;
        }
        .sq-name:focus { outline: none; border-bottom-color: var(--accent-cyan); }
        .sq-fields { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.6rem; }
        .sq-toggles {
          display: flex; flex-direction: column; gap: 0.35rem; margin: 0.9rem 0;
          font-size: 0.72rem; font-weight: 600;
        }
        .sq-toggles label { display: flex; align-items: center; gap: 0.45rem; cursor: pointer; }
        .sq-ltad {
          border-top: 1px solid var(--glass-border); padding-top: 0.8rem; margin-top: 0.3rem;
        }
        .sq-ltad-row { display: flex; justify-content: space-between; gap: 0.5rem; align-items: baseline; }
        .sq-ltad-label {
          font-size: 0.6rem; font-weight: 900; letter-spacing: 0.08em; color: var(--text-secondary);
        }
        .sq-ltad-value { font-size: 0.8rem; font-weight: 800; text-align: right; }
        .sq-ltad-stages {
          font-size: 0.62rem; color: var(--text-secondary); opacity: 0.85; margin-top: 2px;
        }
        .sq-note {
          font-size: 0.65rem; line-height: 1.4; color: var(--text-secondary);
          margin: 0.7rem 0 0; padding-left: 0.6rem;
          border-left: 2px solid var(--glass-border);
        }
        .sq-note-warn { border-left-color: var(--accent-amber); }
        .sq-actions { margin-top: 0.9rem; display: flex; gap: 0.5rem; }
        .sq-mini {
          background: transparent; border: 1px solid var(--glass-border); border-radius: 6px;
          color: var(--text-secondary); cursor: pointer; padding: 4px 10px;
          font-size: 0.7rem; font-weight: 800;
        }
        .sq-mini:disabled { opacity: 0.4; cursor: not-allowed; }
        .sq-mini-danger:hover { color: var(--accent-rose); border-color: var(--accent-rose); }
      `}</style>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="fld" title={hint || ''}>
      <span>{label}</span>
      {children}
      <style jsx>{`
        .fld { display: flex; flex-direction: column; gap: 0.25rem; }
        .fld span {
          font-size: 0.56rem; font-weight: 900; letter-spacing: 0.08em; color: var(--text-secondary);
        }
        .fld :global(input) {
          width: 100%; padding: 6px 8px; border-radius: 6px;
          border: 1px solid var(--glass-border); background: var(--glass-bg);
          color: inherit; font-weight: 700; font-size: 0.82rem;
        }
      `}</style>
    </label>
  );
}

function countInBand(histogram, minAge, maxAge) {
  return Object.keys(histogram)
    .map(Number)
    .filter(a => a >= minAge && a <= maxAge)
    .reduce((sum, a) => sum + histogram[a], 0);
}
