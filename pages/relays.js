import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import RelayBuilderDrawer from '../components/RelayBuilderDrawer';
import { supabase } from '../lib/supabase';
import { authedFetch } from '../lib/api-client';
import { fetchAllRows } from '../lib/paginate';
import {
  MEET, AGE_BANDS, CATEGORIES, RELAYS, relayEvents, formatTime, teamName,
} from '../lib/relays/kent-relays-config';
import {
  buildSwimmerPool, eligiblePool, bestTeam,
} from '../lib/relays/relay-optimizer';

const CLUB_NAME = 'Tonbridge';
const CLUB_CODE = ''; // Swim England club code — left blank for the secretary to confirm on the form
const EVENTS = relayEvents();
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

// ─── Lineup building ──────────────────────────────────────────────────────────

/** Build every team for the meet, preserving any locked teams and their swimmers. */
function buildAll(pool, { depth, cap, allowAnyGender }, lockedByEvent = {}) {
  const usage = {};
  const out = {};
  for (const ev of EVENTS) {
    const locked = (lockedByEvent[ev.key] || []).filter((t) => t.locked);
    out[ev.key] = { teams: [...locked] };
    for (const t of locked) for (const l of t.legs) if (l.swimmer) usage[l.swimmer.id] = (usage[l.swimmer.id] || 0) + 1;
  }
  const letters = LETTERS.slice(0, Math.max(1, depth));
  for (const letter of letters) {
    for (const ev of EVENTS) {
      const slot = out[ev.key];
      if (slot.teams.some((t) => t.letter === letter)) continue;
      const usedThisEvent = new Set(slot.teams.flatMap((t) => t.legs.map((l) => l.swimmer?.id)));
      const { pool: elig } = eligiblePool(pool, ev, { allowAnyGender });
      const avail = elig.filter((p) => !usedThisEvent.has(p.id) && (usage[p.id] || 0) < cap);
      const team = bestTeam(avail, ev);
      if (!team) continue;
      for (const l of team.legs) usage[l.swimmer.id] = (usage[l.swimmer.id] || 0) + 1;
      slot.teams.push({ letter, legs: team.legs, locked: false, capForced: false });
    }
  }
  // Flag cap-forced A teams (a faster team exists ignoring the cap).
  for (const ev of EVENTS) {
    const a = out[ev.key].teams.find((t) => t.letter === 'A' && !t.locked);
    if (!a) continue;
    const { pool: elig } = eligiblePool(pool, ev, { allowAnyGender });
    const uncapped = bestTeam(elig, ev);
    const aTotal = a.legs.reduce((s, l) => s + (l.time || 0), 0);
    if (uncapped && aTotal > uncapped.total + 0.01) a.capForced = true;
  }
  for (const ev of EVENTS) out[ev.key].teams.sort((x, y) => x.letter.localeCompare(y.letter));
  return out;
}

