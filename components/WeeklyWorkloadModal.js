import React, { useMemo } from 'react';
import { 
  getSessionDuration, 
  isShutdownDate, 
  isGalaDate, 
  toLocalISO 
} from '../lib/analytics-utils';

export default function WeeklyWorkloadModal({ isOpen, onClose, week, attendance, sessions, exemptions, swimmer, results }) {
  if (!isOpen || !week) return null;

  // Aligned Monday date from weekKey (Format: "W-YYYY-MM-DD")
  const monDate = useMemo(() => {
    const parts = week.weekKey.split('-');
    if (parts.length === 4) {
      const year = parseInt(parts[1], 10);
      const month = parseInt(parts[2], 10) - 1;
      const day = parseInt(parts[3], 10);
      return new Date(year, month, day);
    }
    return new Date();
  }, [week.weekKey]);

  // Generate day-by-day logs for the 7 days of the week (Mon-Sun)
  const dailyLogs = useMemo(() => {
    const logs = [];
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(monDate);
      currentDate.setDate(monDate.getDate() + i);
      const dateStr = toLocalISO(currentDate);
      const dayName = dayNames[i];
      const formattedDateStr = currentDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

      // Find attendance records on this date
      const dayAtts = attendance.filter(a => {
        try {
          return toLocalISO(a.date) === dateStr;
        } catch {
          return false;
        }
      });

      // Check exemptions or shutdowns
      const shutdown = isShutdownDate(dateStr, exemptions, swimmer.squad_id);
      
      // Check if racing at a Gala
      const isRacing = results ? isGalaDate(dateStr, swimmer.id, results) : false;

      // Map day entries
      const entries = [];

      if (dayAtts.length > 0) {
        dayAtts.forEach(att => {
          const sessObj = sessions.find(s => s.id === att.session_id);
          const duration = getSessionDuration(sessObj);
          const name = sessObj ? sessObj.name : 'Training Session';

          let statusLabel = att.status.toUpperCase();
          let color = '#a1a1aa'; // default gray
          let bg = 'rgba(255,255,255,0.03)';

          if (att.status === 'present') {
            statusLabel = 'PRESENT';
            color = '#10b981'; // green
            bg = 'rgba(16, 185, 129, 0.08)';
          } else if (att.status === 'absent') {
            if (isRacing) {
              statusLabel = 'GALA OVERRIDE';
              color = '#f43f5e'; // rose/pink
              bg = 'rgba(244, 63, 94, 0.08)';
            } else {
              statusLabel = 'ABSENT';
              color = '#f59e0b'; // amber
              bg = 'rgba(245, 158, 11, 0.08)';
            }
          }

          entries.push({
            type: 'attendance',
            name,
            duration,
            status: statusLabel,
            color,
            bg,
            rawStatus: att.status
          });
        });
      }

      // Check if there was racing but NO attendance record was registered
      if (isRacing && dayAtts.length === 0) {
        entries.push({
          type: 'gala',
          name: 'Open Meet Gala (Independent Racing)',
          duration: 2.0, // default racing credit
          status: 'GALA CREDIT',
          color: '#3b82f6', // blue
          bg: 'rgba(59, 130, 246, 0.08)'
        });
      }

      // Add shutdown/credit label if relevant
      if (shutdown) {
        entries.push({
          type: 'shutdown',
          name: shutdown.name,
          duration: 0,
          status: shutdown.type === 'exempt' ? 'EXEMPTION' : 'CREDIT APPLIED',
          color: '#0096ff', // Rich blue
          bg: 'rgba(0, 150, 255, 0.08)'
        });
      }

      logs.push({
        dayName,
        dateLabel: formattedDateStr,
        entries
      });
    }

    return logs;
  }, [monDate, attendance, sessions, exemptions, swimmer, results]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-card workload-modal animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-8">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-black tracking-widest text-cyan-400 uppercase">Weekly Workload Audit</span>
              <span style={{
                fontSize: '0.65rem',
                fontWeight: 900,
                padding: '3px 10px',
                borderRadius: '6px',
                background: week.isMet ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)',
                color: week.isMet ? '#10b981' : '#f43f5e',
                border: week.isMet ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(244,63,94,0.2)'
              }}>
                {week.isMet ? 'MET' : 'NOT MET'}
              </span>
            </div>
            <h2 className="text-2xl font-black mt-1 tracking-tight" style={{ color: '#fff' }}>
              Week of {week.week}
            </h2>
          </div>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        {/* Weekly Metrics Summary Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="summary-pill">
            <span className="pill-title">Training Sessions</span>
            <span className="pill-val">{week.trainingSessions} <span className="pill-unit">Sess</span></span>
            <span className="pill-sub">{week.trainingHours.toFixed(1)} hrs</span>
          </div>

          <div className="summary-pill">
            <span className="pill-title">Gala Racing</span>
            <span className="pill-val">{week.galaSessions} <span className="pill-unit">Sess</span></span>
            <span className="pill-sub">{week.galaHours.toFixed(1)} hrs</span>
          </div>

          <div className="summary-pill">
            <span className="pill-title">Credits Applied</span>
            <span className="pill-val">{week.creditedSessions || 0} <span className="pill-unit">Sess</span></span>
            <span className="pill-sub">{(week.creditedHours || 0).toFixed(1)} hrs</span>
          </div>

          <div className="summary-pill" style={{ borderColor: 'rgba(0, 150, 255, 0.2)' }}>
            <span className="pill-title" style={{ color: '#0096ff' }}>Weekly Compliance</span>
            <span className="pill-val" style={{ color: '#0096ff' }}>{week.compliance}%</span>
            <span className="pill-sub" style={{ color: '#0096ff' }}>
              Target: {week.totalHours.toFixed(1)} / {week.target.toFixed(1)} hrs
            </span>
          </div>
        </div>

        {/* Detailed Session Logs */}
        <div className="custom-scrollbar" style={{ maxHeight: '45vh', overflowY: 'auto', paddingRight: '4px' }}>
          <h3 className="text-xs font-black tracking-widest text-white/40 uppercase mb-4">Daily Activity Logs</h3>
          
          <div className="space-y-4">
            {dailyLogs.map((log, idx) => (
              <div key={idx} className="day-card">
                <div className="day-header flex justify-between items-center">
                  <div className="font-bold text-xs text-white/90">{log.dayName}</div>
                  <div className="text-[10px] opacity-40 font-bold">{log.dateLabel}</div>
                </div>

                <div className="day-body">
                  {log.entries.length === 0 ? (
                    <div className="no-activity">No scheduled or attended sessions on this day</div>
                  ) : (
                    <div className="space-y-2">
                      {log.entries.map((entry, eIdx) => (
                        <div 
                          key={eIdx} 
                          className="session-row" 
                          style={{ background: entry.bg }}
                        >
                          <div className="flex-1">
                            <div className="font-bold text-xs text-white">{entry.name}</div>
                            {entry.duration > 0 && (
                              <div className="text-[10px] opacity-50 font-semibold mt-0.5">
                                Session length: {entry.duration.toFixed(1)} hrs
                              </div>
                            )}
                          </div>
                          <span 
                            className="status-badge" 
                            style={{ color: entry.color, borderColor: `${entry.color}1e` }}
                          >
                            {entry.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Info Box */}
        {week.exceptionDetails && week.exceptionDetails.length > 0 && (
          <div className="mt-6 p-4 rounded-xl bg-white/5 border border-white/10">
            <h4 className="text-[10px] font-black tracking-widest text-cyan-400 uppercase mb-2">Exemption Context</h4>
            {week.exceptionDetails.map((ex, i) => (
              <div key={i} className="text-xs opacity-60 leading-relaxed mb-1 last:mb-0">
                • <b>{ex.name}</b>
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.85);
          backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }
        .workload-modal {
          width: 95%;
          max-width: 800px;
          padding: 2.5rem;
          border: 1px solid rgba(0, 150, 255, 0.2);
          box-shadow: 0 0 50px rgba(0, 150, 255, 0.1);
          max-height: 90vh;
          overflow-y: auto;
        }
        .close-btn {
          background: none;
          border: none;
          color: white;
          font-size: 2rem;
          cursor: pointer;
          opacity: 0.5;
          transition: opacity 0.2s;
          line-height: 1;
        }
        .close-btn:hover { opacity: 1; }

        .summary-pill {
          display: flex;
          flex-direction: column;
          padding: 1rem;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 14px;
        }
        .pill-title {
          font-size: 0.6rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: rgba(255, 255, 255, 0.4);
        }
        .pill-val {
          font-size: 1.5rem;
          font-weight: 900;
          margin-top: 4px;
          color: #fff;
        }
        .pill-unit {
          font-size: 0.75rem;
          font-weight: 500;
          opacity: 0.5;
        }
        .pill-sub {
          font-size: 0.7rem;
          opacity: 0.5;
          margin-top: 2px;
          font-weight: 600;
        }

        .day-card {
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.03);
          background: rgba(255,255,255,0.01);
          overflow: hidden;
        }
        .day-header {
          padding: 0.75rem 1rem;
          background: rgba(255,255,255,0.02);
          border-bottom: 1px solid rgba(255,255,255,0.03);
        }
        .day-body {
          padding: 0.75rem 1rem;
        }
        .no-activity {
          font-size: 0.75rem;
          color: rgba(255,255,255,0.25);
          font-style: italic;
          padding: 4px 0;
        }
        .session-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.02);
        }
        .status-badge {
          font-size: 0.55rem;
          font-weight: 900;
          padding: 2px 8px;
          border-radius: 4px;
          border: 1px solid currentColor;
          background: currentColor;
          background-clip: padding-box;
          filter: brightness(1.2);
        }

        @keyframes scaleIn {
          from { transform: scale(0.98); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-scale-in {
          animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>
  );
}
