import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import Head from 'next/head';

export default function FeedbackBoard({ session }) {
  const [issues, setIssues] = useState([]);
  const [userVotes, setUserVotes] = useState([]);
  const [filterMode, setFilterMode] = useState('all'); // 'all', 'Bug', 'Feature Request', 'Data Discrepancy'
  const [sortBy, setSortBy] = useState('upvotes'); // 'upvotes', 'newest'
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Fetch issues and user upvotes
  const fetchFeedbackData = async () => {
    try {
      setLoading(true);
      // Fetch all issues via API route to bypass client-side RLS limitations during local dev/demo sessions
      const res = await fetch('/api/get-issues');
      if (!res.ok) throw new Error('Failed to fetch issues');
      const data = await res.json();
      const issuesData = data.issues || [];

      // Make sure each issue has an upvotes field (fallback to 0)
      const sanitizedIssues = issuesData.map(issue => ({
        ...issue,
        upvotes: issue.upvotes || 0
      }));

      setIssues(sanitizedIssues);

      // Fetch user's upvotes
      if (session?.user?.id && session.user.id !== 'local-dev-user') {
        const { data: votesData, error: votesError } = await supabase
          .from('issue_upvotes')
          .select('issue_id')
          .eq('user_id', session.user.id);

        if (votesError) throw votesError;

        if (votesData) {
          setUserVotes(votesData.map(v => v.issue_id));
        }
      } else {
        // Fallback for local development or demo sessions
        const localVotes = localStorage.getItem('coacheseye_local_votes');
        if (localVotes) {
          setUserVotes(JSON.parse(localVotes));
        }
      }
    } catch (err) {
      console.error('Error loading feedback board:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedbackData();
    
    // Check if current user is an admin or headcoach
    const checkAdminStatus = async () => {
      if (session?.user?.id) {
        if (session.user.id === 'local-dev-user') {
          setIsAdmin(true);
          return;
        }
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .single();
          if (data && ['admin', 'headcoach'].includes(data.role)) {
            setIsAdmin(true);
          }
        } catch (e) {
          console.error('Error checking admin status:', e);
        }
      }
    };
    checkAdminStatus();
  }, [session]);

  const handleDelete = async (issueId) => {
    if (!confirm('Are you sure you want to delete this roadmap item?')) return;

    // Optimistic Update
    const originalIssues = [...issues];
    setIssues(prevIssues => prevIssues.filter(issue => issue.id !== issueId));

    try {
      const res = await fetch('/api/delete-issue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          issueId,
          userId: session?.user?.id || 'local-dev-user',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete issue');
      }
    } catch (error) {
      console.error('Failed to delete issue:', error);
      alert(`Error: ${error.message}`);
      // Revert optimistic update
      setIssues(originalIssues);
    }
  };

  const handleUpvote = async (issueId) => {
    // Prevent double voting if already voted
    if (userVotes.includes(issueId)) return;

    // Optimistic Update
    const originalVotes = [...userVotes];
    const originalIssues = [...issues];

    setUserVotes(prev => {
      const updated = [...prev, issueId];
      if (!session?.user?.id || session.user.id === 'local-dev-user') {
        localStorage.setItem('coacheseye_local_votes', JSON.stringify(updated));
      }
      return updated;
    });

    setIssues(prevIssues => 
      prevIssues.map(issue => 
        issue.id === issueId ? { ...issue, upvotes: (issue.upvotes || 0) + 1 } : issue
      )
    );

    try {
      const res = await fetch('/api/upvote-issue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          issueId,
          userId: session?.user?.id || 'local-dev-user',
        }),
      });

      const data = await res.json();
      if (!res.ok || (!data.success && data.code !== 'ALREADY_VOTED')) {
        throw new Error(data.message || 'Upvote failed');
      }
    } catch (error) {
      console.error('Failed to submit upvote:', error);
      // Revert optimistic updates on failure
      setUserVotes(originalVotes);
      setIssues(originalIssues);
      if (!session?.user?.id || session.user.id === 'local-dev-user') {
        localStorage.setItem('coacheseye_local_votes', JSON.stringify(originalVotes));
      }
    }
  };

  // Filter issues
  const filteredIssues = issues.filter(issue => {
    if (filterMode === 'all') return true;
    return issue.type === filterMode;
  });

  // Sort issues
  const sortedIssues = [...filteredIssues].sort((a, b) => {
    if (sortBy === 'upvotes') {
      // Sort by upvotes desc, then created_at desc
      if (b.upvotes !== a.upvotes) {
        return b.upvotes - a.upvotes;
      }
      return new Date(b.created_at) - new Date(a.created_at);
    } else {
      // Sort by newest desc
      return new Date(b.created_at) - new Date(a.created_at);
    }
  });

  const getStatusClass = (type) => {
    switch (type) {
      case 'Bug':
        return 'critical';
      case 'Feature Request':
        return 'success'; // blue/cyan look
      default:
        return 'attention'; // orange/amber look
    }
  };

  const formatBadgeText = (type) => {
    if (type === 'Bug') return '🐛 BUG';
    if (type === 'Feature Request') return '🚀 FEATURE';
    return '📊 DATA DISCREPANCY';
  };

  return (
    <Layout session={session}>
      <Head>
        <title>Feedback & Roadmap | CoachesEye</title>
      </Head>

      <div className="container animate-fade-in">
        {/* Header Section */}
        <div style={{ marginBottom: '3rem' }}>
          <h1 className="text-5xl font-black text-white tracking-tighter" style={{ margin: 0 }}>
            Feedback & <span style={{ color: 'var(--accent-cyan)' }}>Roadmap</span>
          </h1>
          <p className="text-xl text-white/60 mt-2">
            Vote on the tools and fixes you want to see next, or suggest new features.
          </p>
        </div>

        {/* Controls Bar */}
        <div className="controls-bar glass-card mb-8">
          <div className="dropdowns-group">
            <div className="select-container">
              <label htmlFor="filter-select" className="select-label">Filter By Type</label>
              <select
                id="filter-select"
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value)}
                className="tactical-search-input"
              >
                <option value="all">All Items</option>
                <option value="Bug">Bugs 🐛</option>
                <option value="Feature Request">Features 🚀</option>
                <option value="Data Discrepancy">Data Discrepancies 📊</option>
              </select>
            </div>

            <div className="select-container">
              <label htmlFor="sort-select" className="select-label">Sort By</label>
              <select
                id="sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="tactical-search-input"
              >
                <option value="upvotes">Most Upvoted 🔥</option>
                <option value="newest">Newest Submissions ⏳</option>
              </select>
            </div>
          </div>
        </div>

        {/* Roadmap Grid */}
        {loading ? (
          <div className="p-12 text-center opacity-50 flex flex-col items-center gap-4">
            <div className="animate-spin h-8 w-8 border-t-2 border-cyan-400 rounded-full"></div>
            <div className="text-xs font-black tracking-widest uppercase">Retrieving Feedback Board...</div>
          </div>
        ) : sortedIssues.length === 0 ? (
          <div className="glass-card text-center p-12 opacity-60">
            <div className="text-4xl mb-4">📭</div>
            <h3 className="text-xl font-bold mb-2">No Submissions Found</h3>
            <p className="text-sm">Be the first to log a bug or feature request using the "Report Issue" button in the sidebar!</p>
          </div>
        ) : (
          <div className="squad-grid">
            {sortedIssues.map((issue) => {
              const isVoted = userVotes.includes(issue.id);
              return (
                <div key={issue.id} className="glass-card issue-card animate-fade-in">
                  <div className="issue-card-header">
                    <h3 className="issue-title">{issue.title}</h3>
                    <span className={`status-badge ${getStatusClass(issue.type)}`}>
                      {formatBadgeText(issue.type)}
                    </span>
                  </div>

                  <p className="issue-desc">{issue.description}</p>

                  <div className="issue-card-footer">
                    <span className="issue-date">
                      📅 {new Date(issue.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      {isAdmin && (
                        <button
                          onClick={() => handleDelete(issue.id)}
                          className="btn-delete"
                          title="Delete Issue"
                        >
                          🗑️ Delete
                        </button>
                      )}

                      <button
                        onClick={() => handleUpvote(issue.id)}
                        className={`btn-upvote ${isVoted ? 'voted' : 'unvoted'}`}
                        disabled={isVoted}
                      >
                        {isVoted ? (
                          <>▲ {issue.upvotes} Voted</>
                        ) : (
                          <>▲ {issue.upvotes} Upvote</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style jsx>{`
        .controls-bar {
          padding: 1.5rem;
          margin-bottom: 2.5rem;
        }
        .dropdowns-group {
          display: flex;
          gap: 1.5rem;
          flex-wrap: wrap;
        }
        .select-container {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .select-label {
          font-size: 0.65rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text-secondary);
        }
        .tactical-search-input {
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #fff;
          border-radius: 12px;
          padding: 10px 16px;
          font-size: 0.85rem;
          font-family: inherit;
          min-width: 200px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .tactical-search-input:focus {
          outline: none;
          border-color: var(--accent-cyan);
          box-shadow: 0 0 15px rgba(0, 150, 255, 0.15);
        }
        .tactical-search-input option {
          background: #050b10;
          color: #fff;
        }
        .issue-card {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          padding: 2rem;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(13, 17, 23, 0.4);
          transition: all 0.3s ease;
        }
        .issue-card:hover {
          border-color: rgba(0, 150, 255, 0.2);
          transform: translateY(-4px);
          box-shadow: 0 15px 30px rgba(0,0,0,0.4);
        }
        .issue-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }
        .issue-title {
          font-size: 1.25rem;
          font-weight: 800;
          color: #fff;
          margin: 0;
          line-height: 1.2;
        }
        .status-badge.success {
          background: rgba(0, 150, 255, 0.1);
          color: var(--accent-cyan);
          border: 1px solid rgba(0, 150, 255, 0.3);
        }
        .issue-desc {
          font-size: 0.9rem;
          line-height: 1.6;
          color: var(--text-secondary);
          margin: 0;
          flex-grow: 1;
        }
        .issue-card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: auto;
          padding-top: 1rem;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }
        .issue-date {
          font-size: 0.75rem;
          color: var(--text-dim);
        }
        .btn-upvote {
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 0.75rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          border: 1px solid transparent;
        }
        .btn-upvote.unvoted {
          background: transparent;
          border-color: rgba(0, 150, 255, 0.3);
          color: var(--accent-cyan);
        }
        .btn-upvote.unvoted:hover {
          background: rgba(0, 150, 255, 0.1);
          border-color: var(--accent-cyan);
          transform: translateY(-1px);
        }
        .btn-upvote.voted {
          background: var(--accent-cyan);
          color: #000;
          cursor: default;
        }
        .btn-delete {
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 0.75rem;
          font-weight: 800;
          cursor: pointer;
          background: transparent;
          border: 1px solid rgba(248, 113, 113, 0.3);
          color: #f87171;
          transition: all 0.25s ease;
        }
        .btn-delete:hover {
          background: rgba(248, 113, 113, 0.1);
          border-color: #f87171;
          transform: translateY(-1px);
        }
      `}</style>
    </Layout>
  );
}
