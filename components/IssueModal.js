import React, { useState } from 'react';

export default function IssueModal({ isOpen, onClose, session }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('Bug');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState({ loading: false, success: false, error: null });

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ loading: true, success: false, error: null });

    try {
      const response = await fetch('/api/log-issue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          type,
          description,
          user_id: session?.user?.id || 'local-dev-user',
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to submit issue.');
      }

      setStatus({ loading: false, success: true, error: null });
      setTitle('');
      setDescription('');
      setType('Bug');

      // Auto-close after 2 seconds
      setTimeout(() => {
        onClose();
        setStatus({ loading: false, success: false, error: null });
      }, 2000);
    } catch (err) {
      console.error('Issue submission error:', err);
      setStatus({ loading: false, success: false, error: err.message });
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-card issue-modal animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: '#fff' }}>
              Report an Issue / Suggestion
            </h2>
            <div className="text-xs opacity-50 uppercase tracking-widest mt-1">
              Help us improve CoachesEye v2.1
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        {status.success ? (
          <div className="success-message">
            <span className="success-icon">✓</span>
            <h3>Issue Submitted Successfully</h3>
            <p>Thank you for your feedback! This window will close shortly.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="issue-form">
            <div className="form-group">
              <label htmlFor="issue-title">Issue Title</label>
              <input
                id="issue-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Brief summary of the issue..."
                required
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="issue-type">Type</label>
              <select
                id="issue-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="form-select"
              >
                <option value="Bug">Bug 🐛</option>
                <option value="Feature Request">Feature Request 🚀</option>
                <option value="Data Discrepancy">Data Discrepancy 📊</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="issue-desc">Description</label>
              <textarea
                id="issue-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the issue in detail, including steps to reproduce..."
                required
                className="form-textarea"
                rows={5}
              />
            </div>

            {status.error && (
              <div className="error-message">
                ⚠️ {status.error}
              </div>
            )}

            <button type="submit" disabled={status.loading} className="btn-submit">
              {status.loading ? 'Submitting...' : 'Submit Issue'}
            </button>
          </form>
        )}
      </div>

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(5, 11, 16, 0.85);
          backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1100;
          padding: 20px;
        }
        .issue-modal {
          width: 95%;
          max-width: 600px;
          padding: 2.5rem;
          border: 1px solid rgba(0, 150, 255, 0.2);
          box-shadow: 0 0 50px rgba(0, 150, 255, 0.1);
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 2rem;
        }
        .close-btn {
          background: transparent;
          border: none;
          color: var(--text-secondary);
          font-size: 2rem;
          line-height: 1;
          cursor: pointer;
          transition: color 0.2s;
        }
        .close-btn:hover {
          color: #fff;
        }
        .issue-form {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .form-group label {
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-secondary);
        }
        .form-input, .form-select, .form-textarea {
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 12px 16px;
          color: #fff;
          font-family: inherit;
          font-size: 0.9rem;
          transition: all 0.2s;
        }
        .form-input:focus, .form-select:focus, .form-textarea:focus {
          outline: none;
          border-color: var(--accent-cyan);
          box-shadow: 0 0 15px rgba(0, 150, 255, 0.15);
        }
        .form-select option {
          background: #050b10;
          color: #fff;
        }
        .btn-submit {
          background: linear-gradient(135deg, var(--accent-cyan) 0%, rgba(0, 150, 255, 0.8) 100%);
          color: #000;
          border: none;
          padding: 14px;
          border-radius: 12px;
          font-size: 0.8rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          cursor: pointer;
          transition: all 0.3s;
          margin-top: 1rem;
        }
        .btn-submit:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(0, 150, 255, 0.3);
        }
        .btn-submit:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .success-message {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 3rem 1rem;
          text-align: center;
          gap: 1rem;
        }
        .success-icon {
          font-size: 3rem;
          color: var(--accent-emerald);
          background: rgba(16, 185, 129, 0.1);
          width: 80px;
          height: 80px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 30px rgba(16, 185, 129, 0.2);
        }
        .success-message h3 {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 800;
        }
        .success-message p {
          color: var(--text-secondary);
          margin: 0;
          font-size: 0.9rem;
        }
        .error-message {
          color: var(--accent-rose);
          background: rgba(244, 63, 94, 0.1);
          border: 1px solid rgba(244, 63, 94, 0.2);
          border-radius: 12px;
          padding: 12px;
          font-size: 0.85rem;
        }
        .animate-scale-in {
          animation: scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        @keyframes scaleIn {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
