import { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { authedFetch } from '../lib/api-client';

/**
 * Ask about the model, or change it by asking.
 *
 * A change never applies itself. The server works out what it does by actually
 * running the solver on it, and hands back both the resulting inputs and the
 * before-and-after figures; this shows them and waits. That keeps the club's
 * plan something a person decided, and it means the figures quoted in the
 * answer are the same ones that appear on every other tab.
 */

const OPENERS = [
  'What is this model actually doing for us?',
  'Which squads are short of water, and why?',
  'What if we gave Gold Development a fifth session?',
  'Which sessions are barely used at the moment?',
  'Where is pool time going unused?',
  'What would two more lanes on a Thursday evening buy us?'
];

export default function ModelAssistant({ inputs, scenarioName, onApply }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, busy, proposal]);

  const ask = async (text) => {
    const question = String(text || '').trim();
    if (!question || busy || !inputs) return;

    const history = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }))
      .concat([{ role: 'user', content: question }]);

    setMessages(m => m.concat([{ role: 'user', content: question }]));
    setDraft('');
    setProposal(null);
    setBusy(true);

    try {
      const res = await authedFetch('/api/restructure/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history, inputs, scenarioName })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'The assistant could not answer');
      if (!json.reply) throw new Error(json.error || 'The assistant returned nothing');

      setMessages(m => m.concat([{ role: 'assistant', content: json.reply }]));
      if (json.proposal) setProposal(json.proposal);
    } catch (err) {
      console.error(err);
      setMessages(m => m.concat([{
        role: 'error',
        content: err.message || 'The assistant is unavailable.'
      }]));
    } finally {
      setBusy(false);
    }
  };

  const applyProposal = () => {
    onApply(proposal.inputs);
    setMessages(m => m.concat([{
      role: 'note',
      content: `Applied: ${proposal.applied.join(' ')}`
    }]));
    setProposal(null);
  };

  return (
    <div className="glass-card as">
      <div className="as-head">
        <div>
          <h3 className="as-title">Ask about this model</h3>
          <p className="as-sub">
            Every figure comes from the solver. Ask for a change and it is run
            before it is offered — you decide whether to take it.
          </p>
        </div>
        {messages.length > 0 && (
          <button type="button" className="as-clear"
            onClick={() => { setMessages([]); setProposal(null); }}>Start again</button>
        )}
      </div>

      <div className="as-log custom-scrollbar">
        {!messages.length && (
          <div className="as-openers">
            {OPENERS.map(o => (
              <button key={o} type="button" className="as-opener" onClick={() => ask(o)}>{o}</button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`as-msg as-${m.role}`}>
            {m.role === 'user' ? m.content
              : m.content.split('\n').filter(Boolean).map((line, j) => <p key={j}>{line}</p>)}
          </div>
        ))}

        {busy && <div className="as-msg as-assistant as-busy">Working through the model…</div>}

        {proposal && (
          <div className="as-proposal">
            <div className="as-prop-head">A change is ready</div>
            <ul className="as-prop-list">
              {proposal.applied.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
            {proposal.rejected?.length > 0 && (
              <ul className="as-prop-list as-prop-bad">
                {proposal.rejected.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}

            <table className="as-delta">
              <thead>
                <tr><th>&nbsp;</th><th>Now</th><th>With the change</th></tr>
              </thead>
              <tbody>
                {[
                  ['Squads getting their full week', 'squadsGettingFullWeek'],
                  ['Swimmers covered', 'swimmersCovered'],
                  ['Lane-hours used', 'laneHoursUsed'],
                  ['Pool utilisation', 'poolUtilisationPct', '%'],
                  ['Overall score', 'overallScore']
                ].filter(([, k]) => proposal.before[k] !== proposal.after[k])
                  .map(([label, k, unit]) => (
                    <tr key={k}>
                      <td>{label}</td>
                      <td>{proposal.before[k]}{unit || ''}</td>
                      <td className="as-after">{proposal.after[k]}{unit || ''}</td>
                    </tr>
                  ))}
              </tbody>
            </table>

            <div className="as-prop-actions">
              <button type="button" className="btn-premium-action" onClick={applyProposal}>
                Apply it
              </button>
              <button type="button" className="as-clear" onClick={() => {
                setProposal(null);
                toast('Left the model as it was.', { icon: '↩️' });
              }}>Leave it</button>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form className="as-form" onSubmit={e => { e.preventDefault(); ask(draft); }}>
        <input
          type="text" value={draft} disabled={busy || !inputs}
          onChange={e => setDraft(e.target.value)}
          placeholder="Ask a question, or ask for a change…"
        />
        <button type="submit" className="btn-premium-intel" disabled={busy || !draft.trim()}>
          Ask
        </button>
      </form>

      <style jsx>{`
        .as { padding: 1.3rem 1.5rem; display: flex; flex-direction: column; }
        .as-head {
          display: flex; justify-content: space-between; align-items: flex-start;
          gap: 1rem; margin-bottom: 1rem;
        }
        .as-title { font-size: 1rem; font-weight: 900; margin: 0 0 0.25rem; }
        .as-sub {
          font-size: 0.72rem; color: var(--text-secondary); margin: 0;
          line-height: 1.5; max-width: 62ch;
        }
        .as-clear {
          background: transparent; border: 1px solid var(--glass-border); border-radius: 8px;
          color: var(--text-secondary); cursor: pointer; padding: 6px 13px;
          font-size: 0.7rem; font-weight: 800; white-space: nowrap;
        }
        .as-log {
          display: flex; flex-direction: column; gap: 0.7rem;
          max-height: 460px; overflow-y: auto; padding-right: 4px;
        }
        .as-openers { display: flex; flex-wrap: wrap; gap: 6px; }
        .as-opener {
          padding: 6px 12px; border-radius: 999px; cursor: pointer;
          font-size: 0.7rem; font-weight: 700; text-align: left;
          border: 1px solid var(--glass-border); background: transparent;
          color: var(--text-secondary);
        }
        .as-opener:hover { border-color: var(--accent-cyan); color: var(--accent-cyan); }
        .as-msg {
          font-size: 0.8rem; line-height: 1.65; border-radius: 10px;
          padding: 0.6rem 0.9rem; max-width: 88%;
        }
        .as-msg :global(p) { margin: 0 0 0.55rem; }
        .as-msg :global(p:last-child) { margin-bottom: 0; }
        .as-user {
          align-self: flex-end; background: var(--accent-cyan); color: #000; font-weight: 700;
        }
        .as-assistant {
          align-self: flex-start; background: var(--glass-bg);
          border: 1px solid var(--glass-border);
        }
        .as-busy { color: var(--text-secondary); font-style: italic; }
        .as-error {
          align-self: flex-start; color: var(--accent-rose);
          border: 1px solid var(--accent-rose); font-weight: 700;
        }
        .as-note {
          align-self: center; color: var(--accent-emerald); font-size: 0.7rem;
          font-weight: 800; text-align: center; max-width: 100%;
        }
        .as-proposal {
          border: 1px solid var(--accent-cyan); border-radius: 11px;
          padding: 0.9rem 1.1rem; background: rgba(var(--accent-cyan-rgb), 0.06);
        }
        .as-prop-head {
          font-size: 0.58rem; font-weight: 900; letter-spacing: 0.12em;
          color: var(--accent-cyan); margin-bottom: 0.5rem;
        }
        .as-prop-list {
          margin: 0 0 0.7rem; padding-left: 1.1rem;
          font-size: 0.78rem; line-height: 1.6; font-weight: 700;
        }
        .as-prop-bad { color: var(--accent-rose); font-weight: 600; }
        .as-delta { width: 100%; border-collapse: collapse; font-size: 0.74rem; }
        .as-delta th {
          text-align: left; font-size: 0.55rem; font-weight: 900; letter-spacing: 0.1em;
          color: var(--text-secondary); padding-bottom: 4px;
        }
        .as-delta td { padding: 3px 0; }
        .as-delta td:not(:first-child) { text-align: right; width: 26%; }
        .as-after { font-weight: 900; color: var(--accent-cyan); }
        .as-prop-actions { display: flex; gap: 0.6rem; margin-top: 0.9rem; }
        .as-form { display: flex; gap: 0.6rem; margin-top: 1.1rem; }
        .as-form input {
          flex: 1; padding: 9px 13px; border-radius: 9px;
          border: 1px solid var(--glass-border); background: var(--glass-bg);
          color: inherit; font-size: 0.82rem; font-weight: 600;
        }
        .as-form input:focus { outline: none; border-color: var(--accent-cyan); }
      `}</style>
    </div>
  );
}
