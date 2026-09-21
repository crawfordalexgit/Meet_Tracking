import { useMemo } from 'react';
import { Kpi, Figure } from './restructure/Figures';
import { hours } from '../lib/restructure-glossary';
import Term from './restructure/Term';

/**
 * The club as it stands today — squads, water, and whether the one covers the
 * other.
 *
 * Scored with exactly the same maths as any proposal, so "today" and "proposed"
 * are in the same units and can be read against each other. This is the number a
 * restructure has to beat, and quite often it is also the first time anyone has
 * seen it stated plainly.
 *
 * Everything here is read from the live club record. Nothing on this tab is a
 * model, and nothing on it can be edited.
 */
export default function CurrentStructure({ baseline }) {
  const byVenue = useMemo(() => {
    const map = {};
    (baseline?.sessions || []).filter(s => s.isActive).forEach(s => {
      const v = map[s.location] || (map[s.location] = { laneHours: 0, sessions: 0, places: 0, bodies: 0 });
      v.laneHours += s.laneHours;
      v.sessions += 1;
      v.places += s.places || 0;
      v.bodies += s.rosterCount;
    });
    return Object.entries(map)
      .map(([venue, v]) => ({
        venue, ...v,
        laneHours: +v.laneHours.toFixed(1),
        occupancyPct: v.places > 0 ? +(v.bodies / v.places * 100).toFixed(1) : 0
      }))
      .sort((a, b) => b.laneHours - a.laneHours);
  }, [baseline]);

  if (!baseline) return null;

  const u = baseline.utilisation;
  // Judged only against squads that are set a weekly target — a masters squad
  // with no target has nothing to fall short of.
  const judged = u.squadsWithTargetCount ?? u.squadCount;
  const noTarget = u.squadsWithoutTarget || [];
  const allMet = u.squadsMeetingRequirement === judged;

  return (
    <div>
      <div className="glass-card cs-verdict-card">
        <div className={`cs-verdict${allMet ? ' is-good' : ''}`}>
          <div className="cs-verdict-big">{u.squadsMeetingRequirement} of {judged}</div>
          <div className="cs-verdict-label">
            squads have enough water for the training they are set
            <span className="cs-verdict-sub">
              Across the week that is {u.swimmerSessionsDelivered} swimmer-sessions
              of water delivered against the {u.swimmerSessionsRequired} needed
            </span>
          </div>
        </div>
        <p className="cs-note">
          One swimmer training once is one <Term k="swimmerSession" />, so a squad of
          30 owing four sessions a week needs 120 of them. Either the water is there
          or it is not. Measured exactly as any proposed structure is measured, so the
          two can be read against each other.
          {noTarget.length > 0 && (
            <> {noTarget.join(' and ')} {noTarget.length === 1 ? 'is' : 'are'} left
            out of the count — no weekly target is set for {noTarget.length === 1 ? 'it' : 'them'},
            so there is nothing to fall short of.</>
          )}
        </p>
      </div>

      <div className="kpi-grid cs-kpis">
        <Kpi term="laneHour" label="Lane-hours a week" value={hours(u.totalLaneHours)} sub="water the club holds" />
        <Kpi term="placesBooked" label="Places booked" value={`${u.occupancyPct}%`}
          sub={`${u.rosterPlaces} booked into ${u.totalPlaces} places`} />
        <Kpi term="placesFilled" label="Places filled"
          value={u.actualOccupancyPct === null ? '—' : `${u.actualOccupancyPct}%`}
          sub={u.actualOccupancyPct === null
            ? 'no registers'
            : `${u.actualAttending} attending on average`}
          accent={u.actualOccupancyPct !== null && u.actualOccupancyPct < 60
            ? 'var(--accent-amber)' : 'var(--accent-emerald)'} />
        <Kpi label="Sessions a week" value={u.activeSessionCount}
          sub={u.emptySessionCount > 0 ? `${u.emptySessionCount} with nobody booked` : 'all in use'}
          accent={u.emptySessionCount > 0 ? 'var(--accent-amber)' : null} />
        <Kpi label="Squads" value={u.squadCount} sub={`${baseline.venues.length} venue${baseline.venues.length === 1 ? '' : 's'}`} />
      </div>

      <div className="cs-heading">Squads as they stand</div>
      <div className="glass-card cs-table-wrap">
        <table className="stats-table-glass">
          <thead>
            <tr>
              <th>Squad</th><th><Term k="exemptSwimmer">Swimmers</Term></th><th>Ages</th><th>Target</th>
              <th>Offered</th><th>Places / needed</th><th>Requirement</th>
              <th>Room for more</th><th>Lane-hours</th>
            </tr>
          </thead>
          <tbody>
            {baseline.squads.map(sq => (
              <tr key={sq.id}>
                <td style={{ fontWeight: 800 }}>{sq.name}</td>
                <td>
                  {sq.activeNonExemptCount}
                  {sq.memberCount !== sq.activeNonExemptCount && (
                    // "23 of 25" said nothing about what the other two were.
                    // Naming them costs a line and answers the question on the
                    // page instead of sending someone to the Exemptions panel.
                    <span className="cs-dim">
                      {' '}+{sq.memberCount - sq.activeNonExemptCount} exempt</span>
                  )}
                </td>
                <td>
                  {sq.minAge === null ? '—' : `${sq.minAge}–${sq.maxAge}`}
                  {sq.p10Age !== null
                    && (sq.p10Age !== sq.minAge || sq.p90Age !== sq.maxAge) && (
                    <span className="cs-dim" title="10th to 90th percentile — the band most of the squad sits in, ignoring one or two outliers">
                      {' '}({sq.p10Age}–{sq.p90Age})
                    </span>
                  )}
                </td>
                <td>
                  {sq.targetSessionsPerWeek || '—'}/wk
                  {sq.targetHoursPerWeek > 0 && <span className="cs-dim"> · {sq.targetHoursPerWeek}h</span>}
                </td>
                <td
                  style={{
                    color: sq.targetSessionsPerWeek > 0 && sq.currentSessionCount < sq.targetSessionsPerWeek
                      ? 'var(--accent-rose)' : 'inherit'
                  }}
                  title="The squad’s sessions as the timetable in Config lists them, matched on the session name."
                >
                  {sq.ownSessionCount}
                  {sq.currentWeeklyHours > 0 && (
                    <span className="cs-dim"> · {sq.currentWeeklyHours}h</span>
                  )}
                </td>
                <td>{sq.weeklyPlaces} / {sq.swimmerSessionsRequired}</td>
                <td
                  style={{
                    fontWeight: 800,
                    color: sq.targetSessionsPerWeek === 0 ? 'var(--text-secondary)'
                      : sq.requirementMet ? 'var(--accent-emerald)' : 'var(--accent-rose)'
                  }}
                  title={sq.requirementReason}
                >
                  {sq.targetSessionsPerWeek === 0 ? 'no target'
                    : sq.requirementMet ? 'MET' : `SHORT ${sq.placesShortfall || ''}`}
                </td>
                <td style={{
                  fontWeight: sq.roomForMore > 0 ? 900 : 600,
                  color: sq.roomForMore > 0 ? 'var(--accent-emerald)' : 'var(--text-secondary)'
                }}>
                  {sq.targetSessionsPerWeek === 0 ? '—'
                    : sq.roomForMore > 0 ? `+${sq.roomForMore}`
                      : sq.placesShortfall > 0 ? 'full' : '0'}
                </td>
                <td>{hours(sq.currentLaneHours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="cs-foot">
          Ages in brackets are the 10th–90th percentile — the band most of the squad
          actually sits in, ignoring one or two outliers. &quot;Offered&quot; is the squad’s sessions and pool hours straight off the timetable in
          Config, matched on the session name, against the &quot;Target&quot; each swimmer owes.
          &quot;Places&quot; is the water allocated to that squad across the week at its own lane density.
        </p>
      </div>

      {byVenue.length > 0 && (
        <>
          <div className="cs-heading">Water by venue</div>
          <div className="cs-venues">
            {byVenue.map(v => (
              <div key={v.venue} className="glass-card cs-venue">
                <div className="cs-venue-name">{v.venue}</div>
                <div className="cs-venue-figures">
                  <Figure term="laneHour" label="Lane-hours" value={hours(v.laneHours)} />
                  <Figure label="Sessions" value={v.sessions} />
                  <Figure term="placesBooked" label="Places booked" value={`${v.occupancyPct}%`}
                    bad={v.occupancyPct > 100} warn={v.occupancyPct < 60} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <style jsx>{`
        .cs-verdict-card { padding: 1.3rem 1.5rem; margin-bottom: 1.5rem; }
        .cs-verdict {
          display: flex; align-items: baseline; gap: 0.9rem;
          padding: 0.85rem 1rem; border-radius: 10px;
          background: rgba(var(--accent-amber-rgb), 0.1);
          border-left: 3px solid var(--accent-amber);
        }
        .cs-verdict.is-good {
          background: rgba(var(--accent-emerald-rgb), 0.1);
          border-left-color: var(--accent-emerald);
        }
        .cs-verdict-big { font-size: 1.9rem; font-weight: 950; white-space: nowrap; }
        .cs-verdict-label {
          font-size: 0.76rem; font-weight: 700; line-height: 1.4; color: var(--text-secondary);
        }
        .cs-verdict-sub { display: block; opacity: 0.85; font-weight: 600; margin-top: 3px; }
        .cs-note {
          font-size: 0.72rem; line-height: 1.6; color: var(--text-secondary);
          margin: 1rem 0 0; max-width: 76ch;
        }
        .cs-kpis { margin-bottom: 2rem; }
        .cs-heading {
          font-size: 0.64rem; font-weight: 900; letter-spacing: 0.14em;
          color: var(--text-secondary); margin: 2rem 0 0.9rem;
        }
        .cs-table-wrap { padding: 0.5rem; overflow-x: auto; }
        .cs-dim { color: var(--text-secondary); font-weight: 600; opacity: 0.8; }
        .cs-foot {
          font-size: 0.66rem; color: var(--text-secondary); line-height: 1.5;
          padding: 0.85rem 1rem 0.35rem; margin: 0;
        }
        .cs-venues {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem;
        }
        .cs-venue { padding: 1rem 1.15rem; }
        .cs-venue-name { font-size: 0.9rem; font-weight: 900; margin-bottom: 0.7rem; }
        .cs-venue-figures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.6rem; }
      `}</style>
    </div>
  );
}


