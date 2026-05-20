import React from 'react';

export default function ForesightTimeline({ insights, pbs = {} }) {
  const [expandedId, setExpandedId] = React.useState(null);
  
  if (!insights || insights.length === 0) return null;

  // Helper to check if a target time like "sub-1:20.00" is met
  const checkAchievement = (recommendation) => {
    const match = recommendation.match(/sub-?(\d+:?\d+\.\d+)/i);
    if (!match) return null;
    
    const targetTime = match[1];
    // Check if any current PB in the same stroke is faster
    // This is a simplified check for demonstration
    return false; 
  };

  return (
    <div className="glass-card animate-fade-in" style={{ padding: '2rem', maxHeight: '1000px', overflowY: 'auto' }}>
      <div className="flex justify-between items-center mb-8">
        <div className="section-title">CoachesEye Insights: Technical Foresight Timeline</div>
        <div style={{ fontSize: '0.6rem', color: 'var(--accent-cyan)', fontWeight: 900 }}>{insights.length} ARCHIVED REPORTS</div>
      </div>
      
      <div className="space-y-8" style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', left: '7px', top: '10px', bottom: '10px', width: '2px', background: 'rgba(255,255,255,0.05)' }}></div>
        
        {insights.map((insight, idx) => {
          const isLatest = idx === 0;
          const isExpanded = expandedId === insight.id || isLatest;
          
          return (
            <div key={insight.id} className="relative pl-8">
              <div style={{ 
                position: 'absolute', 
                left: 0, 
                top: '6px', 
                width: '16px', 
                height: '16px', 
                borderRadius: '50%', 
                background: isLatest ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.2)',
                border: '4px solid var(--bg-deep)',
                boxShadow: isLatest ? '0 0 15px var(--accent-cyan)' : 'none',
                zIndex: 2
              }}></div>
              
              <div 
                className="cursor-pointer" 
                onClick={() => setExpandedId(expandedId === insight.id ? null : insight.id)}
              >
                <div className="flex justify-between items-start mb-2">
                  <div style={{ fontSize: '0.65rem', fontWeight: 900, color: isLatest ? 'var(--accent-cyan)' : 'var(--text-dim)', letterSpacing: '0.1em' }}>
                    {new Date(insight.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                  {isLatest ? (
                    <div className="status-badge success" style={{ fontSize: '0.5rem' }}>ACTIVE FOCUS</div>
                  ) : (
                    <div style={{ fontSize: '0.5rem', opacity: 0.4, fontWeight: 900 }}>{isExpanded ? 'COLLAPSE' : 'CLICK TO VIEW'}</div>
                  )}
                </div>
                
                <h4 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.8rem', color: isLatest || isExpanded ? '#fff' : 'rgba(255,255,255,0.6)' }}>
                  {insight.headline}
                </h4>
              </div>
              
              {isExpanded && (
                <div className="animate-slide-down" style={{ 
                  background: isLatest ? 'rgba(0, 212, 255, 0.05)' : 'rgba(255,255,255,0.01)', 
                  padding: '1.25rem', 
                  borderRadius: '16px', 
                  border: isLatest ? '1px solid rgba(0, 212, 255, 0.15)' : '1px solid rgba(255,255,255,0.05)',
                  transition: 'all 0.3s'
                }}>
                   <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: '1rem', lineHeight: '1.5' }}>
                     "{insight.full_report.foresight}"
                   </div>
                   
                   <div style={{ fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', color: 'var(--accent-cyan)', marginBottom: '8px', opacity: 0.6 }}>Strategic Targets:</div>
                   <div className="space-y-2">
                      {insight.full_report.recommendations.slice(0, 5).map((rec, i) => (
                        <div key={i} style={{ 
                          fontSize: '0.7rem', 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '8px', 
                          color: 'var(--text-dim)' 
                        }}>
                          <div style={{ minWidth: '4px', height: '4px', borderRadius: '50%', background: 'var(--accent-cyan)' }}></div>
                          {rec}
                        </div>
                      ))}
                   </div>

                   {/* Trajectory Marker */}
                   <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '0.6rem', fontWeight: 900, color: 'rgba(255,255,255,0.3)' }}>TRAJECTORY:</div>
                      <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#10b981' }}>● ON TRACK</div>
                   </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
