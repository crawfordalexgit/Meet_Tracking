import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { useRouter } from 'next/router';

export default function Settings({ session, scmApiKey }) {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [scmKey, setScmKey] = useState(scmApiKey || '');
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

  const [rankingsScrapeStatus, setRankingsScrapeStatus] = useState(null);
  const [rankingsScrapeProgress, setRankingsScrapeProgress] = useState(0);
  const [isRankingsScraping, setIsRankingsScraping] = useState(false);

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
  const [clubExemptions, setClubExemptions] = useState([]);
  const [newExemption, setNewExemption] = useState({ name: '', start_date: '', end_date: '', type: 'credit', squad_id: '' });

  const [activePanel, setActivePanel] = useState('system');
  const [attendanceSyncStatus, setAttendanceSyncStatus] = useState(null);
  const [csvFile, setCsvFile] = useState(null);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvMapping, setCsvMapping] = useState({ date: '', swimmer: '', session: '' });
  const [importStatus, setImportStatus] = useState(null);
  const [sessionSyncStatus, setSessionSyncStatus] = useState(null);
  const [sessionSyncProgress, setSessionSyncProgress] = useState(0);
  const [isSessionSyncing, setIsSessionSyncing] = useState(false);
  const [editingCriteriaSquad, setEditingCriteriaSquad] = useState(null);
  const [isDetectingGaps, setIsDetectingGaps] = useState(false);
  const [gapStatus, setGapStatus] = useState(null);
  const [isReconcilingPbs, setIsReconcilingPbs] = useState(false);
  const [pbSyncStatus, setPbSyncStatus] = useState(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('coach');
  const [inviteStatus, setInviteStatus] = useState(null);


  useEffect(() => {
    if (session === undefined) return;
    if (!session) {
      router.push('/login');
      return;
    }
    checkAdmin();
  }, [session, router]);

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
    if (!session?.user?.id) {
      router.push('/');
      setLoading(false);
      return;
    }
    
    try {
      const { data } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      if (['admin', 'headcoach'].includes(data?.role)) {
        setIsAuthorized(true);
        loadData();
      } else {
        router.push('/');
      }
    } catch (e) {
      console.error('checkAdmin error:', e);
      router.push('/');
    }
    setLoading(false);
  };

  const loadData = async () => {
    const [profilesRes, squadsRes, csRes, meetsRes, swimmersRes, exemptRes] = await Promise.all([
      supabase.from('profiles').select('*').order('email'),
      supabase.from('squads').select('*').order('name'),
      supabase.from('coach_squads').select('*'),
      supabase.from('meets').select('*').order('date', { ascending: false }),
      supabase.from('swimmers').select('*, squads(name)').order('full_name'),
      supabase.from('club_exemptions').select('*').order('start_date', { ascending: false })
    ]);

    if (profilesRes.data) setCoaches(profilesRes.data);
    if (squadsRes.data) setSquads(squadsRes.data);
    if (csRes.data) setCoachSquads(csRes.data);
    if (meetsRes.data) setMeets(meetsRes.data);
    if (swimmersRes.data) setSwimmers(swimmersRes.data);
    if (exemptRes.data) setClubExemptions(exemptRes.data);
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

  const addClubExemption = async () => {
    if (!newExemption.name || !newExemption.start_date || !newExemption.end_date) return;
    setDebugLog(`Adding club exemption: ${newExemption.name}...`);
    try {
      const toInsert = { ...newExemption };
      if (!toInsert.squad_id) delete toInsert.squad_id;
      
      const { data, error } = await supabase.from('club_exemptions').insert([toInsert]).select('*, squads(name)');
      if (error) throw error;
      setClubExemptions(prev => [...(data || []), ...prev]);
      setNewExemption({ name: '', start_date: '', end_date: '', type: 'credit', squad_id: '' });
      setDebugLog(`Successfully added club exemption.`);
    } catch (e) { setDebugLog(`ERROR: ${e.message}`); }
  };

  const deleteClubExemption = async (id) => {
    setDebugLog(`Deleting club exemption...`);
    try {
      const { error } = await supabase.from('club_exemptions').delete().eq('id', id);
      if (error) throw error;
      setClubExemptions(prev => prev.filter(ex => ex.id !== id));
      setDebugLog(`Successfully deleted club exemption.`);
    } catch (e) { setDebugLog(`ERROR: ${e.message}`); }
  };

  const handleDetectMissingSessions = async () => {
    setIsDetectingGaps(true);
    setGapStatus({ type: 'info', text: 'Scanning the last 365 days for cancelled sessions...' });
    try {
      const res = await fetch('/api/detect-missing-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to detect missing sessions');
      }
      setGapStatus({
        type: 'success',
        text: `Scan complete! Found and created ${data.count} new cancellations: ${data.dates.join(', ') || 'none'}`
      });
      loadData();
    } catch (err) {
      setGapStatus({ type: 'error', text: err.message });
    } finally {
      setIsDetectingGaps(false);
    }
  };

  const handleReconcilePbs = async () => {
    setIsReconcilingPbs(true);
    setPbSyncStatus({ type: 'info', text: 'Reconciling historical PBs...' });
    try {
      const res = await fetch('/api/reconcile-pbs', {
        method: 'POST'
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reconcile PBs');
      }
      setPbSyncStatus({
        type: 'success',
        text: `Successfully reconciled ${data.updatedCount} results!`
      });
      loadData();
    } catch (err) {
      setPbSyncStatus({ type: 'error', text: err.message });
    } finally {
      setIsReconcilingPbs(false);
    }
  };

  const handleSyncScm = async (e) => {
    e.preventDefault();
    setSyncStatus({ type: 'info', text: 'Syncing (Phase 1: Scraping SCM)...' });
    
    try {
      console.log('Starting Hybrid Sync...');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout for large clubs
      console.log('SCM SYNC: Initiating request to /api/sync-scm...');
      const res = await fetch('/api/sync-scm', { 
        method: 'POST', 
        headers: { 
          'Content-Type': 'application/json',
          'Connection': 'keep-alive'
        }, 
        body: JSON.stringify({ scmApiKey: scmKey }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      console.log('SCM API responded with status:', res.status);
      
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error('Failed to parse SCM response as JSON. Raw response:', text.substring(0, 500));
        throw new Error(`Server returned invalid response (Status ${res.status}). Check terminal for details.`);
      }

      if (!res.ok) throw new Error(data.error || 'Sync failed');

      setSyncStatus({ type: 'success', text: data.message });
      loadData();
    } catch (err) {
      console.error('Hybrid Sync Error Details:', err);
      const errorMsg = err.name === 'AbortError' ? 'Sync timed out (2 minutes). The club might be too large for a single pass.' : err.message;
      setSyncStatus({ type: 'error', text: `Sync failed: ${errorMsg}` });
    }
  };

  const handleSyncSessionMemberships = async () => {
    setIsSessionSyncing(true);
    setSessionSyncStatus({ type: 'info', text: 'Starting Session Sync...' });
    setSessionSyncProgress(0);

    try {
      const { data: swimmers } = await supabase
        .from('swimmers')
        .select('id')
        .not('scm_numeric_id', 'is', null);

      if (!swimmers || swimmers.length === 0) {
        throw new Error('No swimmers with SCM IDs found. Run SCM Sync first.');
      }

      const batchSize = 5;
      const total = swimmers.length;
      
      for (let i = 0; i < total; i += batchSize) {
        const batch = swimmers.slice(i, i + batchSize).map(s => s.id);
        const progress = Math.round((i / total) * 100);
        setSessionSyncProgress(progress);
        setSessionSyncStatus({ type: 'info', text: `Syncing Sessions: ${i}/${total} swimmers...` });

        const res = await fetch('/api/sync-session-memberships', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ swimmerIds: batch })
        });

        if (!res.ok) {
          const errData = await res.json();
          console.warn(`Batch error: ${errData.error}`);
        }
      }

      setSessionSyncProgress(100);
      setSessionSyncStatus({ type: 'success', text: `Successfully synced memberships for ${total} swimmers.` });
      loadData();
    } catch (err) {
      setSessionSyncStatus({ type: 'error', text: err.message });
    } finally {
      setIsSessionSyncing(false);
    }
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

  const handleRankingsScrape = async (e) => {
    if (e) e.preventDefault();
    setIsRankingsScraping(true);
    setRankingsScrapeProgress(0);
    setRankingsScrapeStatus({ type: 'info', text: 'Starting Rankings Scrape...' });

    try {
      const response = await fetch('/api/scrape-rankings', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }
      });
      
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
              setRankingsScrapeStatus({ type: data.error ? 'error' : 'info', text: data.message });
              setRankingsScrapeProgress(data.progress);
              if (data.isDone) {
                setIsRankingsScraping(false);
                setRankingsScrapeStatus({ type: data.error ? 'error' : 'success', text: data.message });
              }
            } catch (e) {
              console.error('Error parsing SSE:', e);
            }
          }
        }
      }
    } catch (err) {
      setRankingsScrapeStatus({ type: 'error', text: err.message });
      setIsRankingsScraping(false);
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

  const toggleSquad = async (squadId, isSquad, targetMeets, targetSessionsPerWeek, targetTrainingPercent, targetHoursPerWeek, requireWeekend, useOrLogic, wRel, wProg, wComp, wVol, holidayAllowance, ageBasedCriteria) => {
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
      health_weight_volume: typeof wVol === 'number' ? wVol : s.health_weight_volume,
      holiday_allowance: typeof holidayAllowance === 'number' ? holidayAllowance : s.holiday_allowance
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
        health_weight_volume: wVol,
        holidayAllowance,
        age_based_criteria: ageBasedCriteria
      }) 
    });
  };

  const toggleCoachSquad = async (coachId, squadId, assign) => {
    if (assign) setCoachSquads([...coachSquads, { coach_id: coachId, squad_id: squadId }]);
    else setCoachSquads(coachSquads.filter(cs => !(cs.coach_id === coachId && cs.squad_id === squadId)));
    await fetch('/api/assign-coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coachId, squadId, assign }) });
  };

  const handleInviteCoach = async (e) => {
    e.preventDefault();
    setInviteStatus({ type: 'info', text: 'Inviting...' });
    try {
      const res = await fetch('/api/invite-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to invite coach');
      setInviteStatus({ type: 'success', text: data.message });
      setInviteEmail('');
      loadData();
    } catch (err) {
      setInviteStatus({ type: 'error', text: err.message });
    }
  };

  const handleRoleChange = async (coachId, newRole) => {
    try {
      const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', coachId);
      if (error) throw error;
      setCoaches(coaches.map(c => c.id === coachId ? { ...c, role: newRole } : c));
    } catch (err) {
      console.error('Role update failed:', err);
    }
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
                  <h3>Session Memberships</h3>
                  <p className="mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>Sync which swimmers are in which sessions.</p>
                  {sessionSyncStatus && <div className={`alert ${sessionSyncStatus.type === 'error' ? 'alert-error' : 'alert-success'}`}>{sessionSyncStatus.text}</div>}
                  <button 
                    onClick={handleSyncSessionMemberships} 
                    className="btn btn-secondary w-full"
                    disabled={isSessionSyncing}
                  >
                    {isSessionSyncing ? 'Syncing...' : 'Sync Session Memberships'}
                  </button>
                  {isSessionSyncing && (
                    <div className="progress-bg mt-4">
                      <div className="progress-fill" style={{ width: `${sessionSyncProgress}%` }}></div>
                    </div>
                  )}
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

                <div className="card">
                  <h3>Rankings Scraper</h3>
                  <p className="mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>Fetch Kent & SE Region rankings for Tonbridge swimmers.</p>
                  {rankingsScrapeStatus && <div className={`alert ${rankingsScrapeStatus.type === 'error' ? 'alert-error' : 'alert-success'}`}>{rankingsScrapeStatus.text}</div>}
                  <button 
                    onClick={handleRankingsScrape} 
                    className="btn btn-primary w-full" 
                    disabled={isRankingsScraping}
                  >
                    {isRankingsScraping ? 'Scraping...' : 'Start Rankings Scrape'}
                  </button>
                  {isRankingsScraping && (
                    <div className="progress-bg mt-4">
                      <div className="progress-fill" style={{ width: `${rankingsScrapeProgress}%` }}></div>
                    </div>
                  )}
                </div>

                <div className="card">
                  <h3>Historical PBs Reconciler</h3>
                  <p className="mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>Mathematically reconstructs PB history from all logged results.</p>
                  {pbSyncStatus && <div className={`alert ${pbSyncStatus.type === 'error' ? 'alert-error' : 'alert-success'}`}>{pbSyncStatus.text}</div>}
                  <button 
                    onClick={handleReconcilePbs} 
                    className="btn-premium-action w-full" 
                    disabled={isReconcilingPbs}
                  >
                    {isReconcilingPbs ? 'Reconciling...' : 'Reconcile Historical PBs'}
                  </button>
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
                        <label className="text-xs uppercase tracking-widest opacity-50 block mb-2">Training Consistency</label>
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
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h1>Exemptions & Shutdowns</h1>
                  <p style={{ color: 'var(--text-secondary)' }}>Manage athlete discretion and club-wide training breaks.</p>
                </div>
              </div>

              <div className="card mb-8" style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.05) 0%, rgba(239,68,68,0.02) 100%)', border: '1px solid rgba(239,68,68,0.15)', padding: '1.5rem' }}>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>⚡</span> Auto-Detect Missing Sessions
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '8px 0 0 0', lineHeight: 1.5 }}>
                      Scans the last 365 days for dates where training was scheduled but zero attendance was recorded, automatically adding them as 'credit' exemptions so athletes aren't penalized for cancelled sessions.
                    </p>
                  </div>
                  <div>
                    <button 
                      onClick={handleDetectMissingSessions} 
                      className="btn btn-primary" 
                      style={{ whiteSpace: 'nowrap', minWidth: '220px' }}
                      disabled={isDetectingGaps}
                    >
                      {isDetectingGaps ? 'Detecting Gaps...' : 'Auto-Detect Missing Sessions'}
                    </button>
                  </div>
                </div>
                {gapStatus && (
                  <div className={`alert mt-4 ${gapStatus.type === 'error' ? 'alert-error' : gapStatus.type === 'info' ? 'alert-info' : 'alert-success'}`}>
                    {gapStatus.text}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="card" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(5,150,105,0.05) 100%)', border: '1px solid rgba(16,185,129,0.2)', padding: '1.5rem' }}>
                  <h4 style={{ color: '#10b981', fontWeight: 900, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>Automated Bank Holidays</h4>
                  <p style={{ fontSize: '0.85rem', lineHeight: 1.6, margin: 0 }}>All UK Bank Holidays and Easter dates are automatically credited at 100% attendance if the swimmer was scheduled to train. No manual action required.</p>
                </div>
                <div className="card" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(37,99,235,0.05) 100%)', border: '1px solid rgba(59,130,246,0.2)', padding: '1.5rem' }}>
                  <h4 style={{ color: '#3b82f6', fontWeight: 900, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>Anytime "Floating" Holidays</h4>
                  <p style={{ fontSize: '0.85rem', lineHeight: 1.6, margin: 0 }}>Swimmers are granted a <b>default 2-week</b> anytime exemption per year. Weeks with zero attendance are automatically ignored from stats if allowance remains.</p>
                </div>
              </div>

              <div className="card mb-8" style={{ background: 'rgba(255,255,255,0.03)', padding: '2rem' }}>
                <h3 className="mb-4" style={{ fontSize: '1.1rem', fontWeight: 600 }}>Define Club Shutdown / Cancellation</h3>
                <div className="flex flex-wrap gap-4 items-end">
                  <div style={{ flex: 2, minWidth: '200px' }}>
                    <label className="text-xs uppercase tracking-widest opacity-50 block mb-2">Event Name</label>
                    <input type="text" placeholder="e.g. Summer Shutdown" className="input-field m-0" value={newExemption.name} onChange={e => setNewExemption({...newExemption, name: e.target.value})} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="text-xs uppercase tracking-widest opacity-50 block mb-2">Start Date</label>
                    <input type="date" className="input-field m-0" value={newExemption.start_date} onChange={e => setNewExemption({...newExemption, start_date: e.target.value})} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="text-xs uppercase tracking-widest opacity-50 block mb-2">End Date</label>
                    <input type="date" className="input-field m-0" value={newExemption.end_date} onChange={e => setNewExemption({...newExemption, end_date: e.target.value})} />
                  </div>
                  <div style={{ width: '150px' }}>
                    <label className="text-xs uppercase tracking-widest opacity-50 block mb-2">Type</label>
                    <select className="input-field m-0" value={newExemption.type} onChange={e => setNewExemption({...newExemption, type: e.target.value})}>
                      <option value="credit">Attendance Credit</option>
                      <option value="exempt">Exempt (Hide Week)</option>
                    </select>
                  </div>
                  <div style={{ width: '180px' }}>
                    <label className="text-xs uppercase tracking-widest opacity-50 block mb-2">Target Squad</label>
                    <select className="input-field m-0" value={newExemption.squad_id} onChange={e => setNewExemption({...newExemption, squad_id: e.target.value})}>
                      <option value="">Whole Club</option>
                      {squads.filter(s => s.is_squad).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <button onClick={addClubExemption} className="btn btn-primary" style={{ padding: '12px 24px' }}>Add Entry</button>
                </div>

                {clubExemptions.length > 0 && (
                  <div className="mt-8">
                    <table className="stats-table">
                      <thead><tr><th>Name</th><th>Period</th><th>Squad</th><th>Type</th><th className="text-center">Action</th></tr></thead>
                      <tbody>
                        {clubExemptions.map(ex => (
                          <tr key={ex.id}>
                            <td style={{ fontWeight: 600 }}>{ex.name}</td>
                            <td>{new Date(ex.start_date).toLocaleDateString()} - {new Date(ex.end_date).toLocaleDateString()}</td>
                            <td><span className="badge">{ex.squads?.name || 'Whole Club'}</span></td>
                            <td><span className={`badge ${ex.type === 'credit' ? 'success' : 'info'}`}>{ex.type === 'credit' ? '100% Credit' : 'Exempted'}</span></td>
                            <td className="text-center">
                              <button onClick={() => deleteClubExemption(ex.id)} className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: '0.75rem', color: 'var(--danger-color)' }}>Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <hr className="my-8" style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.05)' }} />

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
                      <th className="text-center">Weekend</th>
                      <th className="text-center">Target %</th>
                      <th className="text-center">Hol/Yr</th>
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
                              title="Require at least one weekend session (Sat/Sun) to meet weekly target"
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
                          <td className="text-center">
                            <input 
                              type="number" 
                              className="input-field" 
                              style={{ width: '45px', textAlign: 'center', padding: '4px' }} 
                              value={s.holiday_allowance ?? 2} 
                              onChange={(e) => toggleSquad(s.id, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, parseInt(e.target.value))} 
                              disabled={!s.is_squad} 
                            />
                          </td>
                          <td className="text-center">
                            <button 
                              className="btn btn-secondary" 
                              style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                              onClick={() => setEditingCriteriaSquad(s)}
                              disabled={!s.is_squad}
                            >
                              Rules {(s.age_based_criteria?.length > 0) && `(${s.age_based_criteria.length})`}
                            </button>
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
              
              <div className="card mb-8">
                <h3>Invite New Coach</h3>
                {inviteStatus && <div className={`alert ${inviteStatus.type === 'error' ? 'alert-error' : 'alert-success'}`}>{inviteStatus.text}</div>}
                <form onSubmit={handleInviteCoach} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <input type="email" required className="input-field m-0" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="Email Address" style={{ flex: 1 }} />
                  <select className="input-field m-0" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={{ width: '150px' }}>
                    <option value="coach">Coach</option>
                    <option value="headcoach">Head Coach</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button type="submit" className="btn btn-primary m-0">Invite</button>
                </form>
              </div>

              <div className="table-wrapper">
                <table className="stats-table">
                  <thead><tr><th>Email</th><th>Role</th></tr></thead>
                  <tbody>
                    {coaches.map(c => (
                      <tr key={c.id}>
                        <td>{c.email}</td>
                        <td>
                          <select className="input-field" style={{ padding: '4px 8px', margin: 0, fontSize: '0.8rem', width: 'auto' }} value={c.role || 'coach'} onChange={(e) => handleRoleChange(c.id, e.target.value)}>
                            <option value="coach">Coach</option>
                            <option value="headcoach">Head Coach</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CRITERIA EDITOR MODAL */}
      {editingCriteriaSquad && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          backgroundColor: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)'
        }}>
          <div className="glass-card" style={{ 
            width: '100%', 
            maxWidth: '900px', 
            maxHeight: '90vh', 
            overflow: 'hidden', 
            display: 'flex', 
            flexDirection: 'column',
            padding: 0,
            border: '1px solid rgba(255,255,255,0.1)'
          }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>{editingCriteriaSquad.name} Age Criteria</h2>
                <p style={{ fontSize: '0.85rem', opacity: 0.5, margin: '4px 0 0 0' }}>Set specific targets based on swimmer age brackets.</p>
              </div>
              <button onClick={() => setEditingCriteriaSquad(null)} className="btn btn-secondary">Close</button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
              <table className="stats-table" style={{ marginBottom: '2rem' }}>
                <thead>
                  <tr>
                    <th>Rule Label</th>
                    <th>Age Range</th>
                    <th className="text-center">Sess/Wk</th>
                    <th className="text-center">Hrs/Wk</th>
                    <th className="text-center">Logic</th>
                    <th className="text-center">Weekend</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(editingCriteriaSquad.age_based_criteria || []).map((rule, idx) => (
                    <tr key={idx}>
                      <td><input className="input-field m-0" style={{ fontSize: '0.8rem' }} value={rule.label} onChange={(e) => {
                        const newCriteria = [...editingCriteriaSquad.age_based_criteria];
                        newCriteria[idx].label = e.target.value;
                        setEditingCriteriaSquad({ ...editingCriteriaSquad, age_based_criteria: newCriteria });
                      }} /></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input type="number" className="input-field m-0" style={{ width: '60px', textAlign: 'center' }} value={rule.min_age || 0} onChange={(e) => {
                            const newCriteria = [...editingCriteriaSquad.age_based_criteria];
                            newCriteria[idx].min_age = parseInt(e.target.value);
                            setEditingCriteriaSquad({ ...editingCriteriaSquad, age_based_criteria: newCriteria });
                          }} />
                          <span style={{ opacity: 0.3 }}>-</span>
                          <input type="number" className="input-field m-0" style={{ width: '60px', textAlign: 'center' }} value={rule.max_age || 99} onChange={(e) => {
                            const newCriteria = [...editingCriteriaSquad.age_based_criteria];
                            newCriteria[idx].max_age = parseInt(e.target.value);
                            setEditingCriteriaSquad({ ...editingCriteriaSquad, age_based_criteria: newCriteria });
                          }} />
                        </div>
                      </td>
                      <td className="text-center">
                        <input type="number" className="input-field m-0" style={{ width: '60px', textAlign: 'center' }} value={rule.target_sessions || 0} onChange={(e) => {
                          const newCriteria = [...editingCriteriaSquad.age_based_criteria];
                          newCriteria[idx].target_sessions = parseInt(e.target.value);
                          setEditingCriteriaSquad({ ...editingCriteriaSquad, age_based_criteria: newCriteria });
                        }} />
                      </td>
                      <td className="text-center">
                        <input type="number" step="0.5" className="input-field m-0" style={{ width: '60px', textAlign: 'center' }} value={rule.target_hours || 0} onChange={(e) => {
                          const newCriteria = [...editingCriteriaSquad.age_based_criteria];
                          newCriteria[idx].target_hours = parseFloat(e.target.value);
                          setEditingCriteriaSquad({ ...editingCriteriaSquad, age_based_criteria: newCriteria });
                        }} />
                      </td>
                      <td className="text-center">
                        <button className={`btn ${rule.use_or_logic ? 'btn-secondary' : 'btn-primary'}`} style={{ padding: '4px 8px', fontSize: '0.7rem' }} onClick={() => {
                          const newCriteria = [...editingCriteriaSquad.age_based_criteria];
                          newCriteria[idx].use_or_logic = !newCriteria[idx].use_or_logic;
                          setEditingCriteriaSquad({ ...editingCriteriaSquad, age_based_criteria: newCriteria });
                        }}>{rule.use_or_logic ? 'OR' : 'AND'}</button>
                      </td>
                      <td className="text-center">
                        <input type="checkbox" checked={rule.require_weekend || false} onChange={(e) => {
                          const newCriteria = [...editingCriteriaSquad.age_based_criteria];
                          newCriteria[idx].require_weekend = e.target.checked;
                          setEditingCriteriaSquad({ ...editingCriteriaSquad, age_based_criteria: newCriteria });
                        }} />
                      </td>
                      <td className="text-center">
                        <button className="btn btn-secondary" style={{ color: 'var(--accent-rose)' }} onClick={() => {
                          const newCriteria = editingCriteriaSquad.age_based_criteria.filter((_, i) => i !== idx);
                          setEditingCriteriaSquad({ ...editingCriteriaSquad, age_based_criteria: newCriteria });
                        }}>Remove</button>
                      </td>
                    </tr>
                  ))}
                  {(!editingCriteriaSquad.age_based_criteria || editingCriteriaSquad.age_based_criteria.length === 0) && (
                    <tr><td colSpan="7" className="text-center p-8 italic" style={{ opacity: 0.3 }}>No age-based rules defined yet.</td></tr>
                  )}
                </tbody>
              </table>
              
              <button className="btn btn-secondary" style={{ width: '100%', marginBottom: '2rem', borderStyle: 'dashed', borderWidth: '2px' }} onClick={() => {
                const newRule = { label: 'New Rule', min_age: 0, max_age: 99, target_sessions: 4, target_hours: 6, use_or_logic: true, require_weekend: true };
                const newCriteria = [...(editingCriteriaSquad.age_based_criteria || []), newRule];
                setEditingCriteriaSquad({ ...editingCriteriaSquad, age_based_criteria: newCriteria });
              }}>+ Add Age Bracket Rule</button>
            </div>

            <div style={{ padding: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: '1rem' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={async () => {
                await toggleSquad(editingCriteriaSquad.id, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, editingCriteriaSquad.age_based_criteria);
                setSquads(squads.map(s => s.id === editingCriteriaSquad.id ? editingCriteriaSquad : s));
                setEditingCriteriaSquad(null);
              }}>Save & Apply Rules</button>
              <button className="btn btn-secondary" onClick={() => setEditingCriteriaSquad(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

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

export async function getServerSideProps() {
  return {
    props: {
      scmApiKey: process.env.SCM_API_KEY || null
    }
  };
}