const teamTotal = (t) => t.legs.reduce((s, l) => s + (l.time || 0), 0);
const teamComplete = (t) => t.legs.length === 4 && t.legs.every((l) => l.swimmer);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RelaysPage({ session: propSession }) {
  const router = useRouter();
  const [session, setSession] = useState(propSession || null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [rawSwimmers, setRawSwimmers] = useState([]);
  const [rawPbs, setRawPbs] = useState(null);       // { [id]: pbRows } — null until loaded
  const [savedRaw, setSavedRaw] = useState(null);   // saved lineups (unresolved swimmer ids)
  const [lineups, setLineups] = useState({});
  const [selected, setSelected] = useState(null);   // event key
  const [notice, setNotice] = useState('');
  const [persisted, setPersisted] = useState(true);

  // settings
  const [depth, setDepth] = useState(1);
  const [cap, setCap] = useState(0);                // 0 = no cap
  const [allowAnyGender, setAllowAnyGender] = useState(false);
  const [useLcFallback, setUseLcFallback] = useState(true);

  // availability — swimmer ids marked "not available" are excluded everywhere
  const [unavailable, setUnavailable] = useState(() => new Set());
  const [showAvail, setShowAvail] = useState(false);
  const [availSearch, setAvailSearch] = useState('');

  const capValue = cap === 0 ? Infinity : cap;
  const LS_KEY = `relay-unavailable-${MEET.code}`;

  // Pool is derived: short-course 50 PBs, falling back to converted long-course
  // times (flagged) only when no SCM time exists — so toggling the fallback
  // rebuilds without re-fetching.
  const pool = useMemo(
    () => (rawPbs ? buildSwimmerPool(rawSwimmers, rawPbs, MEET.ageYear, { lcFallback: useLcFallback }) : []),
    [rawSwimmers, rawPbs, useLcFallback]
  );

  // Roster minus anyone marked unavailable — used for all optimisation/selection.
  const availablePool = useMemo(() => pool.filter((p) => !unavailable.has(p.id)), [pool, unavailable]);

  // Persist availability locally (per browser) so it survives reloads without a migration.
  useEffect(() => {
    try { const raw = localStorage.getItem(LS_KEY); if (raw) setUnavailable(new Set(JSON.parse(raw))); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify([...unavailable])); } catch { /* ignore */ }
  }, [unavailable]);

  const setAvailable = useCallback((id, available) => {
    setUnavailable((prev) => { const n = new Set(prev); if (available) n.delete(id); else n.add(id); return n; });
  }, []);

  const settingsRef = useRef({});
  settingsRef.current = { depth, capValue, allowAnyGender };
  const builtOnce = useRef(false);

  useEffect(() => { if (propSession) setSession(propSession); }, [propSession]);
  useEffect(() => {
    if (propSession) return;
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!s) { router.push('/login'); return; }
      setSession(s);
    });
  }, [router, propSession]);

  // Load roster + both-course 50 PBs + any saved lineups.
  useEffect(() => {
    if (!session) return;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
      const [swData, pbs] = await Promise.all([
        fetchAllRows(supabase, 'swimmers', { select: 'id, full_name, known_as, year_of_birth, gender' }),
        fetchAllRows(supabase, 'swimmer_pbs', { select: 'swimmer_id,event,course,time_seconds', filter: (q) => q.in('course', ['S', 'L']) }),
      ]);
      const bySwimmer = {};
      for (const pb of pbs || []) (bySwimmer[pb.swimmer_id] ||= []).push(pb);
      let saved = {};
      try {
        const res = await authedFetch(`/api/relay-lineups?meet_code=${MEET.code}`);
        const json = await res.json();
        setPersisted(json.persisted !== false);
        for (const row of json.lineups || []) (saved[row.event_key] ||= []).push({ letter: row.team_letter, legs: row.legs || [], locked: !!row.is_locked });
      } catch { /* persistence optional */ }
      builtOnce.current = false;
      setSavedRaw(saved);
      setRawSwimmers(swData || []);
      setRawPbs(bySwimmer);
      } catch (err) {
        // A rejected Promise.all used to skip setLoading(false), hanging the
        // page on "Loading roster and short-course times…" indefinitely.
        console.error('Relay roster load failed:', err);
        setLoadError(err.message || 'Could not load the relay roster.');
      } finally {
        setLoading(false);
      }
    })();
  }, [session]);

  // Build lineups whenever the pool changes (initial load, or LC-fallback toggle).
  // Locked teams are preserved; saved lineups are overlaid on the first build.
  useEffect(() => {
    if (!rawPbs) return;
    setLineups((prev) => {
      const lockedByEvent = {};
      for (const [k, slot] of Object.entries(prev || {})) { const L = slot.teams.filter((t) => t.locked); if (L.length) lockedByEvent[k] = L; }
      const { depth: d, capValue: c, allowAnyGender: g } = settingsRef.current;
      const built = buildAll(availablePool, { depth: d, cap: c, allowAnyGender: g }, lockedByEvent);
      if (!builtOnce.current && savedRaw && Object.keys(savedRaw).length) {
        const byId = new Map(pool.map((p) => [p.id, p]));
        for (const key of Object.keys(savedRaw)) {
          built[key] = {
            teams: savedRaw[key].map((t) => ({
              letter: t.letter, locked: t.locked, capForced: false,
              legs: (t.legs || []).map((l) => ({ stroke: l.stroke, swimmer: byId.get(l.swimmer_id) || null, time: byId.get(l.swimmer_id)?.times?.[l.stroke] ?? l.time_seconds ?? null })),
            })).sort((a, b) => a.letter.localeCompare(b.letter)),
          };
        }
      }
      return built;
    });
    builtOnce.current = true;
  }, [pool, savedRaw]);

  const eligibleByEvent = useMemo(() => {
    const m = {};
    for (const ev of EVENTS) m[ev.key] = eligiblePool(availablePool, ev, { allowAnyGender }).pool;
    return m;
  }, [availablePool, allowAnyGender]);

  const benchedByEvent = useMemo(() => {
    const m = {};
    for (const ev of EVENTS) m[ev.key] = eligiblePool(availablePool, ev, { allowAnyGender }).benched;
    return m;
  }, [availablePool, allowAnyGender]);

  const usage = useMemo(() => {
    const u = {};
    for (const slot of Object.values(lineups)) for (const t of slot.teams) for (const l of t.legs) if (l.swimmer) u[l.swimmer.id] = (u[l.swimmer.id] || 0) + 1;
    return u;
  }, [lineups]);

  const stats = useMemo(() => {
    let teams = 0, complete = 0, conflicts = 0;
    const ids = new Set();
    let shortfall = 0;
    for (const ev of EVENTS) {
      const slot = lineups[ev.key];
      if (!slot) continue;
      teams += slot.teams.length;
      for (const t of slot.teams) {
        if (teamComplete(t)) complete += 1;
        if (t.legs.some((l) => l.swimmer && unavailable.has(l.swimmer.id))) conflicts += 1;
        for (const l of t.legs) if (l.swimmer) ids.add(l.swimmer.id);
      }
      if ((eligibleByEvent[ev.key]?.length || 0) < 4) shortfall += 1;
    }
    return { teams, complete, swimmers: ids.size, fee: teams * MEET.feePerTeam, shortfall, conflicts };
  }, [lineups, eligibleByEvent, unavailable]);

  const closesIn = useMemo(() => {
    const d = Math.ceil((new Date(MEET.closes) - new Date()) / 86400000);
    return d;
  }, []);

  // ── Mutations ───────────────────────────────────────────────────────────────

  const patchEvent = useCallback((key, updater) => {
    setLineups((prev) => ({ ...prev, [key]: { teams: updater(prev[key]?.teams || []) } }));
  }, []);

  const handleSwap = useCallback((key, letter, legIndex, swimmerId) => {
    const swimmer = pool.find((p) => p.id === swimmerId) || null;
    patchEvent(key, (teams) => teams.map((t) => {
      if (t.letter !== letter) return t;
      const legs = t.legs.map((l, i) => i === legIndex
        ? { ...l, swimmer, time: swimmer ? swimmer.times[l.stroke] : null }
        : l);
      return { ...t, legs, capForced: false };
    }));
  }, [pool, patchEvent]);

  const handleToggleLock = useCallback((key, letter) => {
    patchEvent(key, (teams) => teams.map((t) => t.letter === letter ? { ...t, locked: !t.locked } : t));
    // Persist the team on lock (best-effort commit point).
    const slot = lineups[key];
    const t = slot?.teams.find((x) => x.letter === letter);
    if (t) saveTeam(key, { ...t, locked: !t.locked });
  }, [lineups, patchEvent]);

  const handleRemoveTeam = useCallback((key, letter) => {
    patchEvent(key, (teams) => teams.filter((t) => t.letter !== letter));
    authedFetch(`/api/relay-lineups?meet_code=${MEET.code}&event_key=${key}&team_letter=${letter}`, { method: 'DELETE' }).catch(() => {});
  }, [patchEvent]);

  const handleReoptimise = useCallback((key, letter) => {
    const ev = EVENTS.find((e) => e.key === key);
    patchEvent(key, (teams) => {
      const others = teams.filter((t) => t.letter !== letter);
      const usedElsewhere = new Set(others.flatMap((t) => t.legs.map((l) => l.swimmer?.id)));
      // usage excluding this team's own current members
      const u = { ...usage };
      const cur = teams.find((t) => t.letter === letter);
      if (cur) for (const l of cur.legs) if (l.swimmer) u[l.swimmer.id] -= 1;
      const avail = eligibleByEvent[key].filter((p) => !usedElsewhere.has(p.id) && (u[p.id] || 0) < capValue);
      const rebuilt = bestTeam(avail, ev);
      if (!rebuilt) { setNotice('Not enough available swimmers to re-optimise that team.'); return teams; }
      return teams.map((t) => t.letter === letter ? { ...t, legs: rebuilt.legs, capForced: false } : t);
    });
  }, [usage, eligibleByEvent, capValue, patchEvent]);

  const handleAddTeam = useCallback((key) => {
    const ev = EVENTS.find((e) => e.key === key);
    patchEvent(key, (teams) => {
      const letter = LETTERS[teams.length];
      const usedThisEvent = new Set(teams.flatMap((t) => t.legs.map((l) => l.swimmer?.id)));
      const avail = eligibleByEvent[key].filter((p) => !usedThisEvent.has(p.id) && (usage[p.id] || 0) < capValue);
      const team = bestTeam(avail, ev);
      const legs = team ? team.legs : ev.relay.legs.map((stroke) => ({ stroke, swimmer: null, time: null }));
      return [...teams, { letter, legs, locked: false, capForced: false }];
    });
  }, [eligibleByEvent, usage, capValue, patchEvent]);

  const runAutoOptimise = useCallback(() => {
    const locked = {};
    for (const [key, slot] of Object.entries(lineups)) locked[key] = slot.teams.filter((t) => t.locked);
    setLineups(buildAll(availablePool, { depth, cap: capValue, allowAnyGender }, locked));
    setNotice('Re-optimised all events (locked teams kept).');
  }, [lineups, availablePool, depth, capValue, allowAnyGender]);

  // ── Persistence ─────────────────────────────────────────────────────────────

  async function saveTeam(key, t) {
    try {
      const res = await authedFetch('/api/relay-lineups', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meet_code: MEET.code, event_key: key, team_letter: t.letter,
          legs: t.legs.map((l) => ({ stroke: l.stroke, swimmer_id: l.swimmer?.id || null, time_seconds: l.time || null })),
          entry_time_seconds: teamTotal(t), is_locked: !!t.locked,
        }),
      });
      const j = await res.json();
      if (j.persisted === false) setPersisted(false);
    } catch { /* ignore */ }
  }
  const handleSaveAll = useCallback(async () => {
    setNotice('Saving…');
    let n = 0;
    for (const [key, slot] of Object.entries(lineups)) for (const t of slot.teams) { if (teamComplete(t)) { await saveTeam(key, t); n += 1; } }
    setNotice(persisted ? `Saved ${n} teams to the cloud.` : 'Saved locally — run the relay_lineups migration to persist to the cloud.');
  }, [lineups, persisted]);

  // ── Exports ───────────────────────────────────────────────────────────────

  function exportTeams() {
    const rows = [];
    for (const ev of EVENTS) {
      for (const t of (lineups[ev.key]?.teams || [])) {
        if (!teamComplete(t)) continue;
        rows.push({
          eventKey: ev.key, programmeNo: ev.programmeNo, label: ev.label,
          bandKey: ev.band.key, catKey: ev.cat.key, relayKey: ev.relay.key, composition: ev.cat.composition,
          band: ev.band.label, cat: ev.cat.label, relay: ev.relay.label,
          letter: t.letter, teamName: teamName(t.letter),
          entryTime: formatTime(teamTotal(t)),
          converted: t.legs.some((l) => l.swimmer.converted?.[l.stroke]),
          legs: t.legs.map((l) => ({ stroke: l.stroke, name: l.swimmer.name, fullName: l.swimmer.fullName, yob: l.swimmer.yob, sex: l.swimmer.sex, time: formatTime(l.time), converted: !!l.swimmer.converted?.[l.stroke] })),
        });
      }
    }
    return rows;
  }

  async function exportForm(form) {
    setNotice(`Building official ${form} form…`);
    const res = await authedFetch('/api/export/relay-forms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ form, clubName: CLUB_NAME, clubCode: CLUB_CODE, teams: exportTeams() }),
    });
    if (!res.ok) { setNotice(`${form} export failed.`); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Kent_Relays_2026_${form === 'summary' ? 'Entry_Summary' : 'Team_Declaration'}.docx`; a.click();
    URL.revokeObjectURL(url);
    setNotice(`Official ${form} form downloaded.`);
  }

  function exportCsv() {
    const rows = [['Event no', 'Event', 'Team', 'Entry time', 'Leg', 'Swimmer', 'Year', '50m time', 'Source']];
    for (const t of exportTeams()) for (const l of t.legs) rows.push([t.programmeNo || '', t.label, t.letter, t.entryTime, l.stroke, l.fullName || l.name, l.yob || '', l.time, l.converted ? 'LC est' : 'SCM']);
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'Kent_Relays_2026_Lineups.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  function printSheet() {
    const teams = exportTeams();
    const body = teams.map((t) => `
      <h3>${t.programmeNo ? `[${t.programmeNo}] ` : ''}${t.label} — Team ${t.letter} <span style="color:#0891b2">${t.entryTime}</span></h3>
      <table><thead><tr><th>Leg</th><th>Swimmer</th><th>Year</th><th>DOB</th><th>50m</th></tr></thead><tbody>
      ${t.legs.map((l) => `<tr><td>${l.stroke}</td><td>${l.fullName || l.name}</td><td>${l.yob || ''}</td><td></td><td>${l.time}${l.converted ? ' *' : ''}</td></tr>`).join('')}
      </tbody></table>`).join('');
    const anyConverted = teams.some((t) => t.converted);
    const w = window.open('', '_blank');
    // Null check: with a popup blocker enabled window.open returns null and
    // Print threw "Cannot read properties of null".
    if (!w) {
      alert('Your browser blocked the print window. Allow pop-ups for this site and try again.');
      return;
    }
    w.document.write(`<html><head><title>${MEET.name} — ${CLUB_NAME}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{margin:0 0 4px}h3{margin:18px 0 6px;font-size:14px}
      table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #ccc;padding:5px 8px;text-align:left}
      .sub{color:#666;font-size:12px;margin-bottom:16px}</style></head><body>
      <h1>${MEET.name} — ${CLUB_NAME}</h1>
      <div class="sub">${MEET.venue} · ${MEET.date} · ${MEET.courseLabel} · entries close ${MEET.closes}. Age as at ${MEET.ageAsAt}. DOB column for club to complete.</div>
      ${body}
      ${anyConverted ? '<div class="sub" style="margin-top:16px">* time estimated from a long-course PB (no short-course time on record) — verify before entry.</div>' : ''}
      </body></html>`);
    w.document.close(); w.focus(); w.print();
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return <Layout session={session}><div style={{ display: 'flex', justifyContent: 'center', minHeight: '50vh', alignItems: 'center' }}><p style={{ opacity: 0.5, fontWeight: 700 }}>Loading roster and short-course times…</p></div></Layout>;
  }

  if (loadError) {
    return (
      <Layout session={session}>
        <div className="glass-card" style={{ maxWidth: '520px', margin: '4rem auto', padding: '3rem', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--accent-rose)', marginBottom: '1rem' }}>Couldn&apos;t load the relay roster</h2>
          <p style={{ opacity: 0.7, fontSize: '0.9rem', marginBottom: '2rem' }}>{loadError}</p>
          <button className="period-btn" onClick={() => window.location.reload()}>Retry</button>
        </div>
      </Layout>
    );
  }

  const selectedEvent = selected ? EVENTS.find((e) => e.key === selected) : null;

  return (
    <Layout session={session}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div className="section-title">Relay Team Picker</div>
        <h1 style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>{MEET.name}</h1>
        <p style={{ fontSize: '0.85rem', opacity: 0.6, maxWidth: 640 }}>
          {MEET.venue} · {MEET.date} · {MEET.courseLabel}. Optimised fastest legal line-ups for all 24 events from short-course 50m PBs.
          Age as at {MEET.ageAsAt}. Entry time = sum of the four 50m legs.
        </p>
      </div>

      {/* Metrics + controls */}
      <div className="glass-card mb-8" style={{ padding: '1.5rem 2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
          {[
            { label: 'Teams selected', value: stats.teams, sub: `${stats.complete} complete` },
            { label: 'Est. entry fee', value: `£${stats.fee}`, sub: `£${MEET.feePerTeam}/team` },
            { label: 'Swimmers used', value: stats.swimmers },
            { label: 'Closes in', value: `${closesIn}d`, sub: MEET.closes },
            { label: "Can't field", value: stats.shortfall, sub: 'events < 4 eligible', warn: stats.shortfall > 0 },
            { label: 'Unavailable', value: unavailable.size, sub: stats.conflicts > 0 ? `${stats.conflicts} teams affected` : 'excluded from picks', warn: stats.conflicts > 0 },
          ].map((m) => (
            <div key={m.label} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px' }}>
              <div style={{ fontSize: '0.55rem', fontWeight: 900, opacity: 0.4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{m.label}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: m.warn ? 'var(--accent-rose)' : '#fff' }}>{m.value}</div>
              {m.sub && <div style={{ fontSize: '0.6rem', opacity: 0.45 }}>{m.sub}</div>}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn-premium-intel" style={{ background: 'var(--accent-cyan)', color: '#000', fontSize: '0.7rem' }} onClick={runAutoOptimise}>⚡ Auto-optimise all</button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem', opacity: 0.8 }}>
            Depth
            <select value={depth} onChange={(e) => setDepth(Number(e.target.value))} style={selStyle}>
              <option value={1}>A only</option><option value={2}>A + B</option><option value={3}>A + B + C</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem', opacity: 0.8 }}>
            Max relays / swimmer
            <input type="range" min={0} max={6} step={1} value={cap} onChange={(e) => setCap(Number(e.target.value))} />
            <span style={{ fontWeight: 900, minWidth: 28 }}>{cap === 0 ? 'off' : cap}</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem', opacity: 0.8 }}>
            <input type="checkbox" checked={allowAnyGender} onChange={(e) => setAllowAnyGender(e.target.checked)} />
            Allow any gender in Open/Male
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem', opacity: 0.8 }} title="When a swimmer has no short-course 50, estimate from their long-course time (WA base-time ratio). Real SCM times always win.">
            <input type="checkbox" checked={useLcFallback} onChange={(e) => setUseLcFallback(e.target.checked)} />
            Convert LC times when no SCM
          </label>
          <button className="period-btn" style={{ fontSize: '0.7rem', color: unavailable.size ? 'var(--accent-rose)' : undefined }} onClick={() => setShowAvail((v) => !v)}>🚫 Availability{unavailable.size ? ` (${unavailable.size} out)` : ''}</button>
          <div style={{ flex: 1 }} />
          <button className="period-btn" style={{ fontSize: '0.7rem' }} onClick={handleSaveAll}>💾 Save all</button>
          <button className="period-btn" style={{ fontSize: '0.7rem' }} onClick={() => exportForm('summary')}>📄 Entry summary</button>
          <button className="period-btn" style={{ fontSize: '0.7rem' }} onClick={() => exportForm('declaration')}>📄 Declaration</button>
          <button className="period-btn" style={{ fontSize: '0.7rem' }} onClick={printSheet}>🖨 Print</button>
          <button className="period-btn" style={{ fontSize: '0.7rem' }} onClick={exportCsv}>⬇ CSV</button>
        </div>
        {notice && <div style={{ marginTop: 12, fontSize: '0.72rem', color: 'var(--accent-cyan)' }}>{notice}</div>}
        {!persisted && <div style={{ marginTop: 8, fontSize: '0.68rem', color: 'var(--accent-amber)' }}>⚠ Cloud save unavailable — create the <code>relay_lineups</code> table (schema.sql) to persist between sessions.</div>}

        {showAvail && (
          <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: 10 }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 900, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Availability — {unavailable.size} of {pool.length} marked out. Excluded from auto-optimise and selection; re-run Auto-optimise to fill gaps.
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={availSearch} onChange={(e) => setAvailSearch(e.target.value)} placeholder="Search…" style={{ ...selStyle, width: 160 }} />
                {unavailable.size > 0 && <button className="period-btn" style={{ fontSize: '0.65rem' }} onClick={() => setUnavailable(new Set())}>Reset all</button>}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
              {[...pool]
                .filter((p) => !availSearch.trim() || `${p.name} ${p.fullName}`.toLowerCase().includes(availSearch.toLowerCase()))
                .sort((a, b) => (unavailable.has(b.id) - unavailable.has(a.id)) || a.name.localeCompare(b.name))
                .map((p) => {
                  const out = unavailable.has(p.id);
                  return (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', background: out ? 'rgba(244,63,94,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${out ? 'rgba(244,63,94,0.25)' : 'rgba(255,255,255,0.05)'}` }}>
                      <input type="checkbox" checked={!out} onChange={(e) => setAvailable(p.id, e.target.checked)} />
                      <span style={{ fontSize: '0.74rem', textDecoration: out ? 'line-through' : 'none', opacity: out ? 0.6 : 1 }}>{p.name}</span>
                      <span style={{ fontSize: '0.6rem', opacity: 0.4, marginLeft: 'auto' }}>{p.age}y {p.sex}</span>
                    </label>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* Matrix */}
      <div className="glass-card" style={{ padding: '1.5rem', overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '80px repeat(3, minmax(180px, 1fr))', gap: '8px', minWidth: 700 }}>
          <div />
          {CATEGORIES.map((c) => (
            <div key={c.key} style={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: 900, opacity: 0.55, textTransform: 'uppercase', letterSpacing: '0.08em', paddingBottom: 4 }}>
              {c.label}{c.key === 'X' ? ' (2M+2F)' : ''}
            </div>
          ))}
          {AGE_BANDS.map((band) => (
            <MatrixRow key={band.key} band={band} lineups={lineups} eligibleByEvent={eligibleByEvent} selected={selected} onSelect={setSelected} />
          ))}
        </div>
        <div style={{ marginTop: 12, fontSize: '0.62rem', opacity: 0.4 }}>
          Each cell shows the fastest team's entry time and how many teams are set. <span style={{ color: '#10b981' }}>A = priority entry</span>; B/C are lottery-vulnerable under the 30-team cap. Click a relay to build teams.
        </div>
      </div>

      {/* Builder */}
      {selectedEvent && (
        <RelayBuilderDrawer
          event={selectedEvent}
          teams={lineups[selectedEvent.key]?.teams || []}
          eligible={eligibleByEvent[selectedEvent.key] || []}
          usage={usage}
          cap={capValue}
          unavailableIds={unavailable}
          onSwap={handleSwap}
          onToggleLock={handleToggleLock}
          onReoptimise={handleReoptimise}
          onAddTeam={() => handleAddTeam(selectedEvent.key)}
          onRemoveTeam={handleRemoveTeam}
          onMarkUnavailable={(id) => setAvailable(id, false)}
          onClose={() => setSelected(null)}
        />
      )}

      {selectedEvent && (benchedByEvent[selectedEvent.key]?.length > 0) && (
        <div className="glass-card" style={{ padding: '1.25rem 2rem', marginTop: '1rem' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 900, opacity: 0.4, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Age/sex-eligible but missing a required 50m time ({benchedByEvent[selectedEvent.key].length})
          </div>
          <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>
            {benchedByEvent[selectedEvent.key].map((p) => `${p.name} (${p.age}y)`).join(', ')}
          </div>
        </div>
      )}
    </Layout>
  );
}

