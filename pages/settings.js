import { useEffect, useState, Fragment } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { authedFetch } from '../lib/api-client';
import { useRouter } from 'next/router';
import toast from 'react-hot-toast';
import { useTheme } from '../lib/ThemeContext';
import { fetchAllRows } from '../lib/paginate';

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

  const [globalPbSyncStatus, setGlobalPbSyncStatus] = useState(null);
  const [globalPbSyncProgress, setGlobalPbSyncProgress] = useState(0);
  const [isGlobalPbSyncing, setIsGlobalPbSyncing] = useState(false);

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
  const { theme, toggleTheme, themes } = useTheme();
  const [attendanceSyncStatus, setAttendanceSyncStatus] = useState(null);
  const [csvFile, setCsvFile] = useState(null);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvMapping, setCsvMapping] = useState({ date: '', swimmer: '', session: '' });
  const [importStatus, setImportStatus] = useState(null);
  const [sessionSyncStatus, setSessionSyncStatus] = useState(null);
  const [sessionSyncProgress, setSessionSyncProgress] = useState(0);
  const [isSessionSyncing, setIsSessionSyncing] = useState(false);
  const [editingCriteriaSquad, setEditingCriteriaSquad] = useState(null);
  const [editingBrainSquad, setEditingBrainSquad] = useState(null);
  const [isDetectingGaps, setIsDetectingGaps] = useState(false);
  const [gapStatus, setGapStatus] = useState(null);
  const [isReconcilingPbs, setIsReconcilingPbs] = useState(false);
  const [pbSyncStatus, setPbSyncStatus] = useState(null);
  const [masterSyncState, setMasterSyncState] = useState({ active: false, step: 0, message: '' });

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('coach');
  const [inviteStatus, setInviteStatus] = useState(null);

  const [resetPasswordCoach, setResetPasswordCoach] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetPasswordStatus, setResetPasswordStatus] = useState(null);

  const [aiSettings, setAiSettings] = useState({
    struggling_consistency_threshold: 60,
    struggling_volume_threshold: 90,
    min_wa_points_threshold: 250,
    exempt_volume_offset: true
  });
  const [isSavingAiSettings, setIsSavingAiSettings] = useState(false);
  const [aiSettingsStatus, setAiSettingsStatus] = useState(null);

  // Timetable
  const [timetableSessions, setTimetableSessions] = useState([]);
  const [editingSession, setEditingSession] = useState(null); // { id, name, day_of_week, start_time, end_time, location, lanes_allocated, is_active }
  const [sharedSessionsConfig, setSharedSessionsConfig] = useState({});
  const [editingSessionSplits, setEditingSessionSplits] = useState({});
  const [timetableStatus, setTimetableStatus] = useState(null);
  const [showAddSession, setShowAddSession] = useState(false);
  const [newSession, setNewSession] = useState({ name: '', day_of_week: 'Monday', start_time: '', end_time: '', location: '', lanes_allocated: 6 });


  useEffect(() => {
    if (session === undefined) return;
    if (!session) {
      router.push('/login');
      return;
    }
    checkAdmin();
  }, [session, router]);

  const handleMasterSync = async () => {
    setMasterSyncState({ active: true, step: 1, message: 'Phase 1: Syncing SCM Baseline...' });
    try {
      await authedFetch('/api/sync-scm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scmApiKey: scmKey }) });

      setMasterSyncState({ active: true, step: 2, message: 'Phase 2: Syncing Training Attendance...' });
      await authedFetch('/api/sync-attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scmApiKey: scmKey }) });

      setMasterSyncState({ active: false, step: 3, message: 'Daily Master Sync Complete! System is up to date.' });
      loadData();
      setTimeout(() => setMasterSyncState({ active: false, step: 0, message: '' }), 5000);
    } catch (error) {
      console.error(error);
      setMasterSyncState({ active: false, step: 0, message: `Error: ${error.message}` });
    }
  };

  const handleSyncAttendance = async () => {
    setAttendanceSyncStatus({ type: 'info', text: 'Syncing Training Attendance...' });
    try {
      const res = await authedFetch('/api/sync-attendance', {
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
      const res = await authedFetch('/api/import-attendance', {
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
    // swimmersArr is a plain array (paginated); the rest are Supabase responses.
    const [profilesRes, squadsRes, csRes, meetsRes, swimmersArr, exemptRes, sessionsRes] = await Promise.all([
      supabase.from('profiles').select('*').order('email'),
      supabase.from('squads').select('*').order('name'),
      supabase.from('coach_squads').select('*'),
      supabase.from('meets').select('*').gte('date', new Date(Date.now() - 450 * 86400000).toISOString().split('T')[0]).order('date', { ascending: false }),
      fetchAllRows(supabase, 'swimmers', { select: '*, squads(name)', filter: q => q.order('full_name') }),
      supabase.from('club_exemptions').select('*').order('start_date', { ascending: false }),
      supabase.from('sessions').select('*').order('day_of_week').order('start_time')
    ]);

    if (profilesRes.data) setCoaches(profilesRes.data);
    if (squadsRes.data) setSquads(squadsRes.data);
    if (csRes.data) setCoachSquads(csRes.data);
    if (meetsRes.data) setMeets(meetsRes.data);
    if (swimmersArr) setSwimmers(swimmersArr);
    if (exemptRes.data) setClubExemptions(exemptRes.data);
    if (sessionsRes.data) {
      const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const normalized = sessionsRes.data.map(s => {
        if (!s.day_of_week) {
          const match = DAY_NAMES.find(d => s.name?.toLowerCase().includes(d.toLowerCase()));
          if (match) return { ...s, day_of_week: match };
        }
        return s;
      });
      setTimetableSessions(normalized);
    }

    // Fetch custom AI settings from database
    try {
      const { data: settingsRow } = await supabase
        .from('ai_brain_settings')
        .select('value')
        .eq('key', 'pathway_transition')
        .single();
      if (settingsRow && settingsRow.value) {
        setAiSettings(settingsRow.value);
      }
    } catch (e) {
      console.warn("No custom AI settings found in DB, using defaults.");
    }

    // Fetch shared sessions config from database
    try {
      const { data: sharedRow } = await supabase
        .from('ai_brain_settings')
        .select('value')
        .eq('key', 'shared_sessions_config')
        .single();
      if (sharedRow && sharedRow.value) {
        setSharedSessionsConfig(sharedRow.value);
      }
    } catch (e) {
      console.warn("No shared sessions config found in DB.");
    }
  };

  const saveAiSettings = async (e) => {
    if (e) e.preventDefault();
    setIsSavingAiSettings(true);
    setAiSettingsStatus({ type: 'info', text: 'Saving AI Brain settings...' });
    try {
      const { error } = await supabase
        .from('ai_brain_settings')
        .upsert({
          key: 'pathway_transition',
          value: aiSettings,
          updated_at: new Date().toISOString()
        });
      if (error) throw error;
      setAiSettingsStatus({ type: 'success', text: 'AI Brain settings saved successfully!' });
      toast.success('AI Brain settings saved successfully!');
    } catch (err) {
      setAiSettingsStatus({ type: 'error', text: `Failed to save: ${err.message}` });
      toast.error(`Failed to save AI Brain settings: ${err.message}`);
    } finally {
      setIsSavingAiSettings(false);
    }
  };

  // ─── Timetable CRUD ───────────────────────────────────────────────────────
  const DAY_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

  const startEditingSession = (sess) => {
    setEditingSession({
      id: sess.id,
      name: sess.name,
      day_of_week: sess.day_of_week,
      start_time: sess.start_time || '',
      end_time: sess.end_time || '',
      location: sess.location || '',
      lanes_allocated: sess.lanes_allocated,
      is_active: !!sess.is_active,
      scm_guid: sess.scm_guid
    });
    const existingSplits = sharedSessionsConfig?.[sess.id] || sharedSessionsConfig?.[sess.scm_guid] || sharedSessionsConfig?.[sess.name] || {};
    setEditingSessionSplits(existingSplits);
  };

  const saveSession = async () => {
    if (!editingSession) return;
    setTimetableStatus({ type: 'info', text: 'Saving...' });
    const { id, scm_guid, ...fields } = editingSession;
    const { error } = await supabase.from('sessions').update(fields).eq('id', id);
    if (error) {
      setTimetableStatus({ type: 'error', text: error.message });
    } else {
      // Update shared sessions config
      const updatedConfig = { ...sharedSessionsConfig };
      const hasSplits = Object.values(editingSessionSplits).some(val => val > 0);
      
      if (hasSplits) {
        updatedConfig[id] = editingSessionSplits;
      } else {
        delete updatedConfig[id];
        if (scm_guid) delete updatedConfig[scm_guid];
        delete updatedConfig[editingSession.name];
      }

      const { error: settingsError } = await supabase
        .from('ai_brain_settings')
        .upsert({
          key: 'shared_sessions_config',
          value: updatedConfig,
          updated_at: new Date().toISOString()
        });

      if (settingsError) {
        console.error('Failed to save shared sessions config:', settingsError);
      } else {
        setSharedSessionsConfig(updatedConfig);
      }

      setTimetableSessions(prev => prev.map(s => s.id === id ? { ...s, ...fields } : s));
      setEditingSession(null);
      setEditingSessionSplits({});
      setTimetableStatus({ type: 'success', text: 'Session saved.' });
      setTimeout(() => setTimetableStatus(null), 3000);
    }
  };

  const addSession = async () => {
    if (!newSession.name || !newSession.day_of_week) return;
    setTimetableStatus({ type: 'info', text: 'Adding session...' });
    const { data, error } = await supabase.from('sessions').insert([newSession]).select();
    if (error) {
      setTimetableStatus({ type: 'error', text: error.message });
    } else {
      setTimetableSessions(prev => [...prev, ...(data || [])]);
      setNewSession({ name: '', day_of_week: 'Monday', start_time: '', end_time: '', location: '', lanes_allocated: 6 });
      setShowAddSession(false);
      setTimetableStatus({ type: 'success', text: 'Session added.' });
      setTimeout(() => setTimetableStatus(null), 3000);
    }
  };

  const deleteSession = async (id, name) => {
    if (!window.confirm(`Delete session "${name}"? This will also remove all swimmer memberships for this session.`)) return;
    setTimetableStatus({ type: 'info', text: 'Deleting...' });
    const targetSess = timetableSessions.find(s => s.id === id);
    const { error } = await supabase.from('sessions').delete().eq('id', id);
    if (error) {
      setTimetableStatus({ type: 'error', text: error.message });
    } else {
      // Remove splits if any
      const updatedConfig = { ...sharedSessionsConfig };
      delete updatedConfig[id];
      if (targetSess?.scm_guid) delete updatedConfig[targetSess.scm_guid];
      delete updatedConfig[name];

      const { error: settingsError } = await supabase
        .from('ai_brain_settings')
        .upsert({
          key: 'shared_sessions_config',
          value: updatedConfig,
          updated_at: new Date().toISOString()
        });

      if (settingsError) {
        console.error('Failed to update shared sessions config on delete:', settingsError);
      } else {
        setSharedSessionsConfig(updatedConfig);
      }

      setTimetableSessions(prev => prev.filter(s => s.id !== id));
      setTimetableStatus({ type: 'success', text: `"${name}" deleted.` });
      setTimeout(() => setTimetableStatus(null), 3000);
    }
  };
  // ─────────────────────────────────────────────────────────────────────────

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

  const toggleRankedMember = async (swimmerId, isRanked) => {
    const { error } = await supabase.from('swimmers').update({ is_ranked_member: isRanked }).eq('id', swimmerId);
    if (error) { setDebugLog(`DB ERROR: ${error.message}`); return; }
    setSwimmers(swimmers.map(s => s.id === swimmerId ? { ...s, is_ranked_member: isRanked } : s));
    setDebugLog(`${isRanked ? 'Marked as ranked member' : 'Marked as non-ranked (2nd club)'}.`);
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
      const res = await authedFetch('/api/detect-missing-sessions', {
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
      const res = await authedFetch('/api/reconcile-pbs', {
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
      const res = await authedFetch('/api/sync-scm', { 
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

        const res = await authedFetch('/api/sync-session-memberships', {
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
    const response = await authedFetch('/api/scrape-meets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ swimmingYear }) });
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
            if (data.isDone) {
              setIsScraping(false);
              loadData();
              if (data.error) toast.error(data.message || 'Scrape failed');
              else toast.success(data.message || 'Scrape complete!');
            }
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
      const response = await authedFetch('/api/scrape-rankings', { 
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
                if (data.error) toast.error(data.message || 'Rankings scrape failed');
                else toast.success(data.message || 'Rankings sync complete!');
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

  const handleGlobalPbSync = async (e) => {
    if (e) e.preventDefault();
    setIsGlobalPbSyncing(true);
    setGlobalPbSyncProgress(0);
    setGlobalPbSyncStatus({ type: 'info', text: 'Starting Global PB Sync...' });

    try {
      const response = await authedFetch('/api/sync-pbs', { 
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
              setGlobalPbSyncStatus({ type: data.error ? 'error' : 'info', text: data.message });
              setGlobalPbSyncProgress(data.progress);
              if (data.isDone) {
                setIsGlobalPbSyncing(false);
                setGlobalPbSyncStatus({ type: data.error ? 'error' : 'success', text: data.message });
                if (data.error) toast.error(data.message || 'PB sync failed');
                else toast.success(data.message || 'PB sync complete!');
              }
            } catch (e) {
              console.error('Error parsing SSE:', e);
            }
          }
        }
      }
    } catch (err) {
      setGlobalPbSyncStatus({ type: 'error', text: err.message });
      setIsGlobalPbSyncing(false);
    }
  };

  const handleHistoricalAttendanceSync = async (e) => {
    e.preventDefault();
    setIsAttendanceScraping(true);
    setAttendanceScrapeStatus({ type: 'info', text: 'Preparing sync...' });
    setAttendanceScrapeProgress(0);
    
    console.log("Starting Historical Attendance Sync request...");
    const response = await authedFetch('/api/sync-attendance');
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
    
    const response = await authedFetch('/api/sync-join-dates');
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

  const toggleSquad = async (squadId, isSquad, targetMeets, targetSessionsPerWeek, targetTrainingPercent, targetHoursPerWeek, requireWeekend, useOrLogic, wRel, wProg, wComp, wVol, holidayAllowance, ageBasedCriteria, strugglingConsistency, strugglingVolume, minWaPoints, exemptVolume, swimmersPerLane) => {
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
      holiday_allowance: typeof holidayAllowance === 'number' ? holidayAllowance : s.holiday_allowance,
      struggling_consistency_threshold: strugglingConsistency !== undefined ? strugglingConsistency : s.struggling_consistency_threshold,
      struggling_volume_threshold: strugglingVolume !== undefined ? strugglingVolume : s.struggling_volume_threshold,
      min_wa_points_threshold: minWaPoints !== undefined ? minWaPoints : s.min_wa_points_threshold,
      exempt_volume_offset: exemptVolume !== undefined ? exemptVolume : s.exempt_volume_offset,
      swimmers_per_lane: typeof swimmersPerLane === 'number' ? swimmersPerLane : s.swimmers_per_lane
    } : s));
    await authedFetch('/api/update-squad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
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
        age_based_criteria: ageBasedCriteria,
        struggling_consistency_threshold: strugglingConsistency,
        struggling_volume_threshold: strugglingVolume,
        min_wa_points_threshold: minWaPoints,
        exempt_volume_offset: exemptVolume,
        swimmersPerLane
      }) 
    });
  };

  const toggleCoachSquad = async (coachId, squadId, assign) => {
    if (assign) setCoachSquads([...coachSquads, { coach_id: coachId, squad_id: squadId }]);
    else setCoachSquads(coachSquads.filter(cs => !(cs.coach_id === coachId && cs.squad_id === squadId)));
    await authedFetch('/api/assign-coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coachId, squadId, assign }) });
  };

  const handleInviteCoach = async (e) => {
    e.preventDefault();
    setInviteStatus({ type: 'info', text: 'Inviting...' });
    try {
      const res = await authedFetch('/api/invite-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
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

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetPasswordStatus({ type: 'info', text: 'Updating password...' });
    try {
      const res = await authedFetch('/api/update-coach-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ coachId: resetPasswordCoach.id, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset password');
      setResetPasswordStatus({ type: 'success', text: 'Password successfully updated!' });
      setTimeout(() => {
        setResetPasswordCoach(null);
        setNewPassword('');
        setResetPasswordStatus(null);
      }, 2000);
    } catch (err) {
      setResetPasswordStatus({ type: 'error', text: err.message });
    }
  };

  const handleDeleteCoach = async (coachId, coachEmail) => {
    if (!window.confirm(`Are you sure you want to permanently delete the coach ${coachEmail}? This action cannot be undone.`)) {
      return;
    }
    
    try {
      const res = await authedFetch('/api/delete-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ coachId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete coach');
      
      setCoaches(coaches.filter(c => c.id !== coachId));
      alert('Coach successfully deleted.');
    } catch (err) {
      alert('Error deleting coach: ' + err.message);
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
          <SidebarItem id="timetable" label="Timetable" icon="📆" />
          <SidebarItem id="coaches" label="Coaches" icon="👔" />
          <SidebarItem id="appearance" label="Appearance" icon="🎨" />
          <SidebarItem id="aibrain" label="AI Brain" icon="🧠" />
        </div>

        {/* MAIN PANEL */}
        <div className="settings-panel">
          {activePanel === 'system' && (
            <div className="panel-content">
              <h1>System Sync</h1>

              {/* ── Master Sync Card ── */}
              <div className="card" style={{
                background: 'linear-gradient(135deg, rgba(6,182,212,0.08) 0%, rgba(59,130,246,0.06) 100%)',
                border: '1px solid rgba(6,182,212,0.25)',
                borderRadius: '20px',
                padding: '2.5rem',
                marginBottom: '1rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '2rem' }}>⚡</span>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>Daily System Sync</h2>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      Runs SCM member sync followed by training attendance in one click.
                    </p>
                  </div>
                </div>

                {/* Step indicators */}
                <div style={{ display: 'flex', gap: '1rem', margin: '1.5rem 0', flexWrap: 'wrap' }}>
                  {[
                    { step: 1, label: 'SCM Baseline' },
                    { step: 2, label: 'Attendance' },
                    { step: 3, label: 'Complete' }
                  ].map(({ step, label }) => {
                    const done = masterSyncState.step > step || masterSyncState.step === 3;
                    const active = masterSyncState.step === step && masterSyncState.active;
                    return (
                      <div key={step} style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.4rem 1rem', borderRadius: '50px',
                        fontSize: '0.8rem', fontWeight: 700,
                        background: done ? 'rgba(16,185,129,0.15)' : active ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.04)',
                        color: done ? 'var(--accent-emerald)' : active ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.35)',
                        border: `1px solid ${done ? 'rgba(16,185,129,0.3)' : active ? 'rgba(6,182,212,0.3)' : 'rgba(255,255,255,0.08)'}`,
                        transition: 'all 0.3s ease'
                      }}>
                        <span>{done ? '✓' : step}</span>
                        <span>{label}</span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={handleMasterSync}
                    disabled={masterSyncState.active}
                    style={{
                      padding: '0.9rem 2.5rem',
                      borderRadius: '12px',
                      fontWeight: 800,
                      fontSize: '1rem',
                      letterSpacing: '0.02em',
                      border: 'none',
                      cursor: masterSyncState.active ? 'not-allowed' : 'pointer',
                      background: masterSyncState.active
                        ? 'rgba(6,182,212,0.2)'
                        : 'linear-gradient(135deg, var(--accent-cyan), #3b82f6)',
                      color: masterSyncState.active ? 'rgba(255,255,255,0.5)' : '#fff',
                      boxShadow: masterSyncState.active ? 'none' : '0 4px 20px rgba(6,182,212,0.35)',
                      transition: 'all 0.25s ease',
                      display: 'flex', alignItems: 'center', gap: '0.6rem'
                    }}
                  >
                    {masterSyncState.active && (
                      <span style={{
                        width: '16px', height: '16px',
                        border: '2px solid rgba(255,255,255,0.3)',
                        borderTopColor: 'var(--accent-cyan)',
                        borderRadius: '50%',
                        display: 'inline-block',
                        animation: 'spin 0.8s linear infinite'
                      }} />
                    )}
                    {masterSyncState.active ? 'Syncing…' : '⚡ Run Master Sync'}
                  </button>

                  {masterSyncState.message && (
                    <p style={{
                      margin: 0,
                      fontSize: '0.9rem',
                      color: masterSyncState.message.startsWith('Error')
                        ? '#f87171'
                        : masterSyncState.step === 3
                        ? 'var(--accent-emerald)'
                        : 'var(--accent-cyan)',
                      fontWeight: 600
                    }}>
                      {masterSyncState.message}
                    </p>
                  )}
                </div>
              </div>

              {/* ── Advanced Seasonal Scrapers ── */}
              <h3 style={{ marginTop: '3rem', marginBottom: '1.5rem', opacity: 0.7, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Advanced Seasonal Scrapers
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>

                {/* Meets Scrape */}
                <div className="card">
                  <h3>🏊 Meet Scraper</h3>
                  <p className="mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>Fetch results for TONS from Swim England results portal.</p>
                  {scrapeStatus && <div className={`alert ${scrapeStatus.type === 'error' ? 'alert-error' : 'alert-success'}`}>{scrapeStatus.text}</div>}
                  <form onSubmit={handleScrape}>
                    <input type="text" className="input-field mb-4" value={swimmingYear} onChange={(e) => setSwimmingYear(e.target.value)} placeholder="Year e.g. 2025/2026" />
                    <button type="submit" className="btn btn-primary w-full" disabled={isScraping}>
                      {isScraping ? 'Scraping…' : 'Start Meet Scrape'}
                    </button>
                  </form>
                  {isScraping && <div className="progress-bg mt-4"><div className="progress-fill" style={{ width: `${scrapeProgress}%` }}></div></div>}
                </div>

                {/* Rankings Scrape */}
                <div className="card">
                  <h3>📊 Rankings Scraper</h3>
                  <p className="mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>Fetch Kent &amp; SE Region rankings for Tonbridge swimmers.</p>
                  {rankingsScrapeStatus && <div className={`alert ${rankingsScrapeStatus.type === 'error' ? 'alert-error' : 'alert-success'}`}>{rankingsScrapeStatus.text}</div>}
                  <button onClick={handleRankingsScrape} className="btn btn-primary w-full" disabled={isRankingsScraping}>
                    {isRankingsScraping ? 'Scraping…' : 'Start Rankings Scrape'}
                  </button>
                  {isRankingsScraping && (
                    <div className="progress-bg mt-4">
                      <div className="progress-fill" style={{ width: `${rankingsScrapeProgress}%` }}></div>
                    </div>
                  )}
                </div>

                {/* Join Date Sync */}
                <div className="card">
                  <h3>📅 Join Date Sync</h3>
                  <p className="mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>Scrape member join dates from SCM Portal for all active swimmers.</p>
                  {joinDateSyncStatus && <div className={`alert ${joinDateSyncStatus.type === 'error' ? 'alert-error' : 'alert-success'}`}>{joinDateSyncStatus.text}</div>}
                  <button onClick={handleJoinDateSync} className="btn btn-secondary w-full" disabled={isJoinDateSyncing}>
                    {isJoinDateSyncing ? 'Syncing…' : 'Sync Join Dates'}
                  </button>
                  {isJoinDateSyncing && (
                    <div className="progress-bg mt-4">
                      <div className="progress-fill" style={{ width: `${joinDateSyncProgress}%` }}></div>
                    </div>
                  )}
                </div>

                {/* Historical Attendance Sync */}
                <div className="card">
                  <h3>📆 Historical Attendance</h3>
                  <p className="mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>Full historical attendance backfill from SCM — slow, run seasonally.</p>
                  {attendanceScrapeStatus && <div className={`alert ${attendanceScrapeStatus.type === 'error' ? 'alert-error' : 'alert-success'}`}>{attendanceScrapeStatus.text}</div>}
                  <button onClick={handleHistoricalAttendanceSync} className="btn btn-secondary w-full" disabled={isAttendanceScraping}>
                    {isAttendanceScraping ? 'Syncing…' : 'Start Historical Sync'}
                  </button>
                  {isAttendanceScraping && (
                    <div className="progress-bg mt-4">
                      <div className="progress-fill" style={{ width: `${attendanceScrapeProgress}%` }}></div>
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

          {activePanel === 'appearance' && (
            <div className="panel-content">
              <h1>Appearance & Theme</h1>
              <p className="mb-8" style={{ color: 'var(--text-secondary)' }}>
                Customize the visual interface of the Open Meet Dashboard. Select a color palette that suits your preferences.
              </p>

              <div className="theme-grid">
                {[
                  {
                    id: themes.MIDNIGHT,
                    name: 'Midnight Stealth',
                    desc: 'The original dark mode. Sleek, high-contrast, and focused.',
                    bg: '#050b10',
                    deep: '#0a1921',
                    accent: '#0096ff',
                    teal: '#2dd4bf'
                  },
                  {
                    id: themes.SOLAR,
                    name: 'Solar Flare',
                    desc: 'Warm and vibrant tones inspired by desert sunrises.',
                    bg: '#120d0b',
                    deep: '#1c1411',
                    accent: '#f59e0b',
                    teal: '#f97316'
                  },
                  {
                    id: themes.NORDIC,
                    name: 'Nordic Ice',
                    desc: 'Cool slate blues and frosty whites for a calm aesthetic.',
                    bg: '#0f172a',
                    deep: '#1e293b',
                    accent: '#38bdf8',
                    teal: '#94a3b8'
                  },
                  {
                    id: themes.EMERALD,
                    name: 'Emerald Elite',
                    desc: 'Deep forest greens and rich emeralds for a prestigious feel.',
                    bg: '#06120e',
                    deep: '#0b2119',
                    accent: '#10b981',
                    teal: '#059669'
                  }
                ].map((t) => {
                  const isActive = theme === t.id;
                  return (
                    <div 
                      key={t.id} 
                      onClick={() => toggleTheme(t.id)}
                      className={`theme-card ${isActive ? 'active' : ''}`}
                    >
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>{t.name}</h3>
                          {isActive && (
                            <span className="theme-card-badge">Active</span>
                          )}
                        </div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4, margin: '0.5rem 0 1rem 0' }}>{t.desc}</p>
                      </div>

                      <div className="flex justify-between items-center mt-auto pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <div className="flex gap-2">
                          <div className="color-dot" style={{ backgroundColor: t.bg }} title="Background" />
                          <div className="color-dot" style={{ backgroundColor: t.deep }} title="Secondary Cards" />
                          <div className="color-dot" style={{ backgroundColor: t.accent }} title="Primary Accent" />
                          <div className="color-dot" style={{ backgroundColor: t.teal }} title="Secondary Accent" />
                        </div>
                        
                        <div style={{ display: 'flex', gap: '4px', background: t.bg, padding: '4px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                          <div style={{ width: '8px', height: '16px', background: t.deep, borderRadius: '2px' }} />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div style={{ width: '24px', height: '6px', background: t.accent, borderRadius: '1px' }} />
                            <div style={{ width: '16px', height: '4px', background: 'rgba(255,255,255,0.3)', borderRadius: '1px' }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activePanel === 'timetable' && (() => {
            const sessionsByDay = DAY_ORDER.map(day => ({
              day,
              sessions: timetableSessions
                .filter(s => s.day_of_week?.toLowerCase() === day.toLowerCase())
                .sort((a,b) => (a.start_time||'').localeCompare(b.start_time||''))
            }));
            return (
              <div className="panel-content">
                <h1>Timetable</h1>
                <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
                  View and edit training sessions. Sessions synced from SCM are marked with an <strong style={{color:'var(--accent-cyan)'}}>SCM</strong> badge — fields other than <em>Lanes</em> may be overwritten on next SCM sync. Manually added sessions (no SCM badge) are never touched by sync.
                </p>

                {timetableStatus && (
                  <div className={`alert ${timetableStatus.type === 'error' ? 'alert-error' : timetableStatus.type === 'success' ? 'alert-success' : 'alert-info'} mb-6`}>
                    {timetableStatus.text}
                  </div>
                )}

                {sessionsByDay.map(({ day, sessions }) => sessions.length === 0 ? null : (
                  <div key={day} className="card mb-6">
                    <h3 className="mb-4" style={{ color: 'var(--accent-cyan)', display:'flex', alignItems:'center', gap:'8px' }}>
                      <span style={{ fontSize:'1rem' }}>📆</span> {day}
                      <span style={{ fontSize:'0.75rem', fontWeight:400, opacity:0.5, marginLeft:'4px' }}>{sessions.length} session{sessions.length !== 1 ? 's' : ''}</span>
                    </h3>
                    <div style={{ overflowX:'auto' }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.85rem' }}>
                        <thead>
                          <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
                            {['Name','Start','End','Location','Lanes','Active',''].map(h => (
                              <th key={h} style={{ padding:'6px 12px', textAlign:'left', opacity:0.5, fontWeight:700, textTransform:'uppercase', fontSize:'0.7rem', letterSpacing:'0.08em' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sessions.map(sess => (
                            editingSession?.id === sess.id ? (
                              <Fragment key={sess.id}>
                                <tr style={{ background:'rgba(6,182,212,0.06)', borderBottom:'none' }}>
                                  <td style={{ padding:'8px 12px' }}>
                                    <input className="input-field m-0" style={{width:'100%',minWidth:'140px'}} value={editingSession.name}
                                      onChange={e => setEditingSession(es => ({...es, name: e.target.value}))} />
                                  </td>
                                  <td style={{ padding:'8px 12px' }}>
                                    <input className="input-field m-0" type="time" style={{width:'100px'}} value={editingSession.start_time||''}
                                      onChange={e => setEditingSession(es => ({...es, start_time: e.target.value}))} />
                                  </td>
                                  <td style={{ padding:'8px 12px' }}>
                                    <input className="input-field m-0" type="time" style={{width:'100px'}} value={editingSession.end_time||''}
                                      onChange={e => setEditingSession(es => ({...es, end_time: e.target.value}))} />
                                  </td>
                                  <td style={{ padding:'8px 12px' }}>
                                    <input className="input-field m-0" style={{width:'120px'}} value={editingSession.location||''}
                                      onChange={e => setEditingSession(es => ({...es, location: e.target.value}))} />
                                  </td>
                                  <td style={{ padding:'8px 12px' }}>
                                    <input className="input-field m-0" type="number" min="1" max="20" style={{width:'60px',textAlign:'center'}} value={editingSession.lanes_allocated||''}
                                      onChange={e => setEditingSession(es => ({...es, lanes_allocated: parseInt(e.target.value)||null}))} />
                                  </td>
                                  <td style={{ padding:'8px 12px' }}>
                                    <label style={{display:'flex',alignItems:'center',gap:'6px',cursor:'pointer'}}>
                                      <input type="checkbox" checked={!!editingSession.is_active}
                                        onChange={e => setEditingSession(es => ({...es, is_active: e.target.checked}))} />
                                      <span style={{fontSize:'0.75rem',opacity:0.7}}>{editingSession.is_active ? 'Active' : 'Inactive'}</span>
                                    </label>
                                  </td>
                                  <td style={{ padding:'8px 12px', whiteSpace:'nowrap' }}>
                                    <button className="btn btn-primary" style={{fontSize:'0.75rem',padding:'4px 12px',marginRight:'6px'}} onClick={saveSession}>Save</button>
                                    <button className="btn btn-secondary" style={{fontSize:'0.75rem',padding:'4px 12px'}} onClick={() => { setEditingSession(null); setEditingSessionSplits({}); }}>Cancel</button>
                                  </td>
                                </tr>
                                <tr style={{ background:'rgba(6,182,212,0.06)', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                                  <td colSpan="7" style={{ padding:'12px 24px', borderTop:'1px dashed rgba(255,255,255,0.05)' }}>
                                    <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                                      <span style={{ fontSize:'0.75rem', fontWeight:800, color:'var(--accent-cyan)', display:'flex', alignItems:'center', gap:'6px' }}>
                                        🥞 Optional Shared Session Lane Splits
                                      </span>
                                      <span style={{ fontSize:'0.7rem', opacity:0.6 }}>
                                        Specify a portion of lanes for specific squads. Leave a squad at 0 or empty to not allocate specific lanes. Sum of splits must be less than or equal to total lanes ({editingSession.lanes_allocated || 6}).
                                      </span>
                                      <div style={{ display:'flex', flexWrap:'wrap', gap:'12px', marginTop:'6px' }}>
                                        {squads.filter(s => s.is_squad).map(sq => {
                                          const val = editingSessionSplits[sq.id] || '';
                                          return (
                                            <div key={sq.id} style={{ display:'flex', alignItems:'center', gap:'8px', background:'rgba(255,255,255,0.03)', padding:'4px 8px', borderRadius:'6px', border:'1px solid rgba(255,255,255,0.05)' }}>
                                              <span style={{ fontSize:'0.75rem', fontWeight:600 }}>{sq.name}</span>
                                              <input
                                                type="number"
                                                min="0"
                                                max={editingSession.lanes_allocated || 6}
                                                style={{ width:'50px', background:'#0f172a', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'4px', color:'#fff', fontSize:'0.75rem', padding:'2px 4px', textAlign:'center' }}
                                                value={val}
                                                onChange={e => {
                                                  const newLanes = parseInt(e.target.value);
                                                  setEditingSessionSplits(prev => {
                                                    const updated = { ...prev };
                                                    if (isNaN(newLanes) || newLanes <= 0) {
                                                      delete updated[sq.id];
                                                    } else {
                                                      updated[sq.id] = newLanes;
                                                    }
                                                    return updated;
                                                  });
                                                }}
                                              />
                                              <span style={{ fontSize:'0.7rem', opacity:0.5 }}>Lanes</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              </Fragment>
                            ) : (
                              <tr key={sess.id} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)', transition:'background 0.15s' }}
                                  onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.03)'}
                                  onMouseLeave={e => e.currentTarget.style.background=''}>
                                <td style={{ padding:'10px 12px', fontWeight:600 }}>
                                  {sess.name}
                                  {sess.scm_guid && <span style={{ marginLeft:'6px', fontSize:'0.65rem', fontWeight:800, background:'rgba(6,182,212,0.15)', color:'var(--accent-cyan)', border:'1px solid rgba(6,182,212,0.25)', borderRadius:'4px', padding:'1px 5px', verticalAlign:'middle' }}>SCM</span>}
                                </td>
                                <td style={{ padding:'10px 12px', opacity:0.8 }}>{sess.start_time || '—'}</td>
                                <td style={{ padding:'10px 12px', opacity:0.8 }}>{sess.end_time || '—'}</td>
                                <td style={{ padding:'10px 12px', opacity:0.6, fontSize:'0.8rem' }}>{sess.location || '—'}</td>
                                <td style={{ padding:'10px 12px' }}>
                                  <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                                    <span style={{ fontWeight:700, color:'var(--accent-cyan)' }}>{sess.lanes_allocated ?? '—'}</span>
                                    {(() => {
                                      const splits = sharedSessionsConfig?.[sess.id] || sharedSessionsConfig?.[sess.scm_guid] || sharedSessionsConfig?.[sess.name];
                                      if (splits && Object.keys(splits).length > 0) {
                                        const tooltipText = Object.entries(splits)
                                          .map(([sqId, lanes]) => {
                                            const sq = squads.find(s => s.id === sqId || s.name === sqId);
                                            return `${sq?.name || sqId}: ${lanes}L`;
                                          })
                                          .join('\n');
                                        return (
                                          <span
                                            title={`Shared Session Splits:\n${tooltipText}`}
                                            style={{
                                              fontSize:'0.65rem',
                                              fontWeight:800,
                                              background:'rgba(244,158,11,0.15)',
                                              color:'#f59e0b',
                                              border:'1px solid rgba(244,158,11,0.25)',
                                              borderRadius:'4px',
                                              padding:'1px 5px',
                                              cursor:'help'
                                            }}
                                          >
                                            🥞 Shared
                                          </span>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </div>
                                </td>
                                <td style={{ padding:'10px 12px' }}>
                                  <span style={{ fontSize:'0.7rem', fontWeight:700, padding:'2px 7px', borderRadius:'20px',
                                    background: sess.is_active ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.1)',
                                    color: sess.is_active ? 'var(--accent-emerald)' : '#f87171'
                                  }}>{sess.is_active ? 'Active' : 'Inactive'}</span>
                                </td>
                                <td style={{ padding:'10px 12px', whiteSpace:'nowrap' }}>
                                  <button className="btn btn-secondary" style={{fontSize:'0.75rem',padding:'4px 12px',marginRight:'6px'}}
                                    onClick={() => startEditingSession(sess)}>Edit</button>
                                  <button style={{ fontSize:'0.75rem', padding:'4px 10px', background:'rgba(239,68,68,0.12)', color:'#f87171', border:'1px solid rgba(239,68,68,0.2)', borderRadius:'6px', cursor:'pointer' }}
                                    onClick={() => deleteSession(sess.id, sess.name)}>Delete</button>
                                </td>
                              </tr>
                            )
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}

                {/* Add Session */}
                <div className="card" style={{ border: showAddSession ? '1px solid rgba(6,182,212,0.3)' : undefined }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: showAddSession ? '1.5rem' : 0 }}>
                    <h3 style={{ margin:0 }}>Add Session</h3>
                    <button className={`btn ${showAddSession ? 'btn-secondary' : 'btn-primary'}`} style={{fontSize:'0.8rem',padding:'6px 16px'}} onClick={() => setShowAddSession(v => !v)}>
                      {showAddSession ? 'Cancel' : '+ Add Session'}
                    </button>
                  </div>
                  {showAddSession && (
                    <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 80px', gap:'12px', alignItems:'end' }}>
                      <div>
                        <label style={{ fontSize:'0.7rem', opacity:0.5, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:'4px' }}>Session Name</label>
                        <input className="input-field m-0" placeholder="e.g. Age Dev Saturday AM" value={newSession.name} onChange={e => setNewSession(ns => ({...ns, name: e.target.value}))} />
                      </div>
                      <div>
                        <label style={{ fontSize:'0.7rem', opacity:0.5, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:'4px' }}>Day</label>
                        <select className="input-field m-0" value={newSession.day_of_week} onChange={e => setNewSession(ns => ({...ns, day_of_week: e.target.value}))}>
                          {DAY_ORDER.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize:'0.7rem', opacity:0.5, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:'4px' }}>Start</label>
                        <input className="input-field m-0" type="time" value={newSession.start_time} onChange={e => setNewSession(ns => ({...ns, start_time: e.target.value}))} />
                      </div>
                      <div>
                        <label style={{ fontSize:'0.7rem', opacity:0.5, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:'4px' }}>End</label>
                        <input className="input-field m-0" type="time" value={newSession.end_time} onChange={e => setNewSession(ns => ({...ns, end_time: e.target.value}))} />
                      </div>
                      <div>
                        <label style={{ fontSize:'0.7rem', opacity:0.5, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:'4px' }}>Lanes</label>
                        <input className="input-field m-0" type="number" min="1" max="20" style={{textAlign:'center'}} value={newSession.lanes_allocated} onChange={e => setNewSession(ns => ({...ns, lanes_allocated: parseInt(e.target.value)||6}))} />
                      </div>
                      <div style={{ gridColumn:'1 / -1', display:'flex', gap:'8px', alignItems:'center' }}>
                        <div style={{ flex:1 }}>
                          <label style={{ fontSize:'0.7rem', opacity:0.5, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:'4px' }}>Location (optional)</label>
                          <input className="input-field m-0" placeholder="e.g. Main Pool" value={newSession.location} onChange={e => setNewSession(ns => ({...ns, location: e.target.value}))} />
                        </div>
                        <button className="btn btn-primary" style={{ marginTop:'22px', whiteSpace:'nowrap' }} onClick={addSession} disabled={!newSession.name}>
                          Add Session
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {activePanel === 'aibrain' && (
            <div className="panel-content">
              <h1>CoachesEye AI Brain Settings</h1>
              <p className="mb-8" style={{ color: 'var(--text-secondary)' }}>
                Configure the threshold parameters used by the pathway transition intelligence engine. These settings apply globally when determining if competitive swimmers are struggling and should be transitioned to non-competitive squads.
              </p>

              <div className="card">
                <h3 className="mb-6">Pathway Transition Thresholds</h3>
                {aiSettingsStatus && (
                  <div className={`alert ${aiSettingsStatus.type === 'error' ? 'alert-error' : (aiSettingsStatus.type === 'success' ? 'alert-success' : 'alert-info')} mb-6`}>
                    {aiSettingsStatus.text}
                  </div>
                )}
                
                <form onSubmit={saveAiSettings} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-xs uppercase tracking-widest opacity-50 block mb-2 font-bold">Struggling Attendance Consistency Threshold</label>
                      <p className="text-xs opacity-40 mb-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Swimmers with consistency below this percentage will be flagged for transition (Default: 60%).</p>
                      <div className="flex items-center gap-2">
                        <input 
                          type="number" 
                          className="input-field m-0" 
                          min="0"
                          max="100"
                          value={aiSettings.struggling_consistency_threshold} 
                          onChange={(e) => setAiSettings({ ...aiSettings, struggling_consistency_threshold: parseInt(e.target.value) || 0 })}
                        />
                        <span className="text-sm opacity-40">%</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs uppercase tracking-widest opacity-50 block mb-2 font-bold">Struggling Workload Volume Threshold</label>
                      <p className="text-xs opacity-40 mb-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Swimmers with workload volume achieved below this percentage will be flagged for transition (Default: 90%).</p>
                      <div className="flex items-center gap-2">
                        <input 
                          type="number" 
                          className="input-field m-0" 
                          min="0"
                          max="200"
                          value={aiSettings.struggling_volume_threshold} 
                          onChange={(e) => setAiSettings({ ...aiSettings, struggling_volume_threshold: parseInt(e.target.value) || 0 })}
                        />
                        <span className="text-sm opacity-40">%</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-white/5">
                    <div>
                      <label className="text-xs uppercase tracking-widest opacity-50 block mb-2 font-bold">Competitive Exclusion WA Points Threshold</label>
                      <p className="text-xs opacity-40 mb-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Swimmers with peak World Aquatics points at or above this value are excluded from demotions regardless of training gaps. (Note: The engine scales expectations dynamically for younger athletes under 12.)</p>
                      <div className="flex items-center gap-2">
                        <input 
                          type="number" 
                          className="input-field m-0" 
                          min="0"
                          value={aiSettings.min_wa_points_threshold} 
                          onChange={(e) => setAiSettings({ ...aiSettings, min_wa_points_threshold: parseInt(e.target.value) || 0 })}
                        />
                        <span className="text-sm opacity-40">pts</span>
                      </div>
                    </div>

                    <div className="flex items-center pt-6">
                      <label className="flex items-center gap-3 cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded border-slate-700 bg-slate-900 accent-blue-500"
                          style={{ minWidth: '16px', minHeight: '16px' }}
                          checked={aiSettings.exempt_volume_offset}
                          onChange={(e) => setAiSettings({ ...aiSettings, exempt_volume_offset: e.target.checked })}
                        />
                        <div>
                          <span className="text-sm font-semibold block">Enable Volume Offset Exemption</span>
                          <span className="text-xs opacity-40 block font-medium" style={{ color: 'var(--text-secondary)' }}>Swimmers with volume &gt;= 100% are automatically exempt from demotions.</span>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end pt-6 border-t border-white/5">
                    <button 
                      type="submit" 
                      className="btn btn-primary"
                      disabled={isSavingAiSettings}
                    >
                      {isSavingAiSettings ? 'Saving Settings...' : '🧠 Save AI Brain Settings'}
                    </button>
                  </div>
                </form>
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
                          const res = await authedFetch('/api/import-join-dates', {
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
                  <thead><tr><th>Name</th><th>Squad</th><th className="text-center">Session Exempt</th><th className="text-center">Ranked Member</th></tr></thead>
                  <tbody>
                    {filteredSwimmers.map(s => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 600 }}>{s.full_name}</td>
                        <td><span className="badge">{s.squads?.name}</span></td>
                        <td className="text-center">
                          <button onClick={() => toggleExempt(s.id, !s.is_exempt)} className={`btn ${s.is_exempt ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '6px 12px', fontSize: '0.8rem', background: s.is_exempt ? 'var(--danger-color)' : '' }}>{s.is_exempt ? 'Exempt' : 'Include'}</button>
                        </td>
                        <td className="text-center">
                          <button
                            onClick={() => toggleRankedMember(s.id, s.is_ranked_member === false ? true : false)}
                            className={`btn ${s.is_ranked_member === false ? 'btn-secondary' : 'btn-primary'}`}
                            style={{ padding: '6px 12px', fontSize: '0.8rem', background: s.is_ranked_member === false ? 'var(--danger-color)' : '' }}
                          >{s.is_ranked_member === false ? '2nd Club' : 'Ranked'}</button>
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
                      <th className="text-center" title="Swimmers per Lane Capacity">Sw/Lane</th>
                      <th className="text-center">Config</th>
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
                            <input 
                              type="number" 
                              className="input-field" 
                              style={{ width: '45px', textAlign: 'center', padding: '4px' }} 
                              value={s.swimmers_per_lane ?? 8} 
                              onChange={(e) => toggleSquad(s.id, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, parseInt(e.target.value))} 
                              disabled={!s.is_squad} 
                            />
                          </td>
                          <td className="text-center">
                            <div className="flex flex-col gap-1 items-center">
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '2px 6px', fontSize: '0.65rem', width: '80px' }}
                                onClick={() => setEditingCriteriaSquad(s)}
                                disabled={!s.is_squad}
                              >
                                Rules {(s.age_based_criteria?.length > 0) && `(${s.age_based_criteria.length})`}
                              </button>
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '2px 6px', fontSize: '0.65rem', width: '80px' }}
                                onClick={() => setEditingBrainSquad(s)}
                                disabled={!s.is_squad}
                                title="Pathway Transition Settings"
                              >
                                🧠 Pathway
                              </button>
                            </div>
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
                  <thead><tr><th>Email</th><th>Role</th><th>Actions</th></tr></thead>
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
                        <td style={{ display: 'flex', gap: '8px' }}>
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '4px 8px', margin: 0, fontSize: '0.75rem', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                            onClick={() => setResetPasswordCoach(c)}
                          >
                            🔑 Reset Password
                          </button>
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '4px 8px', margin: 0, fontSize: '0.75rem', color: 'var(--accent-rose)', borderColor: 'rgba(244, 63, 94, 0.3)' }}
                            onClick={() => handleDeleteCoach(c.id, c.email)}
                          >
                            🗑️ Delete
                          </button>
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

      {editingBrainSquad && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem',
          backgroundColor: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)'
        }}>
          <div className="glass-card" style={{ 
            width: '100%', 
            maxWidth: '550px', 
            overflow: 'hidden', 
            display: 'flex', 
            flexDirection: 'column',
            padding: 0,
            border: '1px solid rgba(255,255,255,0.1)'
          }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>{editingBrainSquad.name} - Pathway Settings</h2>
                <p style={{ fontSize: '0.85rem', opacity: 0.5, margin: '4px 0 0 0' }}>Configure transition thresholds for this specific squad. Unconfigured values fall back to global settings.</p>
              </div>
              <button onClick={() => setEditingBrainSquad(null)} className="btn btn-secondary">✕</button>
            </div>
            
            <div style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div>
                <label className="text-xs uppercase tracking-widest opacity-50 block mb-2 font-bold">Struggling Attendance Consistency Threshold</label>
                <p className="text-xs opacity-40 mb-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Leave blank to use global setting (Default: {aiSettings.struggling_consistency_threshold}%).</p>
                <div className="flex items-center gap-2">
                  <input 
                    type="number" 
                    placeholder={`Global (${aiSettings.struggling_consistency_threshold}%)`}
                    className="input-field m-0" 
                    min="0"
                    max="100"
                    value={editingBrainSquad.struggling_consistency_threshold ?? ''} 
                    onChange={(e) => {
                      const val = e.target.value === '' ? null : parseInt(e.target.value);
                      setEditingBrainSquad({ ...editingBrainSquad, struggling_consistency_threshold: val });
                    }}
                  />
                  <span className="text-sm opacity-40">%</span>
                </div>
              </div>

              <div>
                <label className="text-xs uppercase tracking-widest opacity-50 block mb-2 font-bold">Struggling Workload Volume Threshold</label>
                <p className="text-xs opacity-40 mb-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Leave blank to use global setting (Default: {aiSettings.struggling_volume_threshold}%).</p>
                <div className="flex items-center gap-2">
                  <input 
                    type="number" 
                    placeholder={`Global (${aiSettings.struggling_volume_threshold}%)`}
                    className="input-field m-0" 
                    min="0"
                    max="200"
                    value={editingBrainSquad.struggling_volume_threshold ?? ''} 
                    onChange={(e) => {
                      const val = e.target.value === '' ? null : parseInt(e.target.value);
                      setEditingBrainSquad({ ...editingBrainSquad, struggling_volume_threshold: val });
                    }}
                  />
                  <span className="text-sm opacity-40">%</span>
                </div>
              </div>

              <div>
                <label className="text-xs uppercase tracking-widest opacity-50 block mb-2 font-bold">Competitive Exclusion WA Points Threshold</label>
                <p className="text-xs opacity-40 mb-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Exclude high-performing swimmers. (Default: {aiSettings.min_wa_points_threshold} pts. Engine scales dynamically for under 12s.)</p>
                <div className="flex items-center gap-2">
                  <input 
                    type="number" 
                    placeholder={`Global (${aiSettings.min_wa_points_threshold} pts)`}
                    className="input-field m-0" 
                    min="0"
                    value={editingBrainSquad.min_wa_points_threshold ?? ''} 
                    onChange={(e) => {
                      const val = e.target.value === '' ? null : parseInt(e.target.value);
                      setEditingBrainSquad({ ...editingBrainSquad, min_wa_points_threshold: val });
                    }}
                  />
                  <span className="text-sm opacity-40">pts</span>
                </div>
              </div>

              <div>
                <label className="text-xs uppercase tracking-widest opacity-50 block mb-2 font-bold">Volume Offset Exemption</label>
                <p className="text-xs opacity-40 mb-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Whether workload volume &gt;= 100% exempts swimmers from transitions.</p>
                <select 
                  className="input-field m-0 w-full"
                  value={editingBrainSquad.exempt_volume_offset === null ? 'global' : (editingBrainSquad.exempt_volume_offset ? 'true' : 'false')}
                  onChange={(e) => {
                    const val = e.target.value === 'global' ? null : (e.target.value === 'true');
                    setEditingBrainSquad({ ...editingBrainSquad, exempt_volume_offset: val });
                  }}
                >
                  <option value="global">Use Global Setting (Default: {aiSettings.exempt_volume_offset ? 'Enabled' : 'Disabled'})</option>
                  <option value="true">Enabled (Volume &gt;= 100% Exempts)</option>
                  <option value="false">Disabled (Volume does not offset consistency gaps)</option>
                </select>
              </div>
            </div>

            <div style={{ padding: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: '1rem' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={async () => {
                await toggleSquad(
                  editingBrainSquad.id, 
                  undefined, 
                  undefined, 
                  undefined, 
                  undefined, 
                  undefined, 
                  undefined, 
                  undefined, 
                  undefined, 
                  undefined, 
                  undefined, 
                  undefined, 
                  undefined, 
                  undefined,
                  editingBrainSquad.struggling_consistency_threshold,
                  editingBrainSquad.struggling_volume_threshold,
                  editingBrainSquad.min_wa_points_threshold,
                  editingBrainSquad.exempt_volume_offset
                );
                setSquads(squads.map(s => s.id === editingBrainSquad.id ? editingBrainSquad : s));
                setEditingBrainSquad(null);
                toast.success(`Pathway settings for ${editingBrainSquad.name} saved successfully!`);
              }}>Save & Apply</button>
              <button className="btn btn-secondary" onClick={() => setEditingBrainSquad(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* RESET PASSWORD MODAL */}
      {resetPasswordCoach && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem',
          backgroundColor: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)'
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '400px', padding: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Set New Password</h2>
            <p style={{ fontSize: '0.85rem', opacity: 0.6, marginBottom: '1.5rem' }}>
              Setting password for <strong>{resetPasswordCoach.email}</strong>
            </p>
            {resetPasswordStatus && (
              <div className={`alert ${resetPasswordStatus.type === 'error' ? 'alert-error' : 'alert-success'} mb-4`}>
                {resetPasswordStatus.text}
              </div>
            )}
            <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input 
                type="password" 
                required 
                className="input-field m-0" 
                value={newPassword} 
                onChange={(e) => setNewPassword(e.target.value)} 
                placeholder="Enter new password" 
                minLength={6}
              />
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => {
                  setResetPasswordCoach(null);
                  setNewPassword('');
                  setResetPasswordStatus(null);
                }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Update Password</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .settings-container { display: flex; gap: 2rem; min-height: 80vh; margin-top: -1rem; }
        .settings-sidebar { width: 260px; background: rgba(255,255,255,0.02); border-radius: 20px; border: 1px solid var(--surface-border); padding: 1rem 0; max-height: calc(100vh - 4rem); overflow-y: auto; position: sticky; top: 2rem; }
        .sidebar-item { padding: 0.85rem 1.5rem; display: flex; align-items: center; gap: 1rem; cursor: pointer; transition: all 0.2s; color: var(--text-secondary); font-weight: 500; font-size: 0.95rem; }
        .sidebar-item:hover { color: white; background: rgba(255,255,255,0.03); }
        .sidebar-item.active { color: white; background: rgba(59, 130, 246, 0.1); border-right: 3px solid var(--accent-primary); }
        .icon { font-size: 1.1rem; width: 24px; text-align: center; }
        .settings-panel { flex: 1; min-width: 0; }
        .panel-content h1 { font-size: 2rem; margin-bottom: 2rem; }
        .loading-spinner { width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.1); border-top-color: var(--accent-primary); border-radius: 50%; animation: spin 1s linear infinite; margin: 100px auto; }
        @keyframes spin { to { transform: rotate(360deg); } }
        
        .theme-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; }
        .theme-card {
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          border-radius: 20px;
          padding: 1.5rem;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 190px;
        }
        .theme-card:hover {
          transform: translateY(-4px);
          border-color: var(--accent-cyan);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4), 0 0 15px var(--glass-glow);
        }
        .theme-card.active {
          border: 2px solid var(--accent-cyan);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3), 0 0 20px var(--glass-glow);
          background: linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%);
        }
        .theme-card-badge {
          background: var(--accent-cyan);
          color: #000;
          font-size: 0.7rem;
          font-weight: 900;
          padding: 3px 8px;
          border-radius: 50px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .color-dot {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,0.1);
        }
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
