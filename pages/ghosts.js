import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { authedFetch } from '../lib/api-client';
import { ATTENDANCE_WINDOWS, attendanceWindowLabel } from '../lib/restructure-glossary';
import toast from 'react-hot-toast';

/**
 * Ghost allocations: places booked that nobody has been recorded standing in.
 *
 * Its own page rather than a tab on /capacity, because it is handed to
 * somebody. The list is used to take a swimmer's place away, so every name on
 * it is an accusation, and it has to be readable on its own terms by whoever
 * makes that decision.
 *
 * The separation that matters is not by squad but by trust. A session whose
 * register was never taken makes a ghost of every swimmer on it at once, and
 * reclaiming those lanes would take water off squads that were using it. Those
 * entries are a conversation with a coach; only the ones the register can vouch
 * for are a conversation about a swimmer.
 *
 * Every judgement is made in lib/ghost-allocations.js, not in this file.
 */

const TRUST = {
  good: { colour: 'var(--accent-rose)', label: 'Place can be reclaimed' },
  weak: { colour: 'var(--accent-amber, #f59e0b)', label: 'Register cannot confirm' },
  none: { colour: 'var(--text-secondary)', label: 'No register to judge by' }
};

function Figure({ label, value, sub, colour }) {
  return (
    <div className="glass-card" style={{ padding: '1.25rem', borderTop: `3px solid ${colour || 'var(--accent-cyan)'}` }}>
      <span style={{ fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>{label}</span>
      <div style={{ fontSize: '1.9rem', fontWeight: 900, color: colour || 'var(--accent-cyan)', lineHeight: 1.1, marginTop: '0.4rem' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>{sub}</div>}
    </div>
  );
}

export default function GhostsPage() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [days, setDays] = useState(90);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [openSquad, setOpenSquad] = useState(null);

  const isPrint = router.query.report === 'ghosts';

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
      const res = await authedFetch(`/api/ghost-allocations?days=${days}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load the allocations');
      setData(json.report);
    } catch (err) {
      console.error('[ghosts]', err);
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
        body: JSON.stringify({ targetPath: `/ghosts?report=ghosts&days=${days}`, clientAuth })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'PDF generation failed');
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `ghost-allocations-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[ghosts pdf]', err);
      toast.error(err.message || 'Report failed');
    } finally {
      setExporting(false);
    }
  };

  const s = data?.summary;

  return (
    <Layout session={session}>
      <Head>
        <title>Ghost Allocations | CoachesEye</title>
        <style>{`
          @media print {
            body { background: #050b10 !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .no-print { display: none !important; }
            .print-only { display: block !important; }
            .glass-card { page-break-inside: avoid; }
            .ghost-squad { page-break-inside: avoid; }
            .ghost-cover { page-break-after: always; text-align: center; padding-top: 22vh; }
            .ghost-rows { display: block !important; }
          }
          .print-only { display: none; }
        `}</style>
      </Head>

      {isPrint && (
        <div className="print-only ghost-cover">
          <div style={{ fontSize: '0.9rem', fontWeight: 900, letterSpacing: '0.45em', textTransform: 'uppercase', color: 'var(--accent-rose)' }}>Tonbridge Swimming Club</div>
          <h1 style={{ fontSize: '3.4rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.03em', margin: '2rem 0 0' }}>
            Ghost Allocations
          </h1>
          <div style={{ height: '8px', width: '110px', background: 'var(--accent-rose)', margin: '2.5rem auto' }} />
          <p style={{ fontSize: '1.2rem', opacity: 0.8, maxWidth: '46ch', margin: '0 auto', lineHeight: 1.6 }}>
            Places booked that nobody has been recorded standing in
          </p>
          {s && (
            <p style={{ fontSize: '1rem', opacity: 0.6, marginTop: '2rem' }}>
              {s.total} allocations · {s.reclaimable} the register can vouch for · {s.unverifiable} it cannot
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
            <div className="section-title">Allocations</div>
            <h1 style={{ fontSize: '2rem', fontWeight: 900, textTransform: 'uppercase', margin: '0.3rem 0 0.5rem' }}>Ghost Allocations</h1>
            <p style={{ color: 'var(--text-secondary)', maxWidth: '68ch', lineHeight: 1.65, margin: 0, fontSize: '0.85rem' }}>
              A ghost is a place nobody is standing in. The list is used to reclaim lanes, so
              every name on it is an accusation of sorts — and a session whose register was never
              taken makes a ghost of everybody on it at once. Those are sorted out first, because
              reclaiming them would take water off a squad that was using it.
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
            {data.window.from} to {data.window.to}. A swimmer counts as having used their place
            if they were marked present once. Being marked absent is not use, and nights the pool
            was shut are not held against anybody.
          </p>
        )}

        {loading && <p style={{ marginTop: '2rem', color: 'var(--text-secondary)' }}>Reading the allocations…</p>}

        {!loading && s && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
              <Figure label="Ghost allocations" value={s.total}
                sub={`${s.swimmers} swimmers across ${s.sessions} sessions`} colour="var(--accent-amber, #f59e0b)" />
              <Figure label="Places to reclaim" value={s.reclaimable}
                sub="register is reliable and they are not in it" colour="var(--accent-rose)" />
              <Figure label="Register cannot say" value={s.unverifiable}
                sub="ask the coach before the swimmer" colour="var(--text-secondary)" />
              <Figure label="Tidy-ups" value={s.orphans.retiredSession}
                sub="memberships still on a retired session" colour="var(--accent-cyan)" />
            </div>

            {/*
              Sessions where the whole roster is a ghost.
              One swimmer never recorded is a swimmer. Twelve is a register, and
              reading it as twelve swimmers is how a session loses its lanes for
              a fault that was never its swimmers'.
            */}
            {data.wholeRoster.length > 0 && (
              <div style={{ marginTop: '2rem' }}>
                <h2 className="section-title">Whole sessions with nobody recorded</h2>
                {data.wholeRoster.map(w => (
                  <div key={w.sessionId} className="glass-card" style={{ padding: '1.1rem 1.3rem', borderLeft: '3px solid var(--accent-amber, #f59e0b)', marginBottom: '0.75rem' }}>
                    <div style={{ fontWeight: 900, fontSize: '0.9rem' }}>
                      {w.sessionName} — {w.roster} swimmers, none recorded
                    </div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.4rem 0 0', lineHeight: 1.6 }}>
                      {w.detail} {w.reason.detail}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: '2rem' }}>
              <h2 className="section-title">Squad by squad</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '0.6rem' }}>
                {data.bySquad.map(g => (
                  <div key={g.squad} className="glass-card"
                    style={{ padding: '0.8rem 0.9rem', borderLeft: `3px solid ${g.reclaimable ? 'var(--accent-rose)' : 'var(--accent-amber, #f59e0b)'}` }}
                    title={`${g.total} ghost allocations across ${g.swimmers} swimmers`}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.3 }}>{g.squad}</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 900, color: g.reclaimable ? 'var(--accent-rose)' : 'var(--text-secondary)', marginTop: '0.3rem' }}>
                      {g.reclaimable}
                    </div>
                    <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      places to reclaim<br />
                      {g.unverifiable} the register cannot confirm
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: '2rem' }}>
              <h2 className="section-title">Every allocation</h2>
              {data.rows.length === 0 && (
                <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem' }}>✅</div>
                  <p style={{ margin: '0.5rem 0 0', fontWeight: 700 }}>Every booked place has somebody in it.</p>
                </div>
              )}
              {data.bySquad.map(g => (
                <div key={g.squad} className="ghost-squad" style={{ marginBottom: '1.4rem' }}>
                  <div
                    className="no-print"
                    onClick={() => setOpenSquad(openSquad === g.squad ? null : g.squad)}
                    title="Click to show or hide the names"
                    style={{ display: 'flex', alignItems: 'baseline', gap: '0.7rem', marginBottom: '0.5rem', cursor: 'pointer' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--accent-cyan)', margin: 0 }}>{g.squad}</h3>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
                      {g.reclaimable} to reclaim · {g.unverifiable} unconfirmed · {g.swimmers} swimmers
                    </span>
                    <span style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
                  </div>
                  <div className="print-only" style={{ marginBottom: '0.5rem' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--accent-cyan)', margin: 0 }}>
                      {g.squad} — {g.reclaimable} to reclaim, {g.unverifiable} unconfirmed
                    </h3>
                  </div>

                  {(isPrint || openSquad === g.squad) && (
                    <div className="ghost-rows">
                      {g.rows.map((r, i) => (
                        <div key={`${r.swimmerId}-${r.sessionId}-${i}`} className="glass-card"
                          style={{ padding: '0.75rem 1.1rem', borderLeft: `3px solid ${TRUST[r.reason.trust].colour}`, marginBottom: '0.45rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
                            <div>
                              <div style={{ fontSize: '0.95rem', fontWeight: 900 }}>{r.swimmerName}</div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                                {r.sessionDay} {r.sessionTime || ''} · {r.sessionName}{r.venue ? ` · ${r.venue}` : ''}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <span style={{ color: TRUST[r.reason.trust].colour, fontWeight: 900, textTransform: 'uppercase', fontSize: '0.6rem', letterSpacing: '0.08em' }}>
                                {TRUST[r.reason.trust].label}
                              </span>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                                {r.reason.label}
                              </div>
                            </div>
                          </div>
                          <p style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', margin: '0.4rem 0 0', lineHeight: 1.55 }}>
                            {r.reason.detail}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