const selStyle = { padding: '6px 10px', background: 'rgba(13,17,23,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '0.72rem', cursor: 'pointer' };

// ─── Matrix row ────────────────────────────────────────────────────────────────

function MatrixRow({ band, lineups, eligibleByEvent, selected, onSelect }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 900, opacity: 0.7 }}>{band.label}</div>
      {CATEGORIES.map((cat) => (
        <div key={cat.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {RELAYS.map((relay) => {
            const key = `${band.key}-${cat.key}-${relay.key}`;
            const teams = lineups[key]?.teams || [];
            const fastest = teams.filter((t) => t.legs.every((l) => l.swimmer)).map((t) => t.legs.reduce((s, l) => s + l.time, 0)).sort((a, b) => a - b)[0];
            const short = (eligibleByEvent[key]?.length || 0) < 4;
            const isSel = selected === key;
            return (
              <button
                key={relay.key}
                onClick={() => onSelect(key)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, textAlign: 'left',
                  padding: '9px 11px', borderRadius: 10, cursor: 'pointer',
                  background: isSel ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isSel ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.06)'}`,
                  color: '#fff',
                }}
              >
                <span style={{ fontSize: '0.68rem', opacity: 0.6 }}>{relay.short}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {short ? (
                    <span style={{ fontSize: '0.62rem', color: 'var(--accent-amber)' }}>⚠ &lt;4</span>
                  ) : (
                    <>
                      <span style={{ fontSize: '0.82rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: fastest ? '#fff' : 'rgba(255,255,255,0.3)' }}>{fastest ? formatTime(fastest) : '—'}</span>
                      {teams.length > 0 && <span style={{ fontSize: '0.58rem', fontWeight: 900, padding: '1px 6px', borderRadius: 5, background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>{teams.length}T</span>}
                    </>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}
