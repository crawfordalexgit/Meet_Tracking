import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { useRouter } from 'next/router';

export default function Settings({ session }) {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [scmKey, setScmKey] = useState('');
  const [syncStatus, setSyncStatus] = useState(null);
  const [swimmingYear, setSwimmingYear] = useState('2025/2026');
  const [scrapeStatus, setScrapeStatus] = useState(null);
  const [scrapeProgress, setScrapeProgress] = useState(0);
  const [isScraping, setIsScraping] = useState(false);
  
  const [attendanceScrapeStatus, setAttendanceScrapeStatus] = useState(null);
  const [attendanceScrapeProgress, setAttendanceScrapeProgress] = useState(0);
  const [isAttendanceScraping, setIsAttendanceScraping] = useState(false);

  const [joinDateSyncStatus, setJoinDateSyncStatus] = useState(null);
  const [joinDateSyncProgress, setJoinDateSyncProgress] = useState(0);
  const [isJoinDateSyncing, setIsJoinDateSyncing] = useState(false);

  const [coaches, setCoaches] = useState([]);
  const [squads, setSquads] = useState([]);
  const [coachSquads, setCoachSquads] = useState([]);
  const [meets, setMeets] = useState([]);
  const [meetSearch, setMeetSearch] = useState('');
  const [swimmers, setSwimmers] = useState([]);
  const [swimmerSearch, setSwimmerSearch] = useState('');
  const [squadFilter, setSquadFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  
  const [debugLog, setDebugLog] = useState(null);

  const [activePanel, setActivePanel] = useState('system');
  const [attendanceSyncStatus, setAttendanceSyncStatus] = useState(null);
  const [csvFile, setCsvFile] = useState(null);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvMapping, setCsvMapping] = useState({ date: '', swimmer: '', session: '' });
  const [importStatus, setImportStatus] = useState(null);

  useEffect(() => {
    if (session) checkAdmin();
  }, [session]);

  const handleSyncAttendance = async () => {
    setAttendanceSyncStatus({ type: 'info', text: 'Syncing Training Attendance...' });
    try {
      const res = await fetch('/api/sync-attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scmApiKey: scmKey })
      });
      const data = await res.json();
      setAttendanceSyncStatus({ 
        type: res.ok ? 'success' : 'error', 
        text: data.message || data.error 
      });
    } catch (err) {
      setAttendanceSyncStatus({ type: 'error', text: err.message });
    }
  };

  const handleCsvFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCsvFile(file);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text.split('\n');
      if (lines.length > 0) {
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        setCsvHeaders(headers);
      }
    };
    reader.readAsText(file);
  };

  const processImport = async () => {
    if (!csvFile || !csvMapping.date || !csvMapping.swimmer) {
      setImportStatus({ type: 'error', text: 'Please select a file and map Date and Swimmer columns.' });
      return;
    }

    setImportStatus({ type: 'info', text: 'Processing CSV... This may take a while.' });
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target.result;
      const lines = text.split('\n').filter(l => l.trim());
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      
      const dateIdx = headers.indexOf(csvMapping.date);
      const swimmerIdx = headers.indexOf(csvMapping.swimmer);
      const sessionIdx = headers.indexOf(csvMapping.session);

      const records = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length < 2) continue;
        records.push({
          date: cols[dateIdx],
          swimmerName: cols[swimmerIdx],
          sessionName: sessionIdx >= 0 ? cols[sessionIdx] : 'Imported Session'
        });
      }

      // Send to import API (we will create this)
      const res = await fetch('/api/import-attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records })
      });
      
      const data = await res.json();
      setImportStatus({ type: res.ok ? 'success' : 'error', text: data.message || data.error });
      if (res.ok) setCsvFile(null);
    };
    reader.readAsText(csvFile);
  };

  const checkAdmin = async () => {
    const { data } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
    if (['admin', 'headcoach'].includes(data?.role)) {
      setIsAuthorized(true);
      loadData();
    } else {
      router.push('/');
    }
    setLoading(false);
  };

  const loadData = async () => {
    const [profilesRes, squadsRes, csRes, meetsRes, swimmersRes] = await Promise.all([
      supabase.from('profiles').select('*').order('email'),
      supabase.from('squads').select('*').order('name'),
      supabase.from('coach_squads').select('*'),
      supabase.from('meets').select('*').order('date', { ascending: false }),
      supabase.from('swimmers').select('*, squads(name)').order('full_name')
    ]);

    if (profilesRes.data) setCoaches(profilesRes.data);
    if (squadsRes.data) setSquads(squadsRes.data);
    if (csRes.data) setCoachSquads(csRes.data);
    if (meetsRes.data) setMeets(meetsRes.data);
    if (swimmersRes.data) setSwimmers(swimmersRes.data);
  };

  const toggleExempt = async (swimmerId, isExempt) => {
    setDebugLog(`Saving ${isExempt ? 'Exemption' : 'Inclusion'} for ID: ${swimmerId}...`);
    
    const { error } = await supabase.from('swimmers').update({ is_exempt: isExempt }).eq('id', swimmerId);
    
    if (error) {
      setDebugLog(`DB ERROR: ${error.message}`);
      return;
    }

    // Double-check: Re-fetch this swimmer to see if it actually saved
    const { data: verifiedSwimmer } = await supabase.from('swimmers').select('is_exempt').eq('id', swimmerId).single();
    
    if (verifiedSwimmer && verifiedSwimmer.is_exempt !== isExempt) {
      setDebugLog('VERIFICATION FAILED: Database still shows old value. Possible RLS blocking update.');
      return;
    }

    setDebugLog(`Success! Verified ${isExempt ? 'Exempted' : 'Included'} in DB.`);
    setSwimmers(swimmers.map(s => s.id === swimmerId ? { ...s, is_exempt: isExempt } : s));
  };

  const toggleMeetType = async (meetId, type) => {
    setMeets(meets.map(m => m.id === meetId ? { ...m, type } : m));
    await supabase.from('meets').update({ type }).eq('id', meetId);
  };

  const handleSyncScm = async (e) => {
    e.preventDefault();
    setSyncStatus({ type: 'info', text: 'Syncing...' });
    const res = await fetch('/api/sync-scm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scmApiKey: scmKey }) });
    const data = await res.json();
    setSyncStatus({ type: res.ok ? 'success' : 'error', text: data.message || data.error });
    if (res.ok) loadData();
  };

  const handleScrape = async (e) => {
    e.preventDefault();
    setIsScraping(true);
    setScrapeProgress(0);
    const response = await fetch('/api/scrape-meets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ swimmingYear }) });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (line.trim().startsWith('data: ')) {
          try {
            const data = JSON.parse(line.trim().substring(6));
            setScrapeStatus({ type: data.error ? 'error' : 'info', text: data.message });
            setScrapeProgress(data.progress);
            if (data.isDone) { setIsScraping(false); loadData(); }
          } catch (e) {}
        }
      }
    }
  };

  const handleHistoricalAttendanceSync = async (e) => {
    e.preventDefault();
    setIsAttendanceScraping(true);
    setAttendanceScrapeStatus({ type: 'info', text: 'Preparing sync...' });
    setAttendanceScrapeProgress(0);
    
    console.log("Starting Historical Attendance Sync request...");
    const response = await fetch('/api/sync-attendance');
    console.log("Response received, status:", response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      setAttendanceScrapeStatus({ type: 'error', text: `Server error: ${response.status} ${errorText}` });
      setIsAttendanceScraping(false);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          console.log("SSE Line received:", line);
          
          if (line.trim().startsWith('data: ')) {
            try {
              const data = JSON.parse(line.trim().substring(6));
              console.log("Parsed SSE Data:", data);
              if (data.error) {
                setAttendanceScrapeStatus({ type: 'error', text: data.error });
                setIsAttendanceScraping(false);
              } else {
                setAttendanceScrapeStatus({ type: 'info', text: data.message });
                setAttendanceScrapeProgress(data.progress);
                if (data.progress === 100) {
                  setIsAttendanceScraping(false);
                  setAttendanceScrapeStatus({ type: 'success', text: data.message });
                }
              }
            } catch (e) {
              console.error("Error parsing SSE JSON:", e, "Line:", line);
            }
          }
        }
      }
    } catch (err) {
      console.error("Sync Stream Error:", err);
      setAttendanceScrapeStatus({ type: 'error', text: 'Connection lost. Please try again.' });
      setIsAttendanceScraping(false);
    }
  };

  const handleJoinDateSync = async (e) => {
    e.preventDefault();
    setIsJoinDateSyncing(true);
    setJoinDateSyncStatus({ type: 'info', text: 'Connecting to SCM Portal...' });
    setJoinDateSyncProgress(0);
    
    const response = await fetch('/api/sync-join-dates');
    if (!response.ok) {
      setJoinDateSyncStatus({ type: 'error', text: `Connection failed: ${response.status}` });
      setIsJoinDateSyncing(false);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue;
          
          try {
            const data = JSON.parse(line.substring(6));
            if (data.type === 'done') {
              setJoinDateSyncStatus({ type: 'success', text: data.message });
              setIsJoinDateSyncing(false);
              loadData();
            } else if (data.type === 'error') {
              setJoinDateSyncStatus({ type: 'error', text: data.message });
            } else {
              setJoinDateSyncStatus({ type: data.type || 'info', text: data.message });
              if (data.progress !== undefined) setJoinDateSyncProgress(data.progress);
            }
          } catch (e) {}
        }
      }
    } catch (err) {
      setJoinDateSyncStatus({ type: 'error', text: 'Sync interrupted.' });
      setIsJoinDateSyncing(false);
    }
  };

  const toggleSquad = async (squadId, isSquad, targetMeets, targetSessionsPerWeek, targetTrainingPercent, targetHoursPerWeek, requireWeekend, useOrLogic, wRel, wProg, wComp, wVol) => {
    setSquads(squads.map(s => s.id === squadId ? { 
      ...s, 
      is_squad: typeof isSquad === 'boolean' ? isSquad : s.is_squad, 
      target_meets: typeof targetMeets === 'number' ? targetMeets : s.target_meets,
      target_sessions_per_week: typeof targetSessionsPerWeek === 'number' ? targetSessionsPerWeek : s.target_sessions_per_week,
      target_training_percent: typeof targetTrainingPercent === 'number' ? targetTrainingPercent : s.target_training_percent,
      target_hours_per_week: typeof targetHoursPerWeek === 'number' ? targetHoursPerWeek : s.target_hours_per_week,
      require_weekend: typeof requireWeekend === 'boolean' ? requireWeekend : s.require_weekend,
      use_or_logic: typeof useOrLogic === 'boolean' ? useOrLogic : s.use_or_logic,
      health_weight_reliability: typeof wRel === 'number' ? wRel : s.health_weight_reliability,
      health_weight_progress: typeof wProg === 'number' ? wProg : s.health_weight_progress,
      health_weight_competition: typeof wComp === 'number' ? wComp : s.health_weight_competition,
      health_weight_volume: typeof wVol === 'number' ? wVol : s.health_weight_volume
    } : s));
    await fetch('/api/update-squad', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ 
        squadId, 
        isSquad, 
        targetMeets, 
        targetSessionsPerWeek, 
        targetTrainingPercent,
        targetHoursPerWeek,
        requireWeekend,
        useOrLogic,
        health_weight_reliability: wRel,
        health_weight_progress: wProg,
        health_weight_competition: wComp,
        health_weight_volume: wVol
      }) 
    });
  };

  const toggleCoachSquad = async (coachId, squadId, assign) => {
    if (assign) setCoachSquads([...coachSquads, { coach_id: coachId, squad_id: squadId }]);
    else setCoachSquads(coachSquads.filter(cs => !(cs.coach_id === coachId && cs.squad_id === squadId)));
    await fetch('/api/assign-coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coachId, squadId, assign }) });
  };

  if (loading) return <Layout session={session}><div className="loading-spinner"></div></Layout>;
  if (!isAuthorized) return null;

  const SidebarItem = ({ id, label, icon }) => (
    <div className={`sidebar-item ${activePanel === id ? 'active' : ''}`} onClick={() => setActivePanel(id)}>
      <span className="icon">{icon}</span>
      {label}
    </div>
  );

  const filteredSwimmers = swimmers.filter(s => {
    const matchesSearch = s.full_name.toLowerCase().includes(swimmerSearch.toLowerCase());
    const matchesSquad = squadFilter === 'all' || s.squad_id === squadFilter;
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'exempt' ? s.is_exempt : !s.is_exempt);
    return matchesSearch && matchesSquad && matchesStatus;
  });

  return (
    <Layout session={session}>
      <div className="settings-container">
        {/* SIDEBAR */}
        <div className="settings-sidebar">
          <h2 style={{ fontSize: '1rem', padding: '1rem 1.5rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Settings</h2>
          <SidebarItem id="system" label="System Sync" icon="⚡" />
          <SidebarItem id="analytics" label="Analytics" icon="📊" />
          <SidebarItem id="training" label="Training Attendance" icon="⏱️" />
          <SidebarItem id="joindates" label="Join Dates" icon="📅" />
          <SidebarItem id="exemptions" label="Exemptions" icon="🛡️" />
          <SidebarItem id="meets" label="Meets" icon="🏊" />
          <SidebarItem id="squads" label="Squads" icon="📋" />
          <SidebarItem id="coaches" label="Coaches" icon="👔" />
        </div>

        {/* MAIN PANEL */}
        <div className="settings-panel">
          {activePanel === 'system' && (
            <div className="panel-content">
              <h1>System Sync & Scraping</h1>
              <div className="grid md:grid-cols-2 gap-8">
                <div className="card">
                  <h3>SCM Sync</h3>
                  <p className="mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>Import members and squads.</p>
                  {syncStatus && activePanel === 'system' && <div className={`alert ${syncStatus.type === 'error' ? 'alert-error' : 'alert-success'}`}>{syncStatus.text}</div>}
                  <form onSubmit={handleSyncScm}>
                    <input type="password" className="input-field mb-4" value={scmKey} onChange={(e) => setScmKey(e.target.value)} placeholder="SCM API Key" />
                    <button type="submit" className="btn btn-primary">Start Sync</button>
                  </form>
                </div>
                <div className="card">
                  <h3>Meet Scraper</h3>
                  <p className="mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>Fetch results for TONS.</p>
                  {scrapeStatus && <div className={`alert ${scrapeStatus.type === 'error' ? 'alert-error' : 'alert-success'}`}>{scrapeStatus.text}</div>}
                  <form onSubmit={handleScrape}>
                    <input type="text" className="input-field mb-4" value={swimmingYear} onChange={(e) => setSwimmingYear(e.target.value)} placeholder="Year/Range" />
                    <button type="submit" className="btn btn-primary" disabled={isScraping}>{isScraping ? 'Scraping...' : 'Start Scrape'}</button>
                  </form>
                  {isScraping && <div className="progress-bg mt-4"><div className="progress-fill" style={{ width: `${scrapeProgress}%` }}></div></div>}
                </div>
              </div>
            </div>
          )}

          {activePanel === 'analytics' && (
            <div className="panel-content">
              <h1>Analytics Configuration</h1>
              <p className="mb-8" style={{ color: 'var(--text-secondary)' }}>
                Configure the weights for the Squad Health Score. Total weight should ideally equal 100%.
              </p>

              <div className="space-y-6">
                {squads.filter(s => s.is_squad).map(s => (
                  <div key={s.id} className="card">
                    <div className="flex justify-between items-center mb-6">
                      <h3 style={{ margin: 0 }}>{s.name}</h3>
                      <div className={`badge ${ ( (s.health_weight_reliability || 20) + (s.health_weight_progress || 30) + (s.health_weight_competition || 40) + (s.health_weight_volume || 10) ) === 100 ? 'success' : 'attention'}`}>
                        Total: {(s.health_weight_reliability || 20) + (s.health_weight_progress || 30) + (s.health_weight_competition || 40) + (s.health_weight_volume || 10)}%
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      <div>
                        <label className="text-xs uppercase tracking-widest opacity-50 block mb-2">Reliability</label>
                        <div className="flex items-center gap-2">
                          <input 
                            type="number" 
                            className="input-field m-0" 
                            value={s.health_weight_reliability ?? 20} 
                            onChange={(e) => toggleSquad(s.id, undefined, undefined, undefined, undefined, undefined, undefined, undefined, parseInt(e.target.value))}
                          />
                          <span className="text-sm opacity-40">%</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs uppercase tracking-widest opacity-50 block mb-2">Progress</label>
                        <div className="flex items-center gap-2">
                          <input 
                            type="number" 
                            className="input-field m-0" 
                            value={s.health_weight_progress ?? 30} 
                            onChange={(e) => toggleSquad(s.id, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, parseInt(e.target.value))}
                          />
                          <span className="text-sm opacity-40">%</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs uppercase tracking-widest opacity-50 block mb-2">Competition</label>
                        <div className="flex items-center gap-2">
                          <input 
                            type="number" 
                            className="input-field m-0" 
                            value={s.health_weight_competition ?? 40} 
                            onChange={(e) => toggleSquad(s.id, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, parseInt(e.target.value))}
                          />
                          <span className="text-sm opacity-40">%</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs uppercase tracking-widest opacity-50 block mb-2">Volume</label>
                        <div className="flex items-center gap-2">
                          <input 
                            type="number" 
                            className="input-field m-0" 
                            value={s.health_weight_volume ?? 10} 
                            onChange={(e) => toggleSquad(s.id, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, parseInt(e.target.value))}
                          />
                          <span className="text-sm opacity-40">%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activePanel === 'training' && (
            <div className="panel-content">
              <h1>Training Attendance</h1>
              <div className="grid md:grid-cols-2 gap-8">
                <div className="card">
                  <h3>SCM Daily Sync</h3>
                  <p className="mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>Capture today's attendance from SCM sessions.</p>
                  {attendanceSyncStatus && <div className={`alert ${attendanceSyncStatus.type === 'error' ? 'alert-error' : 'alert-success'}`}>{attendanceSyncStatus.text}</div>}
                  <button onClick={handleSyncAttendance} className="btn btn-primary">Sync Now</button>
                </div>

                <div className="card">
                  <h3>Historical Portal Sync</h3>
                  <p className="mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>Scrape last 12 months of attendance directly from SCM profiles.</p>
                  {attendanceScrapeStatus && <div className={`alert ${attendanceScrapeStatus.type === 'error' ? 'alert-error' : 'alert-success'}`}>{attendanceScrapeStatus.text}</div>}
                  <button 
                    onClick={handleHistoricalAttendanceSync} 
                    className="btn btn-primary w-full" 
                    disabled={isAttendanceScraping}
                  >
                    {isAttendanceScraping ? 'Syncing...' : 'Start Historical Sync'}
                  </button>
                  {isAttendanceScraping && (
                    <div className="progress-bg mt-4">
                      <div className="progress-fill" style={{ width: `${attendanceScrapeProgress}%` }}></div>
                    </div>
                  )}
                </div>
                
                <div className="card">
                  <h3>Historical CSV Import</h3>
                  <p className="mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>Backfill history from SCM Attendance Reports.</p>
                  
                  <div className="mb-4">
                    <input type="file" accept=".csv" onChange={handleCsvFileChange} className="input-field" />
                  </div>

                  {csvFile && (
                    <div className="p-4 bg-white/5 rounded-xl mb-4 text-sm">
                      <p className="font-bold mb-2">Map Columns:</p>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span>Date</span>
                          <select className="select-mini" value={csvMapping.date} onChange={(e) => setCsvMapping({...csvMapping, date: e.target.value})}>
                            <option value="">Select...</option>
                            {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Swimmer</span>
                          <select className="select-mini" value={csvMapping.swimmer} onChange={(e) => setCsvMapping({...csvMapping, swimmer: e.target.value})}>
                            <option value="">Select...</option>
                            {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Session</span>
                          <select className="select-mini" value={csvMapping.session} onChange={(e) => setCsvMapping({...csvMapping, session: e.target.value})}>
                            <option value="">Select...</option>
                            {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  <button 
                    onClick={processImport} 
                    className="btn btn-primary w-full" 
                    disabled={!csvFile || !csvMapping.date || !csvMapping.swimmer}
                  >
                    Start Import
                  </button>
                  {importStatus && <div className={`alert mt-4 ${importStatus.type === 'error' ? 'alert-error' : 'alert-success'}`}>{importStatus.text}</div>}
                </div>
              </div>
            </div>
          )}

          {activePanel === 'joindates' && (
            <div className="panel-content">
              <h1>Squad Join Dates</h1>
              <p className="mb-8" style={{ color: 'var(--text-secondary)' }}>
                Upload an SCM report to backfill when swimmers joined their current squads. 
                This ensures KPI targets are calculated pro-rata for new members.
              </p>

              <div className="grid md:grid-cols-2 gap-8 mb-12">
                <div className="card">
                  <h3>SCM Audit Log Upload</h3>
                  <p className="mb-4 text-xs opacity-60">Upload the 'Membership Audit' report. Required columns: <strong>First Name, Last Name, Date, Action</strong>.</p>
                  <input 
                    type="file" 
                    accept=".csv" 
                    onChange={async (e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      
                      setSyncStatus({ type: 'info', text: 'Parsing file...' });
                      const reader = new FileReader();
                      reader.onload = async (event) => {
                        try {
                          const text = event.target.result;
                          const rows = text.split('\n').filter(r => r.trim()).map(r => r.split(','));
                          if (rows.length < 2) throw new Error('File appears to be empty.');

                          const headers = rows[0].map(h => h.trim().replace(/["']/g, '').toLowerCase());
                          console.log('Detected Headers:', headers);
                          
                          const fnameIdx = headers.findIndex(h => h.includes('first name'));
                          const lnameIdx = headers.findIndex(h => h.includes('last name'));
                          const actionIdx = headers.findIndex(h => h === 'action');
                          const dateIdx = headers.findIndex(h => h === 'date');
                          
                          if (fnameIdx === -1 || lnameIdx === -1 || dateIdx === -1) {
                            throw new Error(`Required columns not found. Detected: ${headers.join(', ')}`);
                          }

                          const payload = rows.slice(1)
                            .map(r => r.map(cell => cell.trim().replace(/["']/g, '')))
                            .filter(r => {
                              // Only take rows where Action is "Added"
                              if (actionIdx !== -1) {
                                return r[actionIdx].toLowerCase() === 'added';
                              }
                              return true;
                            })
                            .map(r => ({
                              full_name: `${r[fnameIdx]} ${r[lnameIdx]}`,
                              squad_join_date: r[dateIdx]
                            }));

                          if (payload.length === 0) throw new Error('No records with Action="Added" found.');

                          setSyncStatus({ type: 'info', text: `Uploading ${payload.length} records...` });
                          const res = await fetch('/api/import-join-dates', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ data: payload })
                          });
                          const resData = await res.json();
                          setSyncStatus({ type: res.ok ? 'success' : 'error', text: resData.message || resData.error });
                          if (res.ok) loadData();
                        } catch (err) {
                          setSyncStatus({ type: 'error', text: err.message });
                        }
                      };
                      reader.readAsText(file);
                    }}
                    className="input-field mb-4"
                  />
                  {syncStatus && activePanel === 'joindates' && (
                    <div className={`alert ${syncStatus.type === 'error' ? 'alert-error' : 'alert-success'}`}>
                      {syncStatus.text}
                    </div>
                  )}
                </div>

                <div className="card">
                  <h3>Portal Move History Sync</h3>
                  <p className="mb-4 text-xs opacity-60">Automatically scrape the SCM 'Groups' history to find the real date each swimmer joined their current squad.</p>
                  
                  {joinDateSyncStatus && (
                    <div className={`alert mb-4 ${joinDateSyncStatus.type === 'error' ? 'alert-error' : joinDateSyncStatus.type === 'success' ? 'alert-success' : 'alert-info'}`}>
                      {joinDateSyncStatus.text}
                    </div>
                  )}

                  <button 
                    onClick={handleJoinDateSync} 
                    className="btn btn-primary w-full" 
                    disabled={isJoinDateSyncing}
                  >
                    {isJoinDateSyncing ? 'Scraping History...' : 'Sync All Join Dates'}
                  </button>
                  
                  {isJoinDateSyncing && (
                    <div className="progress-bg mt-4">
                      <div className="progress-fill" style={{ width: `${joinDateSyncProgress}%` }}></div>
                    </div>
                  )}
                </div>

                <div className="card">
                  <h3>Season Defaults</h3>
                  <p className="mb-4 text-sm opacity-60">Set a baseline join date for all existing squad members who haven't moved.</p>
                  <div className="flex gap-4">
                    <input type="date" className="input-field" defaultValue="2025-09-01" id="defaultDate" />
                    <button className="btn btn-secondary" onClick={async () => {
                      const date = document.getElementById('defaultDate').value;
                      if (!confirm(`Apply ${date} to all swimmers with missing join dates?`)) return;
                      // Logic to mass update null join dates
                      setSyncStatus({ type: 'info', text: 'Applying default...' });
                      const { error } = await supabase
                        .from('swimmers')
                        .update({ squad_join_date: date })
                        .is('squad_join_date', null);
                      setSyncStatus({ type: error ? 'error' : 'success', text: error ? error.message : 'Default applied successfully.' });
                      loadData();
                    }}>Apply</button>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="flex justify-between items-center mb-6">
                  <h3>Swimmer Join Log</h3>
                  <div className="search-pill" style={{ background: 'rgba(255,255,255,0.05)', padding: '4px 12px', borderRadius: '50px' }}>
                    <input 
                      type="text" 
                      placeholder="Search log..." 
                      className="m-0"
                      style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '0.8rem', outline: 'none' }}
                      value={swimmerSearch} 
                      onChange={(e) => setSwimmerSearch(e.target.value)} 
                    />
                  </div>
                </div>
                <div className="table-wrapper" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                  <table className="stats-table">
                    <thead><tr><th>Name</th><th>Squad</th><th>Join Date</th></tr></thead>
                    <tbody>
                      {swimmers
                        .filter(s => s.full_name.toLowerCase().includes(swimmerSearch.toLowerCase()))
                        .map(s => (
                        <tr key={s.id}>
                          <td>{s.full_name}</td>
                          <td><span className="badge">{s.squads?.name}</span></td>
                          <td>
                            <input 
                              type="date" 
                              className="input-field m-0" 
                              style={{ width: '150px', padding: '4px' }}
                              value={s.squad_join_date || ''}
                              onChange={async (e) => {
                                const newDate = e.target.value;
                                setSwimmers(swimmers.map(sw => sw.id === s.id ? { ...sw, squad_join_date: newDate } : sw));
                                await supabase.from('swimmers').update({ squad_join_date: newDate }).eq('id', s.id);
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activePanel === 'exemptions' && (
            <div className="panel-content">
              <h1>Coach's Discretion</h1>
              <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>Mark swimmers as exempt from KPI metrics.</p>
              
              {debugLog && (
                <div className={`badge mb-6`} style={{ padding: '10px 20px', background: debugLog.includes('ERROR') ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)', color: debugLog.includes('ERROR') ? 'var(--danger-color)' : 'var(--accent-primary)', width: '100%', textAlign: 'center', border: '1px solid currentColor' }}>
                  {debugLog}
                </div>
              )}

              <div className="flex flex-wrap gap-4 mb-8">
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <label className="text-xs uppercase tracking-widest opacity-50 block mb-2">Search Name</label>
                  <input type="text" placeholder="Swimmer name..." className="input-field m-0" value={swimmerSearch} onChange={(e) => setSwimmerSearch(e.target.value)} />
                </div>
                <div style={{ width: '200px' }}>
                  <label className="text-xs uppercase tracking-widest opacity-50 block mb-2">Squad</label>
                  <select className="input-field m-0" value={squadFilter} onChange={(e) => setSquadFilter(e.target.value)}>
                    <option value="all">All Squads</option>
                    {squads.filter(s => s.is_squad).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div style={{ width: '150px' }}>
                  <label className="text-xs uppercase tracking-widest opacity-50 block mb-2">Status</label>
                  <select className="input-field m-0" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="all">All Status</option>
                    <option value="active">Active Only</option>
                    <option value="exempt">Exempt Only</option>
                  </select>
                </div>
              </div>

              <div className="table-wrapper" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                <table className="stats-table">
                  <thead><tr><th>Name</th><th>Squad</th><th className="text-center">Action</th></tr></thead>
                  <tbody>
                    {filteredSwimmers.map(s => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 600 }}>{s.full_name}</td>
                        <td><span className="badge">{s.squads?.name}</span></td>
                        <td className="text-center">
                          <button onClick={() => toggleExempt(s.id, !s.is_exempt)} className={`btn ${s.is_exempt ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '6px 12px', fontSize: '0.8rem', background: s.is_exempt ? 'var(--danger-color)' : '' }}>{s.is_exempt ? 'Exempt' : 'Include'}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activePanel === 'meets' && (
            <div className="panel-content">
              <h1>Meet Management</h1>
              <div className="flex justify-between items-center mb-6">
                <p style={{ color: 'var(--text-secondary)' }}>Toggle "Open Meets" for KPI tracking.</p>
                <input type="text" placeholder="Search..." className="input-field" style={{ width: '250px' }} value={meetSearch} onChange={(e) => setMeetSearch(e.target.value)} />
              </div>
              <div className="table-wrapper" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                <table className="stats-table">
                  <thead><tr><th>Date</th><th>Meet Name</th><th className="text-center">Type</th><th className="text-center">Action</th></tr></thead>
                  <tbody>
                    {meets.filter(m => m.name.toLowerCase().includes(meetSearch.toLowerCase()) || m.license?.toLowerCase().includes(meetSearch.toLowerCase())).map(m => (
                      <tr key={m.id}>
                        <td style={{ fontSize: '0.85rem' }}>{m.date ? new Date(m.date).toLocaleDateString() : 'N/A'}</td>
                        <td style={{ fontWeight: 600 }}>{m.name}</td>
                        <td className="text-center">
                          <select className="input-field" style={{ padding: '4px 8px', fontSize: '0.8rem', width: 'auto' }} value={m.type || 'open'} onChange={(e) => toggleMeetType(m.id, e.target.value)}>
                            <option value="open">Open Meet</option>
                            <option value="internal">Internal</option>
                          </select>
                        </td>
                        <td className="text-center"><button onClick={() => deleteMeet(m.id)} className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: '0.75rem', color: 'var(--danger-color)' }}>Delete</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activePanel === 'squads' && (
            <div className="panel-content">
              <h1>Squad Management</h1>
              <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>Configure squad targets and assignments.</p>
              <div className="table-wrapper">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th className="text-center">Active</th>
                      <th>Squad Name</th>
                      <th className="text-center">Meets</th>
                      <th className="text-center">Sess/Wk</th>
                      <th className="text-center">Hrs/Wk</th>
                      <th className="text-center">Logic</th>
                      <th className="text-center">Wknd</th>
                      <th className="text-center">Target %</th>
                      <th>Coaches</th>
                    </tr>
                  </thead>
                  <tbody>
                    {squads.map(s => {
                      const assignedCoachIds = coachSquads.filter(cs => cs.squad_id === s.id).map(cs => cs.coach_id);
                      return (
                        <tr key={s.id} style={{ opacity: s.is_squad ? 1 : 0.5 }}>
                          <td className="text-center"><input type="checkbox" checked={s.is_squad} onChange={(e) => toggleSquad(s.id, e.target.checked)} /></td>
                          <td style={{ fontWeight: 700 }}>{s.name}</td>
                          <td className="text-center">
                            <input 
                              type="number" 
                              className="input-field" 
                              style={{ width: '45px', textAlign: 'center', padding: '4px' }} 
                              value={s.target_meets} 
                              onChange={(e) => toggleSquad(s.id, undefined, parseInt(e.target.value))} 
                              disabled={!s.is_squad} 
                            />
                          </td>
                          <td className="text-center">
                            <input 
                              type="number" 
                              className="input-field" 
                              style={{ width: '45px', textAlign: 'center', padding: '4px' }} 
                              value={s.target_sessions_per_week || 0} 
                              onChange={(e) => toggleSquad(s.id, undefined, undefined, parseInt(e.target.value))} 
                              disabled={!s.is_squad} 
                            />
                          </td>
                          <td className="text-center">
                            <input 
                              type="number" 
                              step="0.5"
                              className="input-field" 
                              style={{ width: '45px', textAlign: 'center', padding: '4px' }} 
                              value={s.target_hours_per_week || 0} 
                              onChange={(e) => toggleSquad(s.id, undefined, undefined, undefined, undefined, parseFloat(e.target.value))} 
                              disabled={!s.is_squad} 
                            />
                          </td>
                          <td className="text-center">
                            <button 
                              className={`btn ${s.use_or_logic ? 'btn-secondary' : 'btn-primary'}`} 
                              style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                              onClick={() => toggleSquad(s.id, undefined, undefined, undefined, undefined, undefined, undefined, !s.use_or_logic)}
                              disabled={!s.is_squad}
                            >
                              {s.use_or_logic ? 'OR' : 'AND'}
                            </button>
                          </td>
                          <td className="text-center">
                            <input 
                              type="checkbox" 
                              checked={s.require_weekend || false} 
                              onChange={(e) => toggleSquad(s.id, undefined, undefined, undefined, undefined, undefined, e.target.checked)}
                              disabled={!s.is_squad}
                            />
                          </td>
                          <td className="text-center">
                            <input 
                              type="number" 
                              className="input-field" 
                              style={{ width: '45px', textAlign: 'center', padding: '4px' }} 
                              value={s.target_training_percent || 75} 
                              onChange={(e) => toggleSquad(s.id, undefined, undefined, undefined, parseInt(e.target.value))} 
                              disabled={!s.is_squad} 
                            />%
                          </td>
                          <td><div className="flex flex-wrap gap-2">{coaches.map(c => (<label key={c.id} style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}><input type="checkbox" checked={assignedCoachIds.includes(c.id)} onChange={(e) => toggleCoachSquad(c.id, s.id, e.target.checked)} disabled={!s.is_squad} />{c.email.split('@')[0]}</label>))}</div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activePanel === 'coaches' && (
            <div className="panel-content">
              <h1>Coach Management</h1>
              <div className="table-wrapper"><table className="stats-table"><thead><tr><th>Email</th><th>Role</th></tr></thead><tbody>{coaches.map(c => (<tr key={c.id}><td>{c.email}</td><td><span className="badge">{c.role}</span></td></tr>))}</tbody></table></div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .settings-container { display: flex; gap: 2rem; min-height: 80vh; margin-top: -1rem; }
        .settings-sidebar { width: 260px; background: rgba(255,255,255,0.02); border-radius: 20px; border: 1px solid var(--surface-border); padding: 1rem 0; height: fit-content; }
        .sidebar-item { padding: 0.85rem 1.5rem; display: flex; align-items: center; gap: 1rem; cursor: pointer; transition: all 0.2s; color: var(--text-secondary); font-weight: 500; font-size: 0.95rem; }
        .sidebar-item:hover { color: white; background: rgba(255,255,255,0.03); }
        .sidebar-item.active { color: white; background: rgba(59, 130, 246, 0.1); border-right: 3px solid var(--accent-primary); }
        .icon { font-size: 1.1rem; width: 24px; text-align: center; }
        .settings-panel { flex: 1; min-width: 0; }
        .panel-content h1 { font-size: 2rem; margin-bottom: 2rem; }
        .loading-spinner { width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.1); border-top-color: var(--accent-primary); border-radius: 50%; animation: spin 1s linear infinite; margin: 100px auto; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </Layout>
  );
}
