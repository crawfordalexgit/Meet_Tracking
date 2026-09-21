import { useState, useEffect, useCallback, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import Layout from '../components/Layout';
import ScenarioSlotEditor from '../components/ScenarioSlotEditor';
import ScenarioSquadEditor from '../components/ScenarioSquadEditor';
import ScenarioCoachEditor from '../components/ScenarioCoachEditor';
import ScenarioAssumptions from '../components/ScenarioAssumptions';
import ScenarioComparison from '../components/ScenarioComparison';
import CurrentStructure from '../components/CurrentStructure';
import ModelVerdict from '../components/ModelVerdict';
import ModelAssistant from '../components/ModelAssistant';
import WeekView from '../components/restructure/WeekView';
import Term from '../components/restructure/Term';
import GoalPicker from '../components/restructure/GoalPicker';
import StructureSearch from '../components/restructure/StructureSearch';
import { SquadLockPills, BandAxisPicker } from '../components/restructure/ScopeControls';
import { GlossaryPanel, GlossaryAppendix } from '../components/restructure/GlossaryPanel';
import AsIsBriefing from '../components/restructure/AsIsBriefing';
import { authedFetch } from '../lib/api-client';
import { summariseModel } from '../lib/restructure-summary';
import { weightsForGoals, scoreGoals } from '../lib/restructure-goals';
import { applyPatch } from '../lib/restructure-patch';
import { LTAD_VERDICT_LABELS, DEFAULT_ATTENDANCE_DAYS } from '../lib/restructure-glossary';
import { itemsFromSessions, itemsFromPlan, itemsFromSlots } from '../lib/restructure-week';

const TABS = [
  { key: 'plan', label: 'The Plan' },
  { key: 'today', label: 'The Club Today' },
  { key: 'build', label: 'Build the Plan' },
  { key: 'compare', label: 'Compare' }
];

/**
 * Squad restructuring / pool time scenario planner.
 *
 * Model hypothetical pool time, propose a squad structure against it, and see
 * the weekly timetable it produces. Every number comes from the solver in
 * lib/restructure-solver.js, run server-side, so the screen, the spreadsheet and
 * the printed report cannot drift apart.
 */
export default function RestructurePlanner({ session }) {
  const router = useRouter();
  const isPrint = router.query.view === 'print';

  const [baseline, setBaseline] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [scenarioId, setScenarioId] = useState(null);
  const [name, setName] = useState('Untitled scenario');
  const [inputs, setInputs] = useState(null);
  const [result, setResult] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [solving, setSolving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState('plan');

  const [todayVenue, setTodayVenue] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [bandBy, setBandBy] = useState('hybrid');
  const [suggesting, setSuggesting] = useState(false);
  const [narrative, setNarrative] = useState(null);
  const [narrating, setNarrating] = useState(false);
  const [asIs, setAsIs] = useState(null);
  const [asIsDays, setAsIsDays] = useState(DEFAULT_ATTENDANCE_DAYS);
  // Holiday weeks are set aside by default: a turn-up figure that blends term
  // and holidays is the one a committee can take apart.
  const [asIsTermOnly, setAsIsTermOnly] = useState(true);
  const [asIsLoading, setAsIsLoading] = useState(false);
  const [asIsNarrative, setAsIsNarrative] = useState(null);
  const [asIsWriting, setAsIsWriting] = useState(false);
  const [compareIds, setCompareIds] = useState([]);
  const [compareData, setCompareData] = useState({});

  /* ---- loading ---------------------------------------------------------- */

  const loadScenarios = useCallback(async () => {
    const res = await authedFetch('/api/restructure/scenarios');
    if (!res.ok) return [];
    const json = await res.json();
    setScenarios(json.scenarios || []);
    return json.scenarios || [];
  }, []);

  const loadScenario = useCallback(async (id) => {
    const res = await authedFetch(`/api/restructure/scenarios?id=${id}`);
    if (!res.ok) { toast.error('Could not load that scenario'); return; }
    const json = await res.json();
    setScenarioId(json.scenario.id);
    setName(json.scenario.name);
    setInputs(json.scenario.inputs);
    setResult(null);
    setNarrative(null);
    setSuggestions(null);
    setDirty(false);
  }, []);

  useEffect(() => {
    if (!session || !router.isReady) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const [baseRes, list] = await Promise.all([
          authedFetch('/api/restructure/baseline'),
          loadScenarios()
        ]);
        if (cancelled) return;

        if (!baseRes.ok) throw new Error('Baseline request failed');
        const baseJson = await baseRes.json();
        setBaseline(baseJson.baseline);

        const wanted = router.query.scenario;
        if (wanted && list.some(s => s.id === wanted)) {
          await loadScenario(wanted);
        } else {
          // Seed straight from the live timetable so the page is useful on the
          // first visit, without saving anything.
          setInputs(baseJson.seedInputs);
          setName('Current timetable (seeded)');
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) toast.error('Could not load the planner');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [session, router.isReady, router.query.scenario, loadScenarios, loadScenario]);

  /* ---- solving ---------------------------------------------------------- */

  const solve = useCallback(async (payload, quiet = false) => {
    const body = payload || inputs;
    if (!body) return;
    setSolving(true);
    try {
      const res = await authedFetch('/api/restructure/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: body,
          scenarioId: dirty ? undefined : scenarioId,
          options: { baselineLaneHours: baseline?.utilisation?.totalLaneHours }
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Solve failed');
      setResult(json);
      setNarrative(null);
      if (!json.ok && !quiet) toast.error(json.errors[0] || 'Scenario is not valid');
      return json;
    } catch (err) {
      console.error(err);
      if (!quiet) toast.error(err.message || 'Solve failed');
    } finally {
      setSolving(false);
    }
  }, [inputs, scenarioId, dirty, baseline]);

  useEffect(() => {
    if (inputs && !result && !solving) solve(inputs, true);
  }, [inputs, result, solving, solve]);

  /* ---- the club as it stands -------------------------------------------- */

  // Loaded once alongside the baseline. The figures are cheap and are what the
  // Today tab leads with; the written briefing is asked for separately, because
  // it costs a provider call and most visits do not need one.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setAsIsLoading(true);
    (async () => {
      try {
        const res = await authedFetch(`/api/restructure/asis?attendanceDays=${asIsDays}&termOnly=${asIsTermOnly ? '1' : '0'}`);
        if (cancelled || !res.ok) return;
        const json = await res.json();
        if (json.report) setAsIs(json.report);
        // The briefing described the old window, so it no longer matches.
        setAsIsNarrative(null);
      } finally {
        if (!cancelled) setAsIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session, asIsDays, asIsTermOnly]);

  const writeAsIs = async () => {
    setAsIsWriting(true);
    try {
      const res = await authedFetch(
        `/api/restructure/asis?attendanceDays=${asIsDays}&termOnly=${asIsTermOnly ? '1' : '0'}`,
        { method: 'POST' });
      const json = await res.json();
      if (json.report) setAsIs(json.report);
      if (!json.narrative) throw new Error(json.error || 'The briefing could not be written');
      setAsIsNarrative(json.narrative);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'The briefing could not be written');
    } finally {
      setAsIsWriting(false);
    }
  };

  /* ---- editing ---------------------------------------------------------- */

  const patchInputs = patch => {
    setInputs(prev => ({ ...prev, ...patch }));
    setDirty(true);
  };

  /* ---- structure suggestions -------------------------------------------- */

  const suggest = async (mode) => {
    if (!inputs) return;
    setSuggesting(true);
    try {
      const res = await authedFetch('/api/restructure/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs,
          options: {
            bandBy: mode || bandBy,
            minSquads: 3, maxSquads: 7, topN: 5
          }
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not suggest structures');
      setSuggestions(json);
      if (!json.suggestions.length) {
        toast('No structure fits those bounds — try allowing smaller squads.', { icon: 'ℹ️' });
      }
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Could not suggest structures');
    } finally {
      setSuggesting(false);
    }
  };

  const applySuggestion = (s) => {
    patchInputs({ squads: s.squads });
    setSuggestions(null);
    setResult(null);
    toast.success(`Applied a ${s.squadCount}-squad structure — solving`);
  };

  /* ---- narrative -------------------------------------------------------- */

  const writeNarrative = async () => {
    if (!result?.metrics) return;
    setNarrating(true);
    try {
      const res = await authedFetch('/api/restructure/narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenarioName: name,
          metrics: result.metrics,
          gaps: result.gaps,
          warnings: result.warnings
        })
      });
      const json = await res.json();
      if (json.narrative) setNarrative(json.narrative);
      else toast.error(json.error || 'The briefing could not be written just now');
    } catch (err) {
      console.error(err);
      toast.error('The briefing could not be written just now');
    } finally {
      setNarrating(false);
    }
  };

  /* ---- persistence ------------------------------------------------------ */

  const save = async () => {
    if (!inputs) return;

    // Name it on the way in. A plan seeded from the live timetable is called
    // "Current timetable (seeded)" until somebody says otherwise, so saving
    // three of them left three identically-named rows in the list and no way to
    // tell which was which. Only asked on the first save of a plan; re-saving a
    // named one just saves.
    let saveAs = name;
    if (!scenarioId) {
      const suggested = /seeded/i.test(name) ? '' : name;
      const typed = window.prompt(
        'Name this plan — something you will recognise in the list later, like "Two extra Thursday lanes".',
        suggested
      );
      if (typed === null) return;            // cancelled
      saveAs = typed.trim();
      if (!saveAs) { toast.error('A plan needs a name.'); return; }
      setName(saveAs);
    }

    setSaving(true);
    try {
      const res = await authedFetch('/api/restructure/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: scenarioId || undefined, name: saveAs, inputs })
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.details ? json.details[0] : (json.error || 'Save failed'));
        return null;
      }
      setScenarioId(json.scenario.id);
      setDirty(false);
      await loadScenarios();
      toast.success(`Saved as “${saveAs}”`);
      return json.scenario.id;
    } catch (err) {
      console.error(err);
      toast.error('Save failed');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const duplicate = () => {
    setScenarioId(null);
    setName(`${name} (copy)`);
    setDirty(true);
    toast.success('Duplicated — save to keep it');
  };

  const reseed = async () => {
    if (dirty && !window.confirm('Re-seeding replaces every slot and squad in this scenario with the live club data. Continue?')) return;
    const res = await authedFetch('/api/restructure/baseline?refresh=1');
    if (!res.ok) { toast.error('Could not re-seed'); return; }
    const json = await res.json();
    setBaseline(json.baseline);
    setInputs(json.seedInputs);
    setResult(null);
    setDirty(true);
    toast.success('Re-seeded from live data');
  };

  const remove = async () => {
    if (!scenarioId) return;
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const res = await authedFetch(`/api/restructure/scenarios?id=${scenarioId}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Delete failed'); return; }
    setScenarioId(null);
    setDirty(true);
    await loadScenarios();
    toast.success('Scenario deleted');
  };

  /* ---- coach roster ----------------------------------------------------- */

  const loadRoster = async () => {
    const res = await authedFetch('/api/restructure/coach-roster');
    if (!res.ok) { toast.error('Could not load the club roster'); return; }
    const json = await res.json();
    if (!json.coaches.length) {
      toast('Nothing saved to the club roster yet.', { icon: 'ℹ️' });
      return;
    }
    patchInputs({ coaches: json.coaches });
    setResult(null);
    toast.success(`Loaded ${json.count} coach${json.count === 1 ? '' : 'es'}`);
  };

  const saveRoster = async () => {
    const coaches = inputs?.coaches || [];
    if (!coaches.length) { toast.error('There is nobody on this roster to save'); return; }
    if (!window.confirm(`Save these ${coaches.length} coaches as the club roster? Anyone previously saved and now missing will be retired.`)) return;

    const res = await authedFetch('/api/restructure/coach-roster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coaches })
    });
    const json = await res.json();
    if (!res.ok) { toast.error(json.details ? json.details[0] : (json.error || 'Save failed')); return; }
    toast.success(`Saved ${json.saved} coach${json.saved === 1 ? '' : 'es'}${json.retired ? `, retired ${json.retired}` : ''}`);
  };

  /* ---- exports ---------------------------------------------------------- */

  const exportExcel = async () => {
    if (!inputs) return;
    setExporting(true);
    try {
      const res = await authedFetch('/api/export-restructure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scenarioId && !dirty ? { scenarioId } : { inputs, name })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.details ? err.details[0] : (err.error || 'Export failed'));
      }
      downloadBlob(await res.blob(), `restructure-${slug(name)}.xlsx`);
    } catch (err) {
      console.error('[Excel export]', err);
      toast.error(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const exportPdf = async () => {
    // The print view is rendered by a headless browser that reloads the page and
    // re-fetches the scenario by id, so unsaved editor state cannot survive the
    // round trip. Save first rather than silently printing a stale plan.
    let id = scenarioId;
    if (dirty || !id) {
      toast('Saving first — the print view is rendered from the saved scenario.', { icon: 'ℹ️' });
      id = await save();
      if (!id) return;
    }

    setExporting(true);
    try {
      const clientAuth = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('sb-') || key === 'print-insight-cache' || key === 'print-report-config')) {
          clientAuth[key] = localStorage.getItem(key);
        }
      }

      const res = await authedFetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetPath: `/restructure?scenario=${id}&view=print&printTheme=light`,
          clientAuth
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'PDF generation failed');
      }
      downloadBlob(await res.blob(), `restructure-${slug(name)}.pdf`);
    } catch (err) {
      console.error('[PDF export]', err);
      toast.error(err.message || 'PDF export failed');
    } finally {
      setExporting(false);
    }
  };

  /* ---- comparison ------------------------------------------------------- */

  const toggleCompare = async (id) => {
    if (compareIds.includes(id)) {
      setCompareIds(compareIds.filter(x => x !== id));
      return;
    }
    setCompareIds(compareIds.concat([id]));
    if (compareData[id]) return;

    const res = await authedFetch(`/api/restructure/scenarios?id=${id}`);
    if (!res.ok) { toast.error('Could not load that scenario'); return; }
    const json = await res.json();

    // Prefer the cached result; solve on demand if the scenario has never been run.
    let metrics = json.scenario.last_result?.metrics;
    if (!metrics) {
      const solveRes = await authedFetch('/api/restructure/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: json.scenario.inputs, scenarioId: id })
      });
      const solved = await solveRes.json();
      metrics = solved.metrics;
    }
    setCompareData(prev => ({ ...prev, [id]: { name: json.scenario.name, metrics } }));
  };

  const compareEntries = useMemo(() => {
    const current = result?.metrics
      ? [{ name: `${name}${dirty ? ' (unsaved)' : ''}`, metrics: result.metrics }]
      : [];
    const others = compareIds
      .filter(id => compareData[id] && id !== scenarioId)
      .map(id => compareData[id]);
    return current.concat(others);
  }, [result, name, dirty, compareIds, compareData, scenarioId]);

  /* ---- render ----------------------------------------------------------- */

  const metrics = result?.metrics;

  // The in-progress model, shaped like a saved scenario's summary so the models
  // view can render it in the same card as everything else.
  const modelSummary = useMemo(() => {
    if (!metrics) return null;
    return {
      total: metrics.total,
      utilisationPct: metrics.utilisationPct,
      occupancyPct: metrics.occupancyPct,
      swimmersServed: metrics.swimmersServed,
      unservedDemand: metrics.unservedDemand,
      availableLaneHours: metrics.availableLaneHours,
      newLaneHoursGained: metrics.newLaneHoursGained,
      ltadCompliancePct: metrics.ltadCompliancePct,
      squadCount: metrics.squadCount,
      squadsMeetingRequirement: metrics.squadsMeetingRequirement,
      swimmerSessionsRequired: metrics.swimmerSessionsRequired,
      swimmerSessionsDelivered: metrics.swimmerSessionsDelivered,
      coachGapHours: metrics.coach?.gapHours ?? null,
      coachCoveragePct: metrics.coach?.coveragePct ?? null,
      bands: (metrics.bySquad || []).map(s => ({
        name: s.name, minAge: s.minAge, maxAge: s.maxAge,
        targetSize: s.targetSize, sessions: s.sessionsTarget,
        hours: s.effectiveTargetHours, requirementMet: s.requirementMet
      }))
    };
  }, [metrics]);

  /**
   * Has the club's real timetable moved since this scenario was seeded?
   *
   * A scenario deliberately holds its own copy of the slots — that is what
   * makes it a what-if rather than a live view. The failure mode is editing the
   * timetable in Config, coming back here, and quietly modelling the old one.
   * So the drift is detected and shown rather than left to be discovered.
   */
  const drift = useMemo(() => {
    if (!baseline || !inputs?.poolSlots) return null;

    const live = baseline.sessions.filter(s => s.isActive && s.day && s.day !== 'Unknown');
    const liveById = {};
    live.forEach(s => { liveById[s.id] = s; });

    const seeded = inputs.poolSlots.filter(s => s.source === 'existing' && s.existingSessionId);
    const seededIds = new Set(seeded.map(s => s.existingSessionId));

    const added = live.filter(s => !seededIds.has(s.id));
    const removed = seeded.filter(s => !liveById[s.existingSessionId]);
    const changed = seeded.filter(s => {
      const l = liveById[s.existingSessionId];
      if (!l) return false;
      return l.startTime !== s.startTime
        || l.endTime !== s.endTime
        || Number(l.lanes) !== Number(s.lanes)
        || (l.location || 'Unspecified') !== (s.venue || 'Unspecified')
        || l.day !== s.day;
    });

    const total = added.length + removed.length + changed.length;
    return total > 0 ? { added, removed, changed, total } : null;
  }, [baseline, inputs]);

  const goals = inputs?.goals || [];
  const goalResults = useMemo(
    () => (metrics && baseline ? scoreGoals(goals, metrics, baseline) : []),
    [goals, metrics, baseline]);

  const toggleGoal = key => {
    const next = goals.includes(key) ? goals.filter(g => g !== key) : goals.concat([key]);
    const weights = weightsForGoals(next);
    patchInputs(weights ? { goals: next, weights } : { goals: next, weights: {} });
    setResult(null);
  };

  /* ---- changes made for you --------------------------------------------- */

  // The wizard and the assistant both change the scenario through the same
  // named operations, applied by the same pure function the server uses. A
  // second path that built slots or squads its own way would be a second place
  // for the two to disagree about what a valid scenario looks like.
  const runOps = (ops, { announce = true } = {}) => {
    const { inputs: next, applied, rejected } = applyPatch(inputs, ops);
    rejected.forEach(r => toast.error(r));
    if (!applied.length) return false;
    setInputs(next);
    setDirty(true);
    setResult(null);
    if (announce) toast.success(applied.join(' '));
    return true;
  };

  // The assistant has already had these inputs solved server-side, so they are
  // taken whole rather than re-derived — re-running the operations here could
  // land somewhere the user was never shown.
  const applyAssistantInputs = next => {
    setInputs(next);
    setDirty(true);
    setResult(null);
    toast.success('Applied — re-solving');
  };

  const summary = useMemo(
    () => (metrics && baseline ? summariseModel(metrics, baseline, { name }) : null),
    [metrics, baseline, name]);

  const venues = useMemo(() => {
    const fromBase = baseline?.venues || [];
    const fromSlots = (inputs?.poolSlots || []).map(s => s.venue).filter(Boolean);
    return Array.from(new Set(fromBase.concat(fromSlots))).sort();
  }, [baseline, inputs]);

  /* ---- the two weeks ----------------------------------------------------
   *
   * Each is drawn once, under its own heading, by the same renderer. There is
   * deliberately no current/proposed toggle: the old one defaulted to "current"
   * whenever a baseline existed, and print cannot set React state, so every PDF
   * showed the club's existing timetable under a heading meaning the proposal.
   */
  const todayItems = useMemo(
    () => itemsFromSessions(baseline, { venue: todayVenue }),
    [baseline, todayVenue]);

  const planItems = useMemo(
    () => itemsFromPlan(result).concat(itemsFromSlots(inputs?.poolSlots || [], result)),
    [result, inputs]);

  const notEnoughWater = result?.diagnostics?.demandVsSupply
    && !result.diagnostics.demandVsSupply.feasible;
  const coachGapCount = result?.gaps?.coach?.length || 0;

  if (loading) {
    return (
      <Layout session={session}>
        <Head><title>Scenario Planner | CoachesEye</title></Head>
        <div style={{ padding: '5rem', textAlign: 'center' }}>
          <p style={{ fontWeight: 900, letterSpacing: '0.12em', color: 'var(--text-secondary)' }}>
            MODELLING AVAILABLE WATER…
          </p>
        </div>
      </Layout>
    );
  }

  const show = key => isPrint || activeTab === key;


  return (
    <Layout session={session}>
      <Head><title>Scenario Planner | CoachesEye</title></Head>

      <div style={{ borderTop: '4px solid var(--accent-cyan)', paddingTop: '1.75rem', marginBottom: '1.5rem' }}>
        <div style={{
          fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.18em',
          color: 'var(--text-secondary)', marginBottom: '0.5rem'
        }}>
          POOL TIME &amp; SQUAD STRUCTURE
        </div>
        <h1 style={{ fontSize: '3.5rem', fontWeight: 950, lineHeight: 1, margin: 0 }}>
          Scenario <span style={{ color: 'var(--accent-cyan)' }}>Planner</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '62ch', marginTop: '0.9rem', lineHeight: 1.55 }}>
          {isPrint ? name : 'A what-if for pool time and squads. Nothing here changes the club record until you press Save, and nothing here changes the club timetable at all.'}
        </p>
      </div>

      {!isPrint && (
        <div className="glass-card no-print rp-bar">
          <select
            className="rp-select"
            value={scenarioId || ''}
            onChange={e => (e.target.value ? loadScenario(e.target.value) : reseed())}
          >
            <option value="">— Seeded from live data —</option>
            {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <input
            className="rp-name" type="text" value={name}
            onChange={e => { setName(e.target.value); setDirty(true); }}
          />

          {dirty && <span className="rp-dirty">UNSAVED</span>}

          {/*
            Seven equally-weighted buttons made the two that matter — Solve and
            Save — no more prominent than Delete. The rest go behind two native
            disclosures: no dependency, keyboard-accessible for nothing.
          */}
          <div className="rp-actions">
            <button type="button" className="btn-premium-action" onClick={() => solve()} disabled={solving}>
              {solving ? 'Solving…' : 'Solve'}
            </button>
            <button type="button" className="btn-premium-intel" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>

            <details className="rp-menu">
              <summary className="rp-btn">Export</summary>
              <div className="rp-menu-body glass-card">
                <button type="button" className="rp-menu-item" onClick={exportExcel}
                  disabled={exporting || !metrics}>Spreadsheet</button>
                <button type="button" className="rp-menu-item" onClick={exportPdf}
                  disabled={exporting || !metrics}>PDF report</button>
              </div>
            </details>

            <details className="rp-menu">
              <summary className="rp-btn">More</summary>
              <div className="rp-menu-body glass-card">
                <button type="button" className="rp-menu-item" onClick={duplicate}>Duplicate this plan</button>
                <button type="button" className="rp-menu-item" onClick={reseed}>Re-seed from live data</button>
                {scenarioId && (
                  <button type="button" className="rp-menu-item rp-menu-danger" onClick={remove}>Delete this plan</button>
                )}
              </div>
            </details>
          </div>
        </div>
      )}

      {summary && <div style={{ marginTop: '1.5rem' }}><ModelVerdict summary={summary} /></div>}

      {drift && !isPrint && (
        <div className="glass-card rp-alert rp-drift no-print">
          <strong>
            The club timetable has changed since this model was seeded
            — {drift.total} difference{drift.total === 1 ? '' : 's'}.
          </strong>
          <ul>
            {drift.added.length > 0 && (
              <li>{drift.added.length} session{drift.added.length === 1 ? '' : 's'} in Config that this model does not have
                {' '}({drift.added.slice(0, 3).map(s => s.name).join(', ')}{drift.added.length > 3 ? '…' : ''})</li>
            )}
            {drift.changed.length > 0 && (
              <li>{drift.changed.length} session{drift.changed.length === 1 ? '' : 's'} whose time, lanes, day or venue now differ
                {' '}({drift.changed.slice(0, 3).map(s => s.label).join(', ')}{drift.changed.length > 3 ? '…' : ''})</li>
            )}
            {drift.removed.length > 0 && (
              <li>{drift.removed.length} session{drift.removed.length === 1 ? '' : 's'} in this model that no longer exist</li>
            )}
          </ul>
          <p>
            A model keeps its own copy of the slots on purpose — that is what makes it a
            what-if rather than a live view. Re-seed to pull the current timetable in,
            which replaces every slot and squad in this model.
          </p>
          <button type="button" className="btn-premium-action" onClick={reseed}>
            Re-seed from live data
          </button>
        </div>
      )}

      {result?.errors?.length > 0 && (
        <div className="glass-card rp-alert rp-alert-error">
          <strong>This scenario cannot be solved yet.</strong>
          <ul>{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}

      {(result?.warnings?.length > 0 || baseline?.warnings?.length > 0) && (
        // The only warnings surface on the page. The Club Today tab used to
        // carry its own copy of the baseline half under a different heading.
        <details className="glass-card rp-alert">
          <summary>
            {(result?.warnings?.length || 0) + (baseline?.warnings?.length || 0)}
            {' '}things to know about the figures on this page
          </summary>

          {baseline?.warnings?.length > 0 && (
            <>
              <div className="rp-warn-head">About the club record</div>
              <ul>{baseline.warnings.map((w, i) => <li key={`b${i}`}>{w}</li>)}</ul>
            </>
          )}

          {result?.warnings?.length > 0 && (
            <>
              <div className="rp-warn-head">About this plan</div>
              <ul>{result.warnings.map((w, i) => <li key={`r${i}`}>{w}</li>)}</ul>
            </>
          )}
        </details>
      )}

      <div className="section-divider" />

      {!isPrint && (
        <div className="period-selector-premium" style={{ marginBottom: '1.75rem' }}>
          {TABS.map(t => (
            <button
              key={t.key} type="button"
              className={`period-btn-premium${activeTab === t.key ? ' active' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >{t.label}</button>
          ))}
        </div>
      )}

      {/* ---- 1. THE PLAN ------------------------------------------------ */}

      {show('plan') && (
        <Section
          title="The Plan"
          sub="The week this structure would produce, and what it would take to run it."
        >
          <WeekView
            items={planItems}
            note="Each block is a squad in a booking. Dashed blocks are water this plan put nothing into."
            emptyMessage={inputs ? 'NOTHING SCHEDULED YET — PRESS SOLVE' : 'LOADING'}
          />

          {(notEnoughWater || result?.gaps?.capacity?.length > 0
            || result?.diagnostics?.unusableSlots?.length > 0 || coachGapCount > 0) && (
            <div className="glass-card rp-panel" style={{ marginTop: '1.5rem' }}>
              <div className="rp-sub">Where this plan falls short</div>

              {notEnoughWater && (
                <p className="rp-shortfall">
                  <strong>There is not enough water for the structure as designed.</strong>{' '}
                  It needs {result.diagnostics.demandVsSupply.requiredLaneHours} lane-hours;
                  these slots supply {result.diagnostics.demandVsSupply.availableLaneHours}.
                  Short by {result.diagnostics.demandVsSupply.shortfallLaneHours}.
                </p>
              )}

              {result?.gaps?.capacity?.length > 0 && (
                <ul className="rp-list">
                  {result.gaps.capacity.map(g => <li key={g.squadId}>{g.message}</li>)}
                </ul>
              )}

              {/* One line, not the whole table. The coach gaps live on Build →
                  Coaches, beside the roster you would change to close them. */}
              {coachGapCount > 0 && (
                <p className="rp-pointer">
                  {coachGapCount} session{coachGapCount === 1 ? '' : 's'} would run without
                  enough coaches{metrics?.coach ? `, ${metrics.coach.gapHours} coach-hours a week in total` : ''}.
                  {!isPrint && (
                    <button type="button" className="rp-link"
                      onClick={() => setActiveTab('build')}>See them under Coaches</button>
                  )}
                </p>
              )}

              {result?.diagnostics?.unusableSlots?.length > 0 && (
                <>
                  <div className="rp-sub rp-sub-inner">Water nothing could be put into</div>
                  <ul className="rp-list">
                    {result.diagnostics.unusableSlots.map(s => (
                      <li key={s.slotId}>
                        <strong>{s.label}</strong> ({s.day} {s.startTime}–{s.endTime}, {s.venue}, {s.lanes} lanes)
                        {s.reasons.length > 0 && <div className="rp-reason">{s.reasons[0]}</div>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {metrics?.bySquad?.length > 0 && (
            <div className="glass-card rp-table-wrap">
              <div className="rp-sub">Squad by squad</div>
              <table className="stats-table-glass" style={{ minWidth: '760px' }}>
                <thead>
                  <tr>
                    <th>Squad</th>
                    <th><Term k="swimmingAge">Ages</Term></th>
                    <th>Sessions</th><th>Hours/wk</th>
                    <th><Term k="place">Places</Term> / needed</th>
                    <th><Term k="fullTrainingWeek">Full week</Term></th>
                    <th><Term k="swimmersCovered">Covered</Term></th>
                    <th><Term k="roomForMore">Room for more</Term></th>
                    <th><Term k="volumeFit" /></th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.bySquad.map(s => (
                    <tr key={s.squadId}>
                      <td style={{ fontWeight: 800 }}>{s.name}</td>
                      <td>{s.minAge}–{s.maxAge}</td>
                      <td style={{ color: s.unscheduled ? 'var(--accent-rose)' : 'inherit' }}>
                        {s.sessionsAssigned} / {s.sessionsTarget}
                      </td>
                      <td>{s.effectiveTargetHours}{s.targetHoursDerived ? '*' : ''}</td>
                      <td>{s.weeklyPlaces} / {s.swimmerSessionsRequired}</td>
                      <td
                        style={{
                          fontWeight: 800,
                          color: s.requirementMet ? 'var(--accent-emerald)' : 'var(--accent-rose)'
                        }}
                        title={s.requirementReason}
                      >
                        {s.requirementMet ? 'YES' : `SHORT ${s.placesShortfall || ''} places`}
                      </td>
                      <td style={{ color: s.unserved > 0 ? 'var(--accent-amber)' : 'inherit' }}>
                        {s.served} / {s.targetSize}
                      </td>
                      <td style={{
                        fontWeight: s.roomForMore > 0 ? 900 : 600,
                        color: s.roomForMore > 0 ? 'var(--accent-emerald)' : 'var(--text-secondary)'
                      }}>
                        {s.sessionsTarget === 0 ? '—'
                          : s.roomForMore > 0 ? `+${s.roomForMore}`
                            : s.unserved > 0 ? 'full' : '0'}
                      </td>
                      <td>
                        {s.competitive
                          ? `${LTAD_VERDICT_LABELS[s.ltadVerdict] || s.ltadVerdict}${s.ltadGapHours !== 0 ? ` (${s.ltadGapHours > 0 ? '+' : ''}${s.ltadGapHours}h)` : ''}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="rp-foot">
                * weekly hours derived from sessions × session length, because the club record
                holds zero for that squad. Volume fit shows the gap to the training volume guide
                the squad&apos;s ages imply — the club&apos;s targets sit below it by design, so
                read the gap as context, not a failure.
              </p>
            </div>
          )}

          <div className="glass-card rp-panel">
            <div className="rp-narrative-head">
              <div className="rp-sub" style={{ margin: 0 }}>
                Written briefing — drafted by AI from the figures above
              </div>
              {!isPrint && (
                <button type="button" className="btn-premium-intel" onClick={writeNarrative}
                  disabled={narrating || !metrics}>
                  {narrating ? 'Writing…' : narrative ? 'Rewrite' : 'Write briefing'}
                </button>
              )}
            </div>
            {narrative ? (
              <div className="rp-markdown"><ReactMarkdown>{narrative}</ReactMarkdown></div>
            ) : (
              <p className="rp-foot" style={{ padding: 0 }}>
                A plain-English write-up of this plan for people who will not read a timetable.
                Every figure in it is quoted from the analysis above, never recalculated.
              </p>
            )}
          </div>

          {inputs && !isPrint && (
            <div style={{ marginTop: '1.5rem' }}>
              <ModelAssistant inputs={inputs} scenarioName={name} onApply={applyAssistantInputs} />
            </div>
          )}

          {!isPrint && <div style={{ marginTop: '1.5rem' }}><GlossaryPanel /></div>}
        </Section>
      )}

      {/* ---- 2. THE CLUB TODAY ------------------------------------------ */}

      {baseline && show('today') && (
        <Section
          title="The Club Today"
          sub="Read straight from the club record. Nothing on this tab is a model, and nothing on it can be edited."
        >
          <AsIsBriefing
            report={asIs}
            narrative={asIsNarrative}
            writing={asIsWriting}
            onNarrative={writeAsIs}
            days={asIsDays}
            onDaysChange={setAsIsDays}
            termOnly={asIsTermOnly}
            onTermOnlyChange={setAsIsTermOnly}
            loading={asIsLoading}
          />

          <CurrentStructure baseline={baseline} />

          <div className="rp-week-head">The week, hour by hour</div>
          <WeekView
            items={todayItems}
            showAttendance
            laneStrips
            venues={baseline.venues}
            venue={todayVenue}
            onVenueChange={setTodayVenue}
            note="The club timetable as it stands. Hold this up against your published one."
            emptyMessage="NO SESSIONS WITH A USABLE DAY AND TIME"
          />
        </Section>
      )}

      {/* ---- 3. BUILD THE PLAN ------------------------------------------ */}

      {inputs && show('build') && (
        <Section
          title="Build the Plan"
          sub="Work down the page. Each step feeds the one below it, and the verdict at the top of the screen updates every time you press Solve."
        >
          <SubSection n={1} title="What is this plan for?" defaultOpen forceOpen={isPrint}
            sub="Sets what the search aims at, and what each proposal is then judged against.">
            <GoalPicker goals={goals} goalResults={goalResults} onToggleGoal={toggleGoal} />
          </SubSection>

          <SubSection n={2} title="What pool time might we have?" defaultOpen forceOpen={isPrint}
            sub="The club's current sessions are already loaded. Add any water you are considering taking.">
            <ScenarioSlotEditor
              slots={inputs.poolSlots || []}
              venues={venues}
              // Compared against the water that can actually appear in this
              // list. Sessions with no weekday in the club record are dropped
              // when a plan is seeded, so measuring against the club's full
              // total reported a loss on a plan nobody had touched yet.
              baselineLaneHours={Math.round(
                ((baseline?.utilisation?.totalLaneHours || 0)
                  - (baseline?.utilisation?.undatedLaneHours || 0)) * 10) / 10}
              solvedLaneHours={metrics?.availableLaneHours ?? null}
              stale={dirty || !metrics}
              onChange={poolSlots => patchInputs({ poolSlots })}
              onAddBlock={op => runOps([op])}
            />
          </SubSection>

          <SubSection n={3} title="What is allowed to change?" defaultOpen forceOpen={isPrint}
            sub="Hold anything that must stay as it is, and choose how swimmers should be grouped.">
            <SquadLockPills
              squads={inputs.squads || []}
              onToggleLock={id => patchInputs({
                squads: (inputs.squads || []).map(sq =>
                  sq.id === id ? { ...sq, locked: !sq.locked } : sq)
              })}
              onSetAllLocked={locked => patchInputs({
                squads: (inputs.squads || []).map(sq => ({ ...sq, locked }))
              })}
            />
            <div style={{ marginTop: '1.4rem' }}>
              <BandAxisPicker bandBy={bandBy} onBandByChange={setBandBy}
                capability={baseline?.capability} />
            </div>
          </SubSection>

          <SubSection n={4} title="Let the solver propose structures" defaultOpen forceOpen={isPrint}
            sub="Every way of cutting the club into squads, enumerated and scored against your goals and your pool time.">
            <StructureSearch
              suggestions={suggestions}
              suggesting={suggesting}
              onSuggest={suggest}
              onApplySuggestion={applySuggestion}
            />
          </SubSection>

          <SubSection n={5} title="Squads by hand" forceOpen={isPrint}
            sub="Edit the bands directly when the search has not given you what you want.">
            <ScenarioSquadEditor
              squads={inputs.squads || []}
              ageHistogram={baseline?.clubAgeHistogram || {}}
              ltadTable={inputs.policy?.ltadTable || 'unified'}
              onChange={squads => patchInputs({ squads })}
            />
          </SubSection>

          <SubSection n={6} title="Coaches" forceOpen={isPrint}
            sub="Who is available, and where the week cannot be staffed.">
            <ScenarioCoachEditor
              coaches={inputs.coaches || []}
              squads={inputs.squads || []}
              venues={venues}
              coachMetrics={metrics?.coach}
              gaps={result?.gaps?.coach}
              onChange={coaches => patchInputs({ coaches })}
              onLoadRoster={isPrint ? null : loadRoster}
              onSaveRoster={isPrint ? null : saveRoster}
            />
          </SubSection>

          <SubSection n={7} title="Assumptions" forceOpen={isPrint}
            sub="Every rule the search runs on. The defaults are a starting point, not a policy.">
            <ScenarioAssumptions
              policy={inputs.policy}
              weights={inputs.weights}
              growth={inputs.growth}
              onChange={patchInputs}
            />
          </SubSection>
        </Section>
      )}

      {/* ---- 4. COMPARE ------------------------------------------------- */}

      {show('compare') && (
        <Section
          title="Compare"
          sub="This plan against the alternatives, on the same four figures you have been reading all along."
        >
          <ScenarioComparison
            entries={compareEntries}
            selectedIds={compareIds}
            onToggle={toggleCompare}
            available={scenarios.filter(s => s.id !== scenarioId)}
            printAll={isPrint}
          />
        </Section>
      )}

      {isPrint && <GlossaryAppendix />}

      <style jsx>{`
        .rp-warn-head {
          font-size: 0.56rem; font-weight: 900; letter-spacing: 0.12em;
          text-transform: uppercase; color: var(--accent-cyan);
          margin: 0.9rem 0 0.35rem;
        }
        .rp-menu { position: relative; }
        .rp-menu > summary { list-style: none; display: inline-block; }
        .rp-menu > summary::-webkit-details-marker { display: none; }
        .rp-menu > summary::after { content: ' ▾'; opacity: 0.6; }
        .rp-menu-body {
          position: absolute; top: calc(100% + 5px); right: 0; z-index: 20;
          display: flex; flex-direction: column; min-width: 190px; padding: 5px;
        }
        .rp-menu-item {
          background: transparent; border: none; border-radius: 7px; cursor: pointer;
          padding: 8px 11px; text-align: left; color: inherit;
          font-size: 0.76rem; font-weight: 700; white-space: nowrap;
        }
        .rp-menu-item:hover:not(:disabled) { background: rgba(var(--accent-cyan-rgb), 0.12); }
        .rp-menu-item:disabled { opacity: 0.4; cursor: not-allowed; }
        .rp-menu-danger { color: var(--accent-rose); }
        .rp-week-head {
          font-size: 0.58rem; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--text-secondary); margin: 2rem 0 0.8rem;
        }
        .rp-sub-inner { margin-top: 1.2rem; }
        .rp-shortfall { font-size: 0.8rem; line-height: 1.6; margin: 0 0 0.8rem; }
        .rp-pointer { font-size: 0.8rem; line-height: 1.6; margin: 0.6rem 0 0; }
        .rp-link {
          background: none; border: none; padding: 0 0 0 0.4rem; cursor: pointer;
          color: var(--accent-cyan); font: inherit; font-weight: 800;
          text-decoration: underline;
        }
        .rp-bar {
          display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;
          padding: 0.9rem 1.15rem;
        }
        .rp-select, .rp-name {
          padding: 8px 11px; border-radius: 8px;
          border: 1px solid var(--glass-border); background: var(--glass-bg);
          color: inherit; font-weight: 700; font-size: 0.85rem;
        }
        .rp-select { min-width: 200px; }
        .rp-name { flex: 1; min-width: 180px; }
        .rp-dirty {
          padding: 3px 8px; border-radius: 5px; background: var(--accent-amber); color: #000;
          font-size: 0.58rem; font-weight: 900; letter-spacing: 0.08em;
        }
        .rp-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-left: auto; }
        .rp-btn {
          background: transparent; border: 1px solid var(--glass-border); border-radius: 8px;
          color: var(--text-secondary); cursor: pointer; padding: 7px 13px;
          font-size: 0.76rem; font-weight: 800;
        }
        .rp-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .rp-btn-danger:hover { color: var(--accent-rose); border-color: var(--accent-rose); }
        .rp-alert { padding: 1rem 1.35rem; margin-top: 1.25rem; font-size: 0.82rem; }
        .rp-alert ul { margin: 0.6rem 0 0; padding-left: 1.15rem; line-height: 1.6; }
        .rp-alert summary { cursor: pointer; font-weight: 800; color: var(--text-secondary); }
        .rp-alert-error { border-left: 3px solid var(--accent-rose); }
        .rp-drift { border-left: 3px solid var(--accent-amber); }
        .rp-drift p {
          margin: 0.7rem 0 0.9rem; line-height: 1.6; color: var(--text-secondary);
          font-size: 0.78rem; max-width: 78ch;
        }
        .rp-panel { padding: 1.25rem 1.5rem; margin-top: 1.5rem; }
        .rp-table-wrap { padding: 0.5rem; margin-top: 1.5rem; overflow-x: auto; }
        .rp-sub {
          font-size: 0.62rem; font-weight: 900; letter-spacing: 0.12em;
          color: var(--text-secondary); margin-bottom: 0.7rem;
        }
        .rp-list { margin: 0; padding-left: 1.15rem; line-height: 1.7; font-size: 0.82rem; }
        .rp-reason { font-size: 0.7rem; color: var(--text-secondary); }
        .rp-foot {
          font-size: 0.68rem; color: var(--text-secondary); line-height: 1.5;
          padding: 0.85rem 1rem 0.3rem; margin: 0;
        }
        .rp-suggest {
          display: flex; align-items: center; justify-content: space-between;
          gap: 1.5rem; flex-wrap: wrap; padding: 1.15rem 1.4rem; margin-bottom: 1.5rem;
        }
        .rp-suggest-note {
          font-size: 0.72rem; line-height: 1.55; color: var(--text-secondary);
          margin: 0; max-width: 68ch;
        }
        .rp-suggestions { padding: 1.15rem 1.4rem; margin-bottom: 1.5rem; overflow-x: auto; }
        .rp-narrative-head {
          display: flex; align-items: center; justify-content: space-between;
          gap: 1rem; margin-bottom: 0.9rem;
        }
        .rp-markdown { font-size: 0.86rem; line-height: 1.65; }
        .rp-markdown :global(h2), .rp-markdown :global(h3) {
          font-size: 0.72rem; font-weight: 900; letter-spacing: 0.1em;
          text-transform: uppercase; color: var(--accent-cyan);
          margin: 1.3rem 0 0.5rem;
        }
        .rp-markdown :global(p) { margin: 0 0 0.9rem; }
        .rp-markdown :global(strong) { font-weight: 900; }
        .rp-markdown :global(ul) { padding-left: 1.2rem; margin: 0 0 0.9rem; }
      `}</style>
    </Layout>
  );
}

/**
 * A tab, with a heading that is actually rendered.
 *
 * The old version only emitted its <h2> when a `show` prop was truthy, and every
 * interactive call site passed `show={isPrint}`. The result: in the app, no tab
 * ever carried a heading, and the only label for a slab of content was a small
 * pill in the tab bar above it. Print was the one place it worked.
 *
 * The `sub` line is where a committee member is told, in one sentence, what they
 * are looking at.
 */
function Section({ title, sub, children }) {
  return (
    <section style={{ marginBottom: '2.5rem' }}>
      <h2 className="section-title" style={{ marginBottom: sub ? '0.6rem' : '1.25rem' }}>
        {title}
      </h2>
      {sub && <p className="rp-section-sub">{sub}</p>}
      {children}

      <style jsx>{`
        .rp-section-sub {
          font-size: 0.82rem; line-height: 1.55; color: var(--text-secondary);
          max-width: 76ch; margin: 0 0 1.5rem; font-weight: 600;
        }
      `}</style>
    </section>
  );
}

function SubSection({ n, title, sub, defaultOpen = false, forceOpen = false, children }) {
  const [open, setOpen] = useState(Boolean(defaultOpen || forceOpen));
  return (
    <details className="rp-subsection glass-card" open={open}
      onToggle={e => setOpen(e.currentTarget.open)}>
      <summary>
        <span className="rp-n">{n}</span>
        <span className="rp-t">{title}</span>
      </summary>
      {sub && <p className="rp-s">{sub}</p>}
      <div className="rp-b">{children}</div>

      <style jsx>{`
        .rp-subsection { padding: 1rem 1.3rem; margin-bottom: 0.9rem; }
        .rp-subsection > summary {
          cursor: pointer; list-style: none;
          display: flex; align-items: center; gap: 0.75rem;
        }
        .rp-subsection > summary::marker { content: ''; }
        .rp-n {
          display: inline-flex; align-items: center; justify-content: center;
          width: 24px; height: 24px; border-radius: 50%; flex: none;
          background: var(--glass-bg); border: 1px solid var(--glass-border);
          font-size: 0.68rem; font-weight: 900; color: var(--accent-cyan);
        }
        .rp-subsection[open] .rp-n {
          background: var(--accent-cyan); color: #000; border-color: var(--accent-cyan);
        }
        .rp-t { font-size: 0.95rem; font-weight: 900; }
        .rp-s {
          font-size: 0.76rem; line-height: 1.55; font-weight: 600;
          color: var(--text-secondary); margin: 0.65rem 0 0 2.95rem; max-width: 74ch;
        }
        .rp-b { margin-top: 1.2rem; }
        @media print {
          .rp-subsection { border: none; page-break-inside: avoid; }
        }
      `}</style>
    </details>
  );
}


function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function slug(text) {
  return String(text).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'scenario';
}
