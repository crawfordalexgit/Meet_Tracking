import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { authedFetch } from '../lib/api-client';
import { ATTENDANCE_WINDOWS, attendanceWindowLabel } from '../lib/restructure-glossary';
import toast from 'react-hot-toast';

/**
 * Registers that do not look like they were taken.
 *
 * Kept off /capacity deliberately. That page answers "is there enough water";
 * this one answers "do we believe the numbers on that page", and the second
 * question has to be askable without wading through the first. It is also the
 * page somebody hands to a coach, which /capacity is not.
 *
 * Every figure here is measured, and every judgement is made in
 * lib/register-health.js rather than in this file.
 */

const SEVERITY = {
  error: { colour: 'var(--accent-rose)', label: 'Needs attention' },
  warning: { colour: 'var(--accent-amber, #f59e0b)', label: 'Worth a look' },
  ok: { colour: 'var(--accent-emerald)', label: 'Fine' }
};

/**
 * How a coverage figure is coloured.
 *
 * Severity and coverage are two different questions and were being answered in
 * one colour: a squad with one bad session printed its 81% in red while a squad
 * with none printed 80% in green, so the colour contradicted the number sitting
 * inside it. Coverage colours the coverage figure; severity stays on the border
 * and is now also written out in words, because a reader who cannot separate
 * red from green should not have to.
 *
 * The bands are strict on purpose. A register is taken or it is not, and four
 * nights in five is not a good record — it is one squad night a week with no
 * idea who was there.
 */
const COVERAGE_BANDS = [
  { at: 95, colour: 'var(--accent-emerald)' },
  { at: 80, colour: 'var(--accent-amber, #f59e0b)' },
  { at: 0, colour: 'var(--accent-rose)' }
];
const coverageColour = pct =>
  pct === null ? 'var(--text-secondary)' : COVERAGE_BANDS.find(b => pct >= b.at).colour;

