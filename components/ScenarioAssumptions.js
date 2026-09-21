import { DAY_NAMES_FULL } from '../lib/analytics-utils';
import { DEFAULT_POLICY, DEFAULT_WEIGHTS, DEFAULT_GROWTH } from '../lib/restructure-solver';
import { TERMS } from '../lib/restructure-glossary';
import Term from './restructure/Term';

// The six things the fit score is a blend of. Named from the glossary so a
// slider here and a column on the comparison cannot end up calling the same
// measure two different things — which is exactly what "utilisation" did.
const WEIGHT_TERMS = {
  ltad: 'volumeFit',
  utilisation: 'waterUsed',
  served: 'swimmersCovered',
  coachCover: 'coachHour',
  timetableQuality: 'timetableQuality',
  continuity: 'sessionsThatStayPut'
};

const WEIGHT_LABELS = Object.fromEntries(
  Object.entries(WEIGHT_TERMS).map(([k, term]) => [k, TERMS[term].term])
);

/**
 * Every assumption the solver runs on, in one place and editable.
 *
 * The defaults are a starting point, not a policy. Putting the youth curfew
 * times, the travel window and the scoring weights on screen is what lets a head
 * coach argue with the answer rather than having to take it on trust.
 */
export default function ScenarioAssumptions({ policy = {}, weights = {}, growth = {}, onChange }) {
  const p = { ...DEFAULT_POLICY, ...policy };
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  const g = { ...DEFAULT_GROWTH, ...growth };

  const setPolicy = patch => onChange({ policy: { ...p, ...patch } });
  const setWeight = (key, value) => onChange({ weights: { ...w, [key]: Number(value) } });
  const setGrowth = patch => onChange({ growth: { ...g, ...patch } });

  const setWindow = (idx, field, value) => setPolicy({
    timeWindows: p.timeWindows.map((row, i) => (i === idx ? { ...row, [field]: value } : row))
  });

  const toggleSchoolNight = day => setPolicy({
    schoolNights: p.schoolNights.includes(day)
      ? p.schoolNights.filter(d => d !== day)
      : p.schoolNights.concat([day])
  });

  return (
    <div className="as-wrap">
      <div className="glass-card as-card">
        <div className="as-title">Age time guide — session times for younger swimmers</div>
        <p className="as-note">
          These are guides, not walls. A squad scheduled past its guide is still placed —
          it is flagged on the timetable and scored down in proportion to the minutes,
          so you can see what a compromise costs instead of losing the option.
          A squad is judged by its <strong>youngest</strong> member.
        </p>

        <div className="as-days">
          <span className="as-days-label">School nights</span>
          {DAY_NAMES_FULL.map(d => (
            <button
              key={d} type="button"
              className={`as-day${p.schoolNights.includes(d) ? ' is-on' : ''}`}
              onClick={() => toggleSchoolNight(d)}
            >{d.slice(0, 3)}</button>
          ))}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="stats-table-glass as-table">
            <thead>
              <tr>
                <th>Up to age</th>
                <th>Finish by (school night)</th>
                <th>Finish by (other)</th>
                <th>No earlier than</th>
                <th>Mornings discouraged</th>
              </tr>
            </thead>
            <tbody>
              {p.timeWindows.map((row, i) => (
                <tr key={row.maxAge}>
                  <td style={{ fontWeight: 800 }}>{row.maxAge === 99 ? 'Any' : row.maxAge}</td>
                  <td><input type="time" value={row.schoolNightEnd}
                    onChange={e => setWindow(i, 'schoolNightEnd', e.target.value)} /></td>
                  <td><input type="time" value={row.otherEnd}
                    onChange={e => setWindow(i, 'otherEnd', e.target.value)} /></td>
                  <td><input type="time" value={row.earliestStart}
                    onChange={e => setWindow(i, 'earliestStart', e.target.value)} /></td>
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={!!row.morningsDiscouraged}
                      onChange={e => setWindow(i, 'morningsDiscouraged', e.target.checked)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <label className="as-field as-field-inline">
          <span>Penalty per minute outside the guide</span>
          <input
            type="number" min="0" max="10" step="0.1" value={p.curfewPenaltyPerMinute}
            onChange={e => setPolicy({ curfewPenaltyPerMinute: Number(e.target.value) })}
          />
        </label>
      </div>

      <div className="glass-card as-card">
        <div className="as-title">HARD RULES</div>
        <p className="as-note">
          Unlike the time guides, these cannot be traded away — the solver will refuse
          an arrangement that breaks them.
        </p>

        <label className="as-field as-field-inline">
          <span>Minutes needed between venues</span>
          <input
            type="number" min="0" max="180" step="5" value={p.venueTransitMinutes}
            onChange={e => setPolicy({ venueTransitMinutes: Number(e.target.value) })}
          />
        </label>

        <label className="as-field as-field-inline">
          <span>Preferred rest between a squad&apos;s sessions (hours)</span>
          <input
            type="number" min="0" max="72" step="1" value={p.minRestHoursBetweenSessions}
            onChange={e => setPolicy({ minRestHoursBetweenSessions: Number(e.target.value) })}
          />
        </label>

        <label className="as-check">
          <input
            type="checkbox" checked={!!p.requireCoachCover}
            onChange={e => setPolicy({ requireCoachCover: e.target.checked })}
          />
          <span>
            Refuse a plan with any uncovered session
            <em> — off by default, so gaps are reported rather than hiding the timetable</em>
          </span>
        </label>
      </div>

      <div className="glass-card as-card">
        <div className="as-title">COACHING RATIOS</div>
        <label className="as-field as-field-inline">
          <span>Lanes one coach can take</span>
          <input type="number" min="1" max="10" value={p.maxLanesPerCoach}
            onChange={e => setPolicy({ maxLanesPerCoach: Number(e.target.value) })} />
        </label>
        <label className="as-field as-field-inline">
          <span>Minimum coaches per squad session</span>
          <input type="number" min="1" max="6" value={p.minCoachesPerSquadSession}
            onChange={e => setPolicy({ minCoachesPerSquadSession: Number(e.target.value) })} />
        </label>
        <label className="as-field as-field-inline">
          <span>Minimum for a squad with under-14s</span>
          <input type="number" min="1" max="6" value={p.minCoachesPerSquadSessionUnder14}
            onChange={e => setPolicy({ minCoachesPerSquadSessionUnder14: Number(e.target.value) })} />
        </label>
      </div>

      <div className="glass-card as-card">
        <div className="as-title">DEMAND</div>
        <label className="as-field as-field-inline">
          <span>Expected new swimmers</span>
          <input type="number" min="0" max="500" value={g.expectedNewSwimmers}
            onChange={e => setGrowth({ expectedNewSwimmers: Number(e.target.value) })} />
        </label>
        <label className="as-field as-field-inline">
          <span>Expected attrition (%)</span>
          <input type="number" min="0" max="100" value={g.attritionPct}
            onChange={e => setGrowth({ attritionPct: Number(e.target.value) })} />
        </label>
        <label className="as-field as-field-inline">
          <span>Assumed turn-up rate</span>
          <input
            type="number" min="0.1" max="1" step="0.05" value={p.showRate}
            onChange={e => setPolicy({ showRate: Number(e.target.value) })}
          />
        </label>
        <p className="as-note">
          A turnout rate of 1.0 plans for the whole roster in the water at once, which is
          how you size a squad honestly. Lowering it plans for typical attendance instead —
          more efficient on paper, and it will bite on the week everyone turns up.
        </p>
      </div>

      <div className="glass-card as-card">
        <div className="as-title">WHAT THE SCORE REWARDS</div>
        <p className="as-note">
          These weights only decide which plan the solver prefers when it has a choice.
          Every underlying figure is reported separately, whatever you set here.
        </p>
        {Object.keys(WEIGHT_LABELS).map(key => (
          <div key={key} className="as-slider">
            <span className="as-slider-label">
              <Term k={WEIGHT_TERMS[key]}>{WEIGHT_LABELS[key]}</Term>
            </span>
            <input
              type="range" min="0" max="50" step="5" value={w[key] ?? 0}
              onChange={e => setWeight(key, e.target.value)}
            />
            <span className="as-slider-value">{w[key] ?? 0}</span>
          </div>
        ))}
      </div>

      <div className="glass-card as-card">
        <div className="as-title">Training volume guide</div>
        <label className="as-check">
          <input
            type="radio" name="ltadTable" checked={p.ltadTable !== 'benchmarks'}
            onChange={() => setPolicy({ ltadTable: 'unified' })}
          />
          <span>
            Unified (default)
            <em> — six bands, matches the club&apos;s own reference document</em>
          </span>
        </label>
        <label className="as-check">
          <input
            type="radio" name="ltadTable" checked={p.ltadTable === 'benchmarks'}
            onChange={() => setPolicy({ ltadTable: 'benchmarks' })}
          />
          <span>
            Swim England benchmarks
            <em> — five broader bands, the table used elsewhere in the app for individual swimmers</em>
          </span>
        </label>
        <p className="as-note">
          Both tables are aspirational. The club&apos;s current targets sit below either one
          by design, so read volume fit as a gap in hours rather than a pass or fail.
        </p>
      </div>

      <style jsx>{`
        .as-wrap {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 1.25rem;
          align-items: start;
        }
        .as-card { padding: 1.2rem 1.35rem; }
        .as-title {
          font-size: 0.62rem; font-weight: 900; letter-spacing: 0.13em;
          color: var(--text-secondary); margin-bottom: 0.75rem;
        }
        .as-note {
          font-size: 0.7rem; line-height: 1.55; color: var(--text-secondary);
          margin: 0 0 1rem; padding-left: 0.65rem; border-left: 2px solid var(--glass-border);
        }
        .as-days { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-bottom: 1rem; }
        .as-days-label {
          font-size: 0.58rem; font-weight: 900; letter-spacing: 0.09em;
          color: var(--text-secondary); margin-right: 0.4rem;
        }
        .as-day {
          padding: 5px 9px; border-radius: 7px; font-size: 0.66rem; font-weight: 800;
          border: 1px solid var(--glass-border); background: transparent;
          color: var(--text-secondary); cursor: pointer;
        }
        .as-day.is-on { background: var(--accent-cyan); color: #000; border-color: var(--accent-cyan); }
        .as-table :global(input) {
          padding: 4px 6px; border-radius: 5px; width: 100%;
          border: 1px solid var(--glass-border); background: var(--glass-bg);
          color: inherit; font-size: 0.74rem; font-weight: 700;
        }
        .as-field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.75rem; }
        .as-field span { font-size: 0.68rem; font-weight: 700; color: var(--text-secondary); }
        .as-field :global(input) {
          padding: 6px 9px; border-radius: 7px;
          border: 1px solid var(--glass-border); background: var(--glass-bg);
          color: inherit; font-weight: 700; font-size: 0.82rem;
        }
        .as-field-inline {
          flex-direction: row; align-items: center; justify-content: space-between; gap: 0.8rem;
        }
        .as-field-inline :global(input) { width: 96px; flex: none; }
        .as-check {
          display: flex; gap: 0.55rem; align-items: flex-start; cursor: pointer;
          margin-bottom: 0.7rem; font-size: 0.74rem; font-weight: 600; line-height: 1.45;
        }
        .as-check em {
          display: block; font-style: normal; font-weight: 500;
          font-size: 0.66rem; color: var(--text-secondary);
        }
        .as-slider {
          display: grid; grid-template-columns: 1fr 110px 28px;
          gap: 0.6rem; align-items: center; margin-bottom: 0.5rem;
        }
        .as-slider-label { font-size: 0.72rem; font-weight: 700; }
        .as-slider-value {
          font-size: 0.74rem; font-weight: 900; text-align: right; color: var(--accent-cyan);
        }
      `}</style>
    </div>
  );
}
