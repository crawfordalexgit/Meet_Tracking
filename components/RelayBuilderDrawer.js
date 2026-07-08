/**
 * RelayBuilderDrawer — manual override panel for one relay event.
 *
 * Shows every team (A, B, C…) for the selected event with a per-leg swimmer
 * selector. Options are pre-filtered to legal choices (right stroke time, not
 * already in another team of this event) so a swap can never produce a
 * duplicate; mixed 2M+2F is validated and flagged rather than blocked.
 */

import { useMemo } from 'react';
import { formatTime } from '../lib/relays/kent-relays-config';

const strokeColor = { Back: '#38bdf8', Breast: '#f472b6', Fly: '#fbbf24', Free: '#34d399' };

function teamValidity(team, composition) {
  const filled = team.legs.filter((l) => l.swimmer);
  if (filled.length < 4) return { ok: false, msg: `${filled.length}/4 legs filled` };
  const ids = new Set(filled.map((l) => l.swimmer.id));
  if (ids.size < 4) return { ok: false, msg: 'duplicate swimmer' };
  if (composition === '2M2F') {
    const f = filled.filter((l) => l.swimmer.sex === 'F').length;
    if (f !== 2) return { ok: false, msg: 'needs exactly 2 female + 2 male' };
  }
  if (composition === '4F' && filled.some((l) => l.swimmer.sex !== 'F')) return { ok: false, msg: 'female only' };
  return { ok: true };
}

export default function RelayBuilderDrawer({
  event, teams, eligible, usage, cap,
  onSwap, onToggleLock, onReoptimise, onAddTeam, onRemoveTeam, onClose,
}) {
  const { band, cat, relay } = event;

  // Swimmer ids committed to any team in this event (for one-team-per-band rule).
  const inThisEvent = useMemo(() => {
    const m = new Map();
    teams.forEach((t) => t.legs.forEach((l) => { if (l.swimmer) m.set(l.swimmer.id, t.letter); }));
    return m;
  }, [teams]);

  function optionsForLeg(team, leg) {
    const stroke = leg.stroke;
    const currentId = leg.swimmer?.id;
    return eligible
      .filter((p) => p.times[stroke] != null)
      .filter((p) => {
        const owner = inThisEvent.get(p.id);
        return p.id === currentId || owner == null || owner === undefined;
      })
      .sort((a, b) => a.times[stroke] - b.times[stroke]);
  }

  const benchByStroke = (stroke) =>
    eligible
      .filter((p) => p.times[stroke] != null && !inThisEvent.has(p.id))
      .sort((a, b) => a.times[stroke] - b.times[stroke]);

  return (
    <div className="glass-card" style={{ padding: '2rem', marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <div className="section-title" style={{ marginBottom: '0.25rem' }}>Team Builder</div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 900, letterSpacing: '-0.02em', margin: 0 }}>
            {event.programmeNo ? <span style={{ opacity: 0.4, marginRight: 8 }}>#{event.programmeNo}</span> : null}
            {band.label} · {cat.label} · {relay.label}
          </h2>
          <p style={{ fontSize: '0.72rem', opacity: 0.5, marginTop: 6 }}>
            {relay.key === 'MEDLEY' ? 'Legs: Back → Breast → Fly → Free' : '4 × 50m Freestyle'}
            {cat.composition === '2M2F' ? ' · exactly 2 male + 2 female' : ''} · {eligible.length} eligible swimmers
          </p>
        </div>
        <button onClick={onClose} className="period-btn" style={{ fontSize: '0.7rem', opacity: 0.6 }}>✕ Close</button>
      </div>

      {teams.length === 0 && (
        <div style={{ padding: '1.5rem', textAlign: 'center', opacity: 0.6, fontSize: '0.85rem' }}>
          No team yet — not enough eligible swimmers with the required 50m times.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {teams.map((team) => {
          const valid = teamValidity(team, cat.composition);
          const total = team.legs.reduce((a, l) => a + (l.time || 0), 0);
          return (
            <div key={team.letter} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '1.25rem', background: team.locked ? 'rgba(6,182,212,0.04)' : 'transparent' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '1.1rem', fontWeight: 900 }}>Team {team.letter}</span>
                  <span style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--accent-cyan)', fontVariantNumeric: 'tabular-nums' }}>{formatTime(total)}</span>
                  <span style={{ fontSize: '0.6rem', fontWeight: 900, padding: '3px 8px', borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.05em',
                    background: team.letter === 'A' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                    color: team.letter === 'A' ? '#10b981' : '#f59e0b' }}>
                    {team.letter === 'A' ? 'Priority entry' : 'Lottery risk (B/C)'}
                  </span>
                  {!valid.ok && (
                    <span style={{ fontSize: '0.6rem', fontWeight: 900, padding: '3px 8px', borderRadius: '6px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', textTransform: 'uppercase' }}>⚠ {valid.msg}</span>
                  )}
                  {team.capForced && (
                    <span style={{ fontSize: '0.6rem', fontWeight: 900, padding: '3px 8px', borderRadius: '6px', background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }} title="A faster team exists but the per-swimmer cap forced this line-up">CAP-LIMITED</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="period-btn" style={{ fontSize: '0.65rem' }} onClick={() => onReoptimise(team.letter)}>↺ Re-optimise</button>
                  <button className="period-btn" style={{ fontSize: '0.65rem', color: team.locked ? 'var(--accent-cyan)' : undefined }} onClick={() => onToggleLock(team.letter)}>
                    {team.locked ? '🔒 Locked' : '🔓 Lock'}
                  </button>
                  <button className="period-btn" style={{ fontSize: '0.65rem', color: 'var(--accent-rose)' }} onClick={() => onRemoveTeam(team.letter)}>🗑</button>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '8px' }}>
                {team.legs.map((leg, li) => {
                  const opts = optionsForLeg(team, leg);
                  return (
                    <div key={li} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 90px', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 900, color: strokeColor[leg.stroke], textTransform: 'uppercase', letterSpacing: '0.05em' }}>{leg.stroke}</span>
                      <select
                        value={leg.swimmer?.id || ''}
                        onChange={(e) => onSwap(team.letter, li, e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', background: 'rgba(13,17,23,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '0.78rem', cursor: 'pointer' }}
                      >
                        <option value="">— pick swimmer —</option>
                        {opts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {p.age}y · {p.sex} · {formatTime(p.times[leg.stroke])}
                          </option>
                        ))}
                      </select>
                      <span style={{ fontSize: '0.82rem', fontWeight: 900, textAlign: 'right', fontVariantNumeric: 'tabular-nums', opacity: leg.time ? 1 : 0.3 }}>
                        {leg.time ? formatTime(leg.time) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginTop: '1.25rem', flexWrap: 'wrap' }}>
        <button className="period-btn" style={{ fontSize: '0.7rem' }} onClick={onAddTeam}>+ Add {String.fromCharCode(65 + teams.length)} team</button>
      </div>
    </div>
  );
}
