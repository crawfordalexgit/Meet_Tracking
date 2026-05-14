import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';

export default function ChatBot({ clubDNA }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hello! I'm your CoachesEye Assistant. Ask me anything about the club's performance, squad health, or training trends." }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          clubDNA
        })
      });
      const data = await res.json();
      if (data.response) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      } else {
        throw new Error(data.error || "Failed to get response");
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: "I'm sorry, I encountered an error. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chatbot-container">
      {/* Floating Bubble */}
      <button 
        className={`chatbot-bubble ${isOpen ? 'open' : ''}`} 
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle Chat"
      >
        {isOpen ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12"/></svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="chatbot-window glass-card animate-slide-up">
          <div className="chatbot-header">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <h3 className="text-sm font-black uppercase tracking-widest m-0">CoachesEye Assistant</h3>
            </div>
            <div className="text-[9px] opacity-40 uppercase font-bold">Connected to Club DNA</div>
          </div>

          <div className="chatbot-messages">
            {messages.map((m, i) => (
              <div key={i} className={`chat-message ${m.role}`}>
                <div className="message-content">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              </div>
            ))}
            {loading && (
              <div className="chat-message assistant">
                <div className="message-content loading">
                  <div className="dot"></div>
                  <div className="dot"></div>
                  <div className="dot"></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="chatbot-input-area">
            <input 
              type="text" 
              placeholder="Ask a question..." 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button type="submit" disabled={loading || !input.trim()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
            </button>
          </form>
        </div>
      )}

      <style jsx>{`
        .chatbot-container {
          position: fixed;
          bottom: 2rem;
          right: 2rem;
          z-index: 1000;
        }
        .chatbot-bubble {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: var(--accent-cyan);
          color: black;
          border: none;
          box-shadow: 0 10px 30px rgba(6,182,212,0.4);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .chatbot-bubble:hover {
          transform: scale(1.1) translateY(-5px);
          box-shadow: 0 15px 40px rgba(6,182,212,0.6);
        }
        .chatbot-bubble.open {
          background: #333;
          color: white;
          box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        }
        .chatbot-window {
          position: absolute;
          bottom: 80px;
          right: 0;
          width: 380px;
          height: 550px;
          display: flex;
          flex-direction: column;
          padding: 0 !important;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.1);
          box-shadow: 0 20px 60px rgba(0,0,0,0.6);
        }
        .chatbot-header {
          padding: 1.5rem;
          background: rgba(255,255,255,0.03);
          border-bottom: 1px solid rgba(255,255,255,0.05);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .chatbot-messages {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .chat-message {
          max-width: 85%;
        }
        .chat-message.user {
          align-self: flex-end;
        }
        .message-content {
          padding: 0.8rem 1.2rem;
          border-radius: 1.2rem;
          font-size: 0.9rem;
          line-height: 1.5;
        }
        .user .message-content {
          background: var(--accent-cyan);
          color: black;
          border-bottom-right-radius: 0.2rem;
          font-weight: 600;
        }
        .assistant .message-content {
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.9);
          border-bottom-left-radius: 0.2rem;
          border: 1px solid rgba(255,255,255,0.05);
        }
        .chatbot-input-area {
          padding: 1.2rem;
          background: rgba(0,0,0,0.2);
          border-top: 1px solid rgba(255,255,255,0.05);
          display: flex;
          gap: 0.8rem;
        }
        .chatbot-input-area input {
          flex: 1;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 0.8rem;
          padding: 0.8rem 1.2rem;
          color: white;
          outline: none;
          font-size: 0.9rem;
        }
        .chatbot-input-area input:focus {
          border-color: var(--accent-cyan);
        }
        .chatbot-input-area button {
          background: var(--accent-cyan);
          color: black;
          border: none;
          width: 44px;
          height: 44px;
          border-radius: 0.8rem;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
        }
        .chatbot-input-area button:hover:not(:disabled) {
          transform: scale(1.05);
          background: white;
        }
        .chatbot-input-area button:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        .loading {
          display: flex;
          gap: 4px;
          padding: 12px 16px;
        }
        .dot {
          width: 6px;
          height: 6px;
          background: white;
          border-radius: 50%;
          animation: bounce 1.4s infinite ease-in-out both;
          opacity: 0.3;
        }
        .dot:nth-child(1) { animation-delay: -0.32s; }
        .dot:nth-child(2) { animation-delay: -0.16s; }
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1.0); }
        }
        @keyframes slide-up {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up {
          animation: slide-up 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
      `}</style>
    </div>
  );
}
