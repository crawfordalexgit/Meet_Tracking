import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import toast from 'react-hot-toast';
import { authedFetch } from '../../lib/api-client';
import Term from './Term';
import { ATTENDANCE_WINDOWS, attendanceWindowLabel } from '../../lib/restructure-glossary';

/**
 * The club as it stands, with every figure's working shown.
 *
 * "Gold Development has room for 5 more" is not a claim a committee should have
 * to take on trust. Each squad therefore carries the arithmetic that produced
 * it — swimmers, sessions each is set, places needed, places available, and how
 * many to a lane — so a reader can check it on the back of an envelope and
 * argue with an input rather than with the tool.
 *
 * The written briefing is generated from exactly these figures and is clearly
 * labelled as written rather than calculated. Everything here reads perfectly
 * well with it empty.
 */
export default function AsIsBriefing({ report, onNarrative, narrative, writing, days, onDaysChange, termOnly, onTermOnlyChange, loading }) {
  const [open, setOpen] = useState(false);
  if (!report) return null;

  const { window: win, water, attendance, squads, headline, caveats } = report;

  return (
    <div className="ab">
      <div className="glass-card ab-card">
        <div className="ab-top">
          <div className="ab-kicker">The club as it stands — calculated, not written</div>
          {onDaysChange && (
            <div className="ab-window">
              <span className="ab-window-label">Attendance over the last</span>
              {ATTENDANCE_WINDOWS.map(d => (
                <button key={d} type="button"
                  className={`ab-win${d === days ? ' is-on' : ''}`}
                  onClick={() => onDaysChange(d)}
                  disabled={loading}
                  aria-pressed={d === days}>
                  {attendanceWindowLabel(d)}
                </button>
              ))}
            </div>
          )}
        </div>

        {onTermOnlyChange && (
          <div className="ab-basis-row">
            <button type="button"
              className={`ab-win${termOnly ? ' is-on' : ''}`}
              onClick={() => onTermOnlyChange(true)}
              disabled={loading} aria-pressed={!!termOnly}>
              Term weeks only
            </button>
            <button type="button"
              className={`ab-win${termOnly ? '' : ' is-on'}`}
              onClick={() => onTermOnlyChange(false)}
              disabled={loading} aria-pressed={!termOnly}>
              Including holidays
            </button>
            {win.termRatePct !== null && win.holidayRatePct !== null && (
              <span className="ab-basis-note">
                {win.termRatePct}% of those booked turn up in term, {win.holidayRatePct}% in the holidays
                {win.registersSetAside > 0
                  ? ` — ${win.registersSetAside} holiday marks set aside, not deleted`
                  : ''}.
              </span>
            )}
          </div>
        )}

        {/* What the figures rest on, in the reader's line of sight rather than
            in a footnote — this is the sentence that answers "over what?" */}
        {win.basis && <p className="ab-basis">{win.basis}</p>}
        <p className="ab-lead">
          {headline.squadsWithFullWeek} of {headline.squadsJudged} squads have enough water for the
          training they are set, and across the week there is room for {headline.roomForMore} more
          swimmers. Of the {attendance.placesTotal} places the club books,{' '}
          {attendance.placesBooked} are taken and {attendance.attending} are filled —{' '}
          <strong>{attendance.filledPct}%</strong>, measured over{' '}
          {win.termOnly && win.termWeeks ? `${win.termWeeks} term weeks` : `${win.attendanceWeeks} weeks`}{' '}
          of registers.
        </p>

        <div className="ab-figures">
          <Fig term="laneHour" label="Lane-hours a week" value={water.laneHoursPerWeek}
            sub={`${water.usableBySquads} usable by squads, ${water.reserved} reserved`} />
          <Fig term="placesBooked" label="Places booked" value={`${attendance.bookedPct}%`}
            sub={`${attendance.placesBooked} of ${attendance.placesTotal}`} />
          <Fig term="placesFilled" label="Places filled" value={`${attendance.filledPct}%`}
            sub={`${attendance.attending} in the water`} accent="var(--accent-amber)" />
          <Fig term="turnUpRate" label="Turn-up rate" value={attendance.turnUpRate}
            sub={`over ${win.attendanceWeeks} weeks`} />
          <Fig label="Sessions a week" value={water.activeSessions}
            sub={`${water.venues} venues${water.emptySessions ? `, ${water.emptySessions} with nobody booked` : ''}`} />
        </div>

        {water.venuesOverBooked > 0 && (
          <p className="ab-warn">
            {water.venuesOverBooked} venue-{water.venuesOverBooked === 1 ? 'day books' : 'days book'} more
            lanes at once than the pool holds. See the caveats below.
          </p>
        )}
      </div>

      <div className="ab-heading">Squad by squad, with the working</div>
      <div className="ab-squads">
        {squads.map(s => (
          <div key={s.name} className={`glass-card ab-squad${s.requirementMet ? '' : ' is-short'}`}>
            <div className="ab-squad-top">
              <strong>{s.name}</strong>
              <span className={`ab-tag${s.requirementMet ? ' is-ok' : ''}`}>
                {s.requirementMet
                  ? (s.roomForMore > 0 ? `room for ${s.roomForMore} more` : 'full')
                  : `short ${s.placesShortfall} places`}
              </span>
            </div>
            <div className="ab-squad-meta">
              {s.swimmers} swimmers{s.exempt > 0 && ` (+${s.exempt} exempt)`}
              {s.ageRange && ` · ages ${s.ageRange}`}
              {' · '}{s.targetSessionsPerWeek}/wk, {s.targetHoursPerWeek || '—'}h set
              {' · '}{s.swimmersPerLane} to a lane
              {' · '}{s.hoursOffered}h offered
            </div>
            <p className="ab-working">{s.working}</p>
            {s.attendanceNote && <p className="ab-attendance">{s.attendanceNote}</p>}
          </div>
        ))}
      </div>

      {attendance.quietest.length > 0 && (
        <>
          <div className="ab-heading">Where the water is going spare</div>
          <div className="glass-card ab-quiet">
            <table className="stats-table-glass">
              <thead>
                <tr>
                  <th>Session</th><th>Day</th><th>Places</th>
                  <th><Term k="attending">Attending</Term></th>
                  <th><Term k="placesFilled">Filled</Term></th>
                </tr>
              </thead>
              <tbody>
                {attendance.quietest.map(q => (
                  <tr key={`${q.name}-${q.day}`}>
                    <td style={{ fontWeight: 700 }}>{q.name}</td>
                    <td>{q.day}{q.time ? ` ${q.time}` : ''}</td>
                    <td>{q.places}</td>
                    <td>{q.attending}</td>
                    <td style={{ fontWeight: 900, color: 'var(--accent-rose)' }}>{q.filledPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="ab-foot">
              Averaged over {win.attendanceWeeks} weeks of registers.
              {win.sessionsWithoutRegister > 0
                && ` ${win.sessionsWithoutRegister} session${win.sessionsWithoutRegister === 1 ? ' has' : 's have'} no register at all and cannot appear here.`}
            </p>
          </div>
        </>
      )}

      <div className="ab-heading">Written briefing — drafted by AI from the figures above</div>
      <div className="glass-card ab-write">
        <button type="button" className="btn-premium-intel"
          onClick={onNarrative} disabled={writing}>
          {writing ? 'Writing…' : narrative ? 'Write it again' : 'Write the briefing'}
        </button>
        {narrative
          ? <div className="ab-md"><ReactMarkdown>{narrative}</ReactMarkdown></div>
          : <p className="ab-foot">
              Turns the figures above into something that can go in a committee pack.
              It quotes them and works nothing out for itself, so it cannot disagree
              with the tables.
            </p>}
      </div>

      {caveats.length > 0 && (
        <div className="ab-caveats">
          <button type="button" className="ab-toggle" onClick={() => setOpen(o => !o)}>
            {open ? 'Hide' : 'Show'} what this rests on ({caveats.length})
          </button>
          {open && (
            <ul className="ab-list">
              {caveats.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          )}
        </div>
      )}

      <style jsx>{`
        .ab-card { padding: 1.4rem 1.6rem; margin-bottom: 1.6rem; }
        .ab-top {
          display: flex; justify-content: space-between; align-items: flex-start;
          gap: 1rem; flex-wrap: wrap;
        }
        .ab-window { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
        .ab-window-label {
          font-size: 0.58rem; font-weight: 900; letter-spacing: 0.09em;
          text-transform: uppercase; color: var(--text-secondary); margin-right: 3px;
        }
        .ab-win {
          padding: 4px 10px; border-radius: 7px; cursor: pointer;
          font-size: 0.66rem; font-weight: 800;
          border: 1px solid var(--glass-border); background: transparent;
          color: var(--text-secondary);
        }
        .ab-win.is-on {
          border-color: var(--accent-cyan); color: var(--accent-cyan);
          background: rgba(var(--accent-cyan-rgb), 0.1);
        }
        .ab-win:disabled { opacity: 0.45; cursor: not-allowed; }
        .ab-basis-row {
          display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
          margin: 0 0 0.6rem;
        }
        .ab-basis-note {
          font-size: 0.72rem; color: var(--text-secondary); margin-left: 4px;
        }
        .ab-basis {
          font-size: 0.74rem; line-height: 1.55; color: var(--text-secondary);
          margin: 0 0 1.1rem; max-width: 92ch;
          padding-left: 0.7rem; border-left: 2px solid var(--glass-border);
        }
        .ab-kicker {
          font-size: 0.58rem; font-weight: 900; letter-spacing: 0.12em;
          text-transform: uppercase; color: var(--text-secondary); margin-bottom: 0.7rem;
        }
        .ab-lead {
          font-size: 1rem; line-height: 1.6; margin: 0 0 1.3rem; max-width: 82ch; font-weight: 600;
        }
        .ab-figures {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 1.1rem;
        }
        .ab-warn {
          font-size: 0.78rem; line-height: 1.55; color: var(--accent-amber);
          margin: 1.1rem 0 0; padding-left: 0.7rem; border-left: 2px solid var(--accent-amber);
        }
        .ab-heading {
          font-size: 0.6rem; font-weight: 900; letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--text-secondary); margin: 1.8rem 0 0.8rem;
        }
        .ab-squads {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 1rem;
        }
        .ab-squad { padding: 1rem 1.2rem; }
        .ab-squad.is-short { border-color: var(--accent-amber); }
        .ab-squad-top {
          display: flex; justify-content: space-between; align-items: baseline;
          gap: 0.6rem; font-size: 0.9rem;
        }
        .ab-tag {
          font-size: 0.6rem; font-weight: 900; padding: 2px 7px; border-radius: 5px;
          background: rgba(var(--accent-amber-rgb), 0.18); color: var(--accent-amber);
          white-space: nowrap;
        }
        .ab-tag.is-ok {
          background: rgba(var(--accent-emerald-rgb), 0.16); color: var(--accent-emerald);
        }
        .ab-squad-meta {
          font-size: 0.66rem; color: var(--text-secondary); margin: 0.35rem 0 0.6rem;
          line-height: 1.5;
        }
        .ab-working { font-size: 0.78rem; line-height: 1.65; margin: 0; }
        .ab-attendance {
          font-size: 0.74rem; line-height: 1.6; margin: 0.6rem 0 0;
          color: var(--accent-cyan); font-weight: 600;
        }
        .ab-quiet { padding: 0.5rem; overflow-x: auto; }
        .ab-foot {
          font-size: 0.68rem; line-height: 1.6; color: var(--text-secondary);
          margin: 0.8rem 0.7rem 0.4rem; max-width: 84ch;
        }
        .ab-write { padding: 1.2rem 1.4rem; }
        .ab-md { margin-top: 1.2rem; font-size: 0.84rem; line-height: 1.7; }
        .ab-md :global(h2) {
          font-size: 0.95rem; font-weight: 900; margin: 1.3rem 0 0.5rem; color: var(--accent-cyan);
        }
        .ab-md :global(p) { margin: 0 0 0.8rem; }
        .ab-md :global(ul) { margin: 0 0 0.8rem; padding-left: 1.2rem; }
        .ab-caveats { margin-top: 1.6rem; }
        .ab-toggle {
          background: transparent; border: 1px solid var(--glass-border); border-radius: 8px;
          color: var(--text-secondary); cursor: pointer; padding: 6px 13px;
          font-size: 0.7rem; font-weight: 800;
        }
        .ab-list {
          margin: 0.9rem 0 0; padding-left: 1.2rem; font-size: 0.76rem; line-height: 1.7;
          color: var(--text-secondary); max-width: 96ch;
        }
      `}</style>
    </div>
  );
}

function Fig({ term, label, value, sub, accent }) {
  return (
    <div className="fig">
      <div className="fig-label">{term ? <Term k={term}>{label}</Term> : label}</div>
      <div className="fig-value" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="fig-sub">{sub}</div>}
      <style jsx>{`
        .fig-label {
          font-size: 0.58rem; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase;
          color: var(--text-secondary); margin-bottom: 0.3rem;
        }
        .fig-value { font-size: 1.5rem; font-weight: 950; line-height: 1.1; }
        .fig-sub {
          font-size: 0.64rem; color: var(--text-secondary); margin-top: 0.25rem; line-height: 1.4;
        }
      `}</style>
    </div>
  );
}