function Figure({ label, value, sub, colour }) {
  return (
    <div className="glass-card" style={{ padding: '1.25rem', borderTop: `3px solid ${colour || 'var(--accent-cyan)'}` }}>
      <span style={{ fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>{label}</span>
      <div style={{ fontSize: '1.9rem', fontWeight: 900, color: colour || 'var(--accent-cyan)', lineHeight: 1.1, marginTop: '0.4rem' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>{sub}</div>}
    </div>
  );
}

export default function RegistersPage() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [days, setDays] = useState(90);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [openSession, setOpenSession] = useState(null);

  const isPrint = router.query.report === 'registers';

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.days) setDays(parseInt(router.query.days, 10));
  }, [router.isReady, router.query.days]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch(`/api/register-health?days=${days}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load the registers');
      setData(json.report);
    } catch (err) {
      console.error('[registers]', err);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { if (session) load(); }, [session, load]);

  const exportPdf = async () => {
    setExporting(true);
    try {
      const clientAuth = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('sb-') || k === 'print-insight-cache' || k === 'print-report-config')) {
          clientAuth[k] = localStorage.getItem(k);
        }
      }
      const res = await authedFetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPath: `/registers?report=registers&days=${days}`, clientAuth })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'PDF generation failed');
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `register-check-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[registers pdf]', err);
      toast.error(err.message || 'Report failed');
    } finally {
      setExporting(false);
    }
  };

  const s = data?.summary;

  return (
    <Layout session={session}>
      <Head>
        <title>Register Check | CoachesEye</title>
        <style>{`
          @media print {
            body { background: #050b10 !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .no-print { display: none !important; }
            .print-only { display: block !important; }
            .glass-card { page-break-inside: avoid; }
            .reg-row { page-break-inside: avoid; }
            .reg-cover { page-break-after: always; text-align: center; padding-top: 22vh; }
          }
          .print-only { display: none; }
        `}</style>
      </Head>

      {isPrint && (
        <div className="print-only reg-cover">
          <div style={{ fontSize: '0.9rem', fontWeight: 900, letterSpacing: '0.45em', textTransform: 'uppercase', color: 'var(--accent-rose)' }}>Tonbridge Swimming Club</div>
          <h1 style={{ fontSize: '3.4rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.03em', margin: '2rem 0 0' }}>
            Register Check
          </h1>
          <div style={{ height: '8px', width: '110px', background: 'var(--accent-rose)', margin: '2.5rem auto' }} />
          <p style={{ fontSize: '1.2rem', opacity: 0.8, maxWidth: '44ch', margin: '0 auto', lineHeight: 1.6 }}>
            Sessions whose register does not look like it was really taken
          </p>
          {s && (
            <p style={{ fontSize: '1rem', opacity: 0.6, marginTop: '2rem' }}>
              {s.flagged} of {s.sessions} sessions flagged · {s.registersTaken} registers taken of {s.registersExpected} owed
            </p>
          )}
          {data && (
            <p style={{ fontSize: '0.9rem', opacity: 0.5, marginTop: '2rem' }}>
              {data.window.from} to {data.window.to} · {days} days
            </p>
          )}
        </div>
      )}

      <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <div className="section-title">Data Quality</div>
            <h1 style={{ fontSize: '2rem', fontWeight: 900, textTransform: 'uppercase', margin: '0.3rem 0 0.5rem' }}>Register Check</h1>
            <p style={{ color: 'var(--text-secondary)', maxWidth: '68ch', lineHeight: 1.65, margin: 0, fontSize: '0.85rem' }}>
              A register that was never taken looks exactly like a session nobody attends. The
              figures do not go missing, they go quiet — and quiet reads as empty, so a session
              can lose its lanes because nobody marked the sheet. These are the sessions where
              the record does not look right.
            </p>
          </div>
          <div className="no-print" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {ATTENDANCE_WINDOWS.map(d => (
              <button key={d} onClick={() => setDays(d)} disabled={loading}
                className="btn"
                style={{
                  padding: '5px 11px', fontSize: '0.68rem', fontWeight: 800, borderRadius: '7px',
                  border: `1px solid ${d === days ? 'var(--accent-cyan)' : 'var(--glass-border)'}`,
                  background: d === days ? 'rgba(6,182,212,0.12)' : 'transparent',
                  color: d === days ? 'var(--accent-cyan)' : 'var(--text-secondary)'
                }}>
                {attendanceWindowLabel(d)}
              </button>
            ))}
            <button className="btn btn-secondary" onClick={exportPdf} disabled={exporting || loading}
              style={{ fontSize: '0.7rem', padding: '6px 12px', whiteSpace: 'nowrap' }}>
              {exporting ? 'Building…' : '📄 Report'}
            </button>
          </div>
        </div>

        {data && (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '1rem', paddingLeft: '0.7rem', borderLeft: '2px solid var(--glass-border)' }}>
            {data.window.from} to {data.window.to}. A session is only judged once it has run at
            least three times, and nights the club was shut are not counted as registers owed.
          </p>
        )}

        {loading && <p style={{ marginTop: '2rem', color: 'var(--text-secondary)' }}>Reading the registers…</p>}

        {!loading && s && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
              <Figure label="Sessions flagged" value={`${s.flagged} of ${s.sessions}`}
                sub={`${s.clean} look fine`} colour={s.flagged ? 'var(--accent-amber, #f59e0b)' : 'var(--accent-emerald)'} />
              <Figure label="Need attention" value={s.errors}
                sub="never taken, or stopped" colour="var(--accent-rose)" />
              <Figure label="Registers taken" value={`${s.registersTaken} of ${s.registersExpected}`}
                sub={`${Math.round(s.registersTaken / Math.max(1, s.registersExpected) * 100)}% of the nights the club ran`} />
              <Figure label="Never taken" value={s.byFlag.never || 0} sub="no register in this window" colour="var(--accent-rose)" />
            </div>

            {/*
              Days the whole club went quiet with no closure recorded.

              This sits above every other finding because it changes what they
              mean. If the club was shut for a week nobody wrote down, then a
              week of "missing" registers below is not a coach's failing, and
              acting on the list before fixing the closure sends somebody to
              have eight conversations about a holiday.
            */}
            {(data.unrecordedClosures || []).length > 0 && (
              <div style={{ marginTop: '2rem' }}>
                <h2 className="section-title">The club went quiet, and no closure is recorded</h2>
                {data.unrecordedClosures.map((c, i) => (
                  <div key={i} className="glass-card" style={{ padding: '1.1rem 1.3rem', borderLeft: '3px solid var(--accent-amber, #f59e0b)', marginBottom: '0.75rem' }}>
                    <div style={{ fontWeight: 900, fontSize: '0.9rem' }}>
                      {c.from} to {c.to} — {c.days} days, not one mark anywhere
                    </div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.4rem 0 0.6rem', lineHeight: 1.6 }}>
                      {c.detail}
                    </p>
                    <p style={{ fontSize: '0.75rem', margin: 0 }}>
                      Until it is recorded in{' '}
                      <a href="/settings" style={{ color: 'var(--accent-cyan)' }}>Settings → Exemptions</a>
                      {' '}as a closure, these {c.days} days count against every session that runs in them.
                    </p>
                  </div>
                ))}
              </div>
            )}

            {data.clusters.length > 0 && (
              <div style={{ marginTop: '2rem' }}>
                <h2 className="section-title">Registers that stopped together</h2>
                {data.clusters.map((c, i) => (
                  <div key={i} className="glass-card" style={{ padding: '1.1rem 1.3rem', borderLeft: '3px solid var(--accent-rose)', marginBottom: '0.75rem' }}>
                    <div style={{ fontWeight: 900, fontSize: '0.9rem' }}>
                      {c.count} sessions last registered between {c.from} and {c.to}
                    </div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.4rem 0 0.6rem', lineHeight: 1.6 }}>
                      {c.detail}
                    </p>
                    <div style={{ fontSize: '0.75rem' }}>{c.sessions.join(' · ')}</div>
                  </div>
                ))}
              </div>
            )}

            {/*
              Grouped by squad.

              Fifty-two sessions worst-first is a list to work through; the
              same fifty-two under eight squad headings is a page somebody can
              scan and see that one squad is most of the problem. Each heading
              carries its own registers taken against owed, so it can be read
              without the rows beneath it.
            */}
            <div style={{ marginTop: '2rem' }}>
              <h2 className="section-title">Squad by squad</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '0.6rem' }}>
                {data.bySquad.map(g => {
                  const pct = g.expected > 0 ? Math.round(g.taken / g.expected * 100) : null;
                  const severity = g.errors ? 'error' : g.flagged.length ? 'warning' : 'ok';
                  const colour = SEVERITY[severity].colour;
                  return (
                    <div key={g.squad} className="glass-card"
                      style={{ padding: '0.8rem 0.9rem', borderLeft: `3px solid ${colour}` }}
                      title={`${g.taken} registers taken of ${g.expected} owed across ${g.sessions.length} sessions`}>
                      <div style={{ fontSize: '0.68rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.3 }}>{g.squad}</div>
                      <div style={{ fontSize: '1.3rem', fontWeight: 900, color: coverageColour(pct), marginTop: '0.3rem' }}>
                        {pct === null ? '—' : `${pct}%`}
                      </div>
                      <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {g.taken} of {g.expected} registers<br />
                        {g.flagged.length} of {g.sessions.length} sessions flagged
                      </div>
                      <div className="reg-squad-severity" style={{ fontSize: '0.62rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', color: colour, marginTop: '0.35rem' }}>
                        {SEVERITY[severity].label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ marginTop: '2rem' }}>
              <h2 className="section-title">Session by session</h2>
              {data.flagged.length === 0 && (
                <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem' }}>✅</div>
                  <p style={{ margin: '0.5rem 0 0', fontWeight: 700 }}>Every register looks like it was taken.</p>
                </div>
              )}
              {data.bySquad.filter(g => g.flagged.length > 0).map(g => (
                <div key={g.squad} className="reg-squad" style={{ marginBottom: '1.4rem' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.7rem', marginBottom: '0.5rem' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--accent-cyan)', margin: 0 }}>{g.squad}</h3>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
                      {g.flagged.length} of {g.sessions.length} sessions · {g.taken} of {g.expected} registers
                    </span>
                    <span style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
                  </div>
                  {g.flagged.map(r => (
                <div key={r.sessionId} className="glass-card reg-row"
                  onClick={() => setOpenSession(openSession === r.sessionId ? null : r.sessionId)}
                  title="Click to see every night this session ran"
                  style={{ padding: '0.9rem 1.2rem', borderLeft: `3px solid ${SEVERITY[r.worst].colour}`, marginBottom: '0.6rem', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <div>
                      <div style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>
                        {r.day} {r.time} {r.venue ? `· ${r.venue}` : ''}
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: 900 }}>{r.name}</div>
                    </div>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', textAlign: 'right' }}>
                      taken <strong style={{ color: '#fff' }}>{r.taken}</strong> of {r.expected} nights
                      {' · '}roster {r.rosterCount}
                      {' · '}{r.lastDate ? `last ${r.lastDate}` : 'never taken'}
                    </div>
                  </div>
                  <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    {r.flags.map(f => (
                      <div key={f.key} style={{ fontSize: '0.76rem', lineHeight: 1.55 }}>
                        <span style={{ color: SEVERITY[f.severity].colour, fontWeight: 900, textTransform: 'uppercase', fontSize: '0.6rem', letterSpacing: '0.08em', marginRight: '0.5rem' }}>
                          {f.label}
                        </span>
                        <span style={{ color: 'var(--text-secondary)' }}>{f.detail}</span>
                      </div>
                    ))}
                  </div>

                  {/*
                    The nights themselves.

                    "Taken on 3 of 13" is a claim; the thirteen dates are the
                    evidence. Whoever has to act on this wants to see which
                    Friday went unmarked before they go and ask anybody about
                    it, and a report that cannot be opened is one that gets
                    argued with instead of acted on. Forced open when printing,
                    since paper cannot be clicked.
                  */}
                  {(openSession === r.sessionId || isPrint) && (
                    <div className="reg-nights" style={{ marginTop: '0.8rem', paddingTop: '0.7rem', borderTop: '1px solid var(--glass-border)' }}>
                      <div style={{ fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                        Every night it ran
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        {r.nights.map(n => (
                          <span key={n.date}
                            title={n.taken
                              ? `${n.date}: ${n.present} present, ${n.absent} absent${n.other ? `, ${n.other} excused` : ''}`
                              : `${n.date}: no register taken`}
                            style={{
                              fontSize: '0.66rem', fontWeight: 700, padding: '3px 7px', borderRadius: '5px',
                              border: `1px solid ${n.taken ? 'rgba(16,185,129,0.35)' : 'rgba(244,63,94,0.35)'}`,
                              background: n.taken ? 'rgba(16,185,129,0.08)' : 'rgba(244,63,94,0.08)',
                              color: n.taken ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                              whiteSpace: 'nowrap'
                            }}>
                            {n.date.slice(5)}{n.taken ? ` · ${n.present}/${n.marks}` : ' · —'}
                          </span>
                        ))}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.55rem', lineHeight: 1.6 }}>
                        Green is a register taken, showing present out of marked. Red is a night
                        the session ran with no register.
                        {r.unexpectedDates.length > 0 && (
                          <> Also registered on {r.unexpectedDates.join(', ')}, which {r.unexpectedDates.length === 1 ? 'is not a night' : 'are not nights'} this
                          session normally runs — a rearranged session, or a date recorded against the wrong one.</>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                  ))}
                </div>
              ))}
            </div>

            <div style={{ marginTop: '2rem' }}>
              <h2 className="section-title">Registers that look fine ({s.clean})</h2>
              <div className="glass-card" style={{ padding: '1rem 1.2rem', fontSize: '0.78rem', lineHeight: 1.9, color: 'var(--text-secondary)' }}>
                {data.rows.filter(r => r.worst === 'ok').map(r => r.name).join(' · ') || 'None.'}
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
