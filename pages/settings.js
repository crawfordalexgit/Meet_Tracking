import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { useRouter } from 'next/router';

export default function Settings({ session }) {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [scmKey, setScmKey] = useState('');
  const [syncStatus, setSyncStatus] = useState(null);
  
  const [swimmingYear, setSwimmingYear] = useState('2025/2026');
  const [scrapeStatus, setScrapeStatus] = useState(null);
  const [scrapeProgress, setScrapeProgress] = useState(0);
  const [isScraping, setIsScraping] = useState(false);

  const [coaches, setCoaches] = useState([]);
  const [squads, setSquads] = useState([]);
  const [coachSquads, setCoachSquads] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteStatus, setInviteStatus] = useState(null);

  useEffect(() => {
    if (session) {
      checkAdmin();
    }
  }, [session]);

  const checkAdmin = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (['admin', 'headcoach'].includes(data?.role)) {
      setIsAuthorized(true);
      setIsAdmin(data?.role === 'admin');
      loadData();
    } else {
      router.push('/');
    }
    setLoading(false);
  };

  const loadData = async () => {
    const { data: profiles } = await supabase.from('profiles').select('*').order('email');
    if (profiles) setCoaches(profiles);

    const { data: squadsData } = await supabase.from('squads').select('*').order('name');
    if (squadsData) setSquads(squadsData);

    const { data: csData } = await supabase.from('coach_squads').select('*');
    if (csData) setCoachSquads(csData);
  };

  const handleSyncScm = async (e) => {
    e.preventDefault();
    setSyncStatus({ type: 'info', text: 'Syncing... Please wait.' });
    try {
      const res = await fetch('/api/sync-scm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scmApiKey: scmKey })
      });
      const data = await res.json();
      if (res.ok) setSyncStatus({ type: 'success', text: data.message });
      else setSyncStatus({ type: 'error', text: data.error });
    } catch (err) {
      setSyncStatus({ type: 'error', text: 'An unexpected error occurred.' });
    }
  };

  const handleScrape = async (e) => {
    e.preventDefault();
    setIsScraping(true);
    setScrapeProgress(0);
    setScrapeStatus({ type: 'info', text: 'Starting scrape...' });
    
    try {
      const response = await fetch('/api/scrape-meets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ swimmingYear })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Keep the last partial line in the buffer
        buffer = lines.pop();
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmedLine.substring(6));
              setScrapeStatus({ type: data.error ? 'error' : 'info', text: data.message });
              setScrapeProgress(data.progress);
              
              if (data.isDone) {
                setIsScraping(false);
                if (!data.error) setScrapeStatus({ type: 'success', text: data.message });
              }
            } catch (e) {
              console.error('Error parsing SSE chunk:', e, trimmedLine);
            }
          }
        }
      }
    } catch (err) {
      console.error('Scrape Error:', err);
      setScrapeStatus({ type: 'error', text: 'Failed to connect to scraper.' });
      setIsScraping(false);
    }
  };

  const handleInviteCoach = async (e) => {
    e.preventDefault();
    setInviteStatus({ type: 'info', text: 'Inviting...' });
    try {
      const res = await fetch('/api/invite-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail })
      });
      const data = await res.json();
      if (res.ok) {
        setInviteStatus({ type: 'success', text: data.message });
        setInviteEmail('');
      } else {
        setInviteStatus({ type: 'error', text: data.error });
      }
    } catch (err) {
      setInviteStatus({ type: 'error', text: 'Error inviting coach.' });
    }
  };

  const toggleSquad = async (squadId, isSquad, targetMeets) => {
    setSquads(squads.map(s => s.id === squadId ? { 
      ...s, 
      is_squad: typeof isSquad === 'boolean' ? isSquad : s.is_squad,
      target_meets: typeof targetMeets === 'number' ? targetMeets : s.target_meets
    } : s));
    
    await fetch('/api/update-squad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        squadId, 
        isSquad: typeof isSquad === 'boolean' ? isSquad : undefined,
        targetMeets: typeof targetMeets === 'number' ? targetMeets : undefined
      })
    });
  };

  const toggleCoachSquad = async (coachId, squadId, assign) => {
    if (assign) {
      setCoachSquads([...coachSquads, { coach_id: coachId, squad_id: squadId }]);
    } else {
      setCoachSquads(coachSquads.filter(cs => !(cs.coach_id === coachId && cs.squad_id === squadId)));
    }
    
    await fetch('/api/assign-coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coachId, squadId, assign })
    });
  };

  if (loading) return <Layout session={session}><p>Loading...</p></Layout>;
  if (!isAuthorized) return null; // router will redirect

  return (
    <Layout session={session}>
      <h1 className="mb-8">Admin Settings</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* SCM Sync Card */}
        <div className="card">
          <h2 style={{ fontSize: '1.4rem' }}>Sync SwimClubManager</h2>
          <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>Import latest members and squads from SCM.</p>
          
          {syncStatus && (
            <div className={`alert ${syncStatus.type === 'error' ? 'alert-error' : syncStatus.type === 'success' ? 'alert-success' : 'alert-info'}`}>
              {syncStatus.text}
            </div>
          )}

          <form onSubmit={handleSyncScm}>
            <div className="form-group">
              <label className="form-label">SCM API Key</label>
              <input
                type="password"
                className="input-field"
                value={scmKey}
                onChange={(e) => setScmKey(e.target.value)}
                placeholder="Enter SCM API Key"
                required
              />
            </div>
            <button type="submit" className="btn btn-primary">Start Sync</button>
          </form>
        </div>

        {/* Scrape Meets Card */}
        <div className="card">
          <h2 style={{ fontSize: '1.4rem' }}>Scrape Meet Results</h2>
          <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>Fetch the latest meet results for TONS.</p>
          
          {scrapeStatus && (
            <div className={`alert ${scrapeStatus.type === 'error' ? 'alert-error' : scrapeStatus.type === 'success' ? 'alert-success' : 'alert-info'}`}>
              {scrapeStatus.text}
            </div>
          )}

          <form onSubmit={handleScrape}>
            <div className="form-group">
              <label className="form-label">Swimming Year</label>
              <input
                type="text"
                className="input-field"
                value={swimmingYear}
                onChange={(e) => setSwimmingYear(e.target.value)}
                placeholder="e.g. 2025/2026"
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={isScraping}>
              {isScraping ? 'Scraping...' : 'Start Scrape'}
            </button>
          </form>

          {isScraping || scrapeProgress > 0 ? (
            <div className="mt-4">
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ 
                  width: `${scrapeProgress}%`, 
                  height: '100%', 
                  background: 'var(--accent-primary)',
                  transition: 'width 0.3s ease'
                }}></div>
              </div>
            </div>
          ) : null}
        </div>
        
        {/* Coach Management Card */}
        <div className="card">
          <h2 style={{ fontSize: '1.4rem' }}>Coach Management</h2>
          <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>Invite new coaches via email magic link.</p>
          
          {inviteStatus && (
            <div className={`alert ${inviteStatus.type === 'error' ? 'alert-error' : 'alert-success'}`}>
              {inviteStatus.text}
            </div>
          )}

          <form onSubmit={handleInviteCoach} className="mb-6 flex gap-2">
            <input
              type="email"
              className="input-field m-0"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="coach@example.com"
              required
            />
            <button type="submit" className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>Invite</button>
          </form>
          
          <div className="table-container" style={{ maxHeight: '250px', overflowY: 'auto' }}>
            <table className="stats-table">
              <thead>
                <tr><th>Email</th><th>Role</th></tr>
              </thead>
              <tbody>
                {coaches.map(c => (
                  <tr key={c.id}>
                    <td>{c.email}</td>
                    <td><span className={`badge ${c.role === 'admin' ? 'badge-primary' : 'badge-secondary'}`}>{c.role}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Squad Management Card */}
        <div className="card md:col-span-2">
          <h2 style={{ fontSize: '1.4rem' }}>Squad Management</h2>
          <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>Mark valid competitive squads and assign Lead Coaches.</p>
          
          <div className="table-container" style={{ maxHeight: '500px', overflowY: 'auto' }}>
            <table className="stats-table">
              <thead>
                <tr>
                  <th style={{ width: '100px', textAlign: 'center' }}>Is Squad?</th>
                  <th style={{ width: '250px' }}>Group Name</th>
                  <th style={{ width: '120px' }}>Target Meets</th>
                  <th>Assigned Coaches</th>
                </tr>
              </thead>
              <tbody>
                {squads.map(s => {
                  const assignedCoachIds = coachSquads.filter(cs => cs.squad_id === s.id).map(cs => cs.coach_id);
                  return (
                  <tr key={s.id} style={{ opacity: s.is_squad ? 1 : 0.6 }}>
                    <td style={{ textAlign: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={s.is_squad || false} 
                        onChange={(e) => toggleSquad(s.id, e.target.checked)}
                        style={{ transform: 'scale(1.5)', cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ fontWeight: s.is_squad ? '600' : 'normal' }}>{s.name}</td>
                    <td>
                      <input 
                        type="number"
                        className="input-field m-0"
                        style={{ width: '80px', padding: '0.3rem' }}
                        value={s.target_meets || 0}
                        onChange={(e) => toggleSquad(s.id, undefined, parseInt(e.target.value) || 0)}
                        disabled={!s.is_squad}
                      />
                    </td>
                    <td>
                      {s.is_squad ? (
                        <div className="flex flex-wrap gap-4">
                          {coaches.map(c => (
                            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                              <input 
                                type="checkbox"
                                checked={assignedCoachIds.includes(c.id)}
                                onChange={(e) => toggleCoachSquad(c.id, s.id, e.target.checked)}
                                style={{ transform: 'scale(1.2)' }}
                              />
                              {c.email.split('@')[0]}
                            </label>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontStyle: 'italic' }}>Not a competitive squad</span>
                      )}
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
