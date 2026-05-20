export default function PremiumOrb({ value = 0, label, size = 120, trend, icon, customValue, unit = '%', color = 'cyan' }) {
  const numValue = (typeof value !== 'number' || isNaN(value)) ? 0 : value;
  const displayValue = Math.max(0, numValue);
  const safeRingValue = Math.min(100, displayValue);
  const r = size * 0.42;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - (customValue ? (typeof value === 'number' && value > 0 ? 100 : 0) : safeRingValue) / 100);

  const isPercentage = unit === '%';
  
  const getTheme = (v) => {
    if (!isPercentage) {
      return {
        cyan: { color: '#00d4ff', gradient: 'url(#gradRadiantBlue)', glow: 'rgba(0, 212, 255, 0.6)' },
        amber: { color: '#ffea00', gradient: 'url(#gradRadiantYellow)', glow: 'rgba(255, 234, 0, 0.6)' },
        white: { color: '#ffffff', gradient: 'url(#gradRadiantWhite)', glow: 'rgba(255, 255, 255, 0.4)' }
      }[color === 'amber' ? 'amber' : color === 'white' ? 'white' : 'cyan'];
    }
    // Performance-based colors for percentages
    if (v < 50) return { color: '#f43f5e', gradient: 'url(#gradRed)', glow: 'rgba(244, 63, 94, 0.6)' };
    if (v < 75) return { color: '#ffea00', gradient: 'url(#gradRadiantYellow)', glow: 'rgba(255, 234, 0, 0.6)' };
    return { color: '#00d4ff', gradient: 'url(#gradRadiantBlue)', glow: 'rgba(0, 212, 255, 0.6)' };
  };

  const theme = getTheme(displayValue);
  const ringOffset = isPercentage ? offset : 0;

  return (
    <div className="premium-orb-container" style={{ width: size + 20, textAlign: 'center' }}>
      <div className="orb-wrapper" style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
          <defs>
            <linearGradient id="gradRadiantBlue" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00f2ff" />
              <stop offset="100%" stopColor="#00d4ff" />
            </linearGradient>
            <linearGradient id="gradRadiantYellow" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fff700" />
              <stop offset="100%" stopColor="#ffea00" />
            </linearGradient>
            <linearGradient id="gradRadiantWhite" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#e0e0e0" />
            </linearGradient>
            <linearGradient id="gradRed" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fb7185" />
              <stop offset="100%" stopColor="#f43f5e" />
            </linearGradient>
            
            <filter id="crispGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
          
          {/* 1. Base Track (Precision Thin) */}
          <circle 
            cx={cx} cy={cy} r={r} 
            fill="none" 
            stroke="rgba(255,255,255,0.06)" 
            strokeWidth={size * 0.08} 
          />
          
          {/* 2. Soft Ambient Glow (Diffuse) */}
          <circle 
            cx={cx} cy={cy} r={r} 
            fill="none" 
            stroke={theme.color} 
            strokeWidth={size * 0.12} 
            strokeDasharray={circ}
            strokeDashoffset={ringOffset}
            strokeLinecap="round"
            opacity="0.3"
            style={{ filter: 'blur(8px)', transition: 'stroke-dashoffset 1.5s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
          />

          {/* 3. CORE RADIANT RING (CRISP) */}
          <circle 
            cx={cx} cy={cy} r={r} 
            fill="none" 
            stroke={theme.gradient} 
            strokeWidth={size * 0.09} 
            strokeDasharray={circ}
            strokeDashoffset={ringOffset}
            strokeLinecap="round"
            style={{ 
              filter: `drop-shadow(0 0 6px ${theme.color})`,
              transition: 'stroke-dashoffset 1.5s cubic-bezier(0.34, 1.56, 0.64, 1)' 
            }}
          />

          {/* 4. SHARP HIGHLIGHT (INNER CORE) */}
          <circle 
            cx={cx} cy={cy} r={r} 
            fill="none" 
            stroke="rgba(255,255,255,0.4)" 
            strokeWidth={size * 0.02} 
            strokeDasharray={circ}
            strokeDashoffset={ringOffset}
            strokeLinecap="round"
            style={{ 
              transition: 'stroke-dashoffset 1.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
              opacity: 0.8
            }}
          />

          {/* 5. Inner Glass Shadow */}
          <circle 
            cx={cx} cy={cy} r={r - size * 0.06} 
            fill="rgba(0,0,0,0.2)"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="1"
          />
        </svg>

        <div style={{ 
          position: 'absolute', 
          inset: 0, 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          zIndex: 10
        }}>
          {icon && <div style={{ fontSize: `${size * 0.18}px`, marginBottom: 2, opacity: 0.8 }}>{icon}</div>}
          <div style={{ 
            fontSize: `${size * (customValue && customValue.length > 3 ? 0.22 : 0.28)}px`, 
            fontWeight: 950, 
            color: 'white', 
            lineHeight: 1, 
            letterSpacing: '-0.04em',
            fontFamily: 'Outfit, sans-serif',
            textShadow: '0 0 10px rgba(0,0,0,0.5)'
          }}>
            {customValue || `${Math.round(displayValue)}${unit}`}
          </div>
          {trend && (
            <div style={{ 
              fontSize: `${size * 0.08}px`, 
              color: trend > 0 ? 'var(--accent-cyan)' : 'var(--accent-rose)', 
              marginTop: 2, 
              fontWeight: 900,
              background: trend > 0 ? 'rgba(6, 182, 212, 0.1)' : 'rgba(244, 63, 94, 0.1)',
              padding: '1px 6px',
              borderRadius: '4px'
            }}>
              {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
            </div>
          )}
        </div>
      </div>

      {label && (
        <div className="orb-label" style={{ 
          fontSize: '0.6rem', 
          fontWeight: 950, 
          letterSpacing: '0.2em', 
          marginTop: 12, 
          opacity: 0.35, 
          textTransform: 'uppercase',
          lineHeight: 1.2,
          maxWidth: size + 20,
          margin: '12px auto 0'
        }}>
          {label}
        </div>
      )}

      <style jsx>{`
        .premium-orb-container {
          transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .premium-orb-container:hover {
          transform: translateY(-4px) scale(1.05);
        }
        @keyframes pulse {
          0% { filter: drop-shadow(0 0 5px ${theme.glow}); }
          50% { filter: drop-shadow(0 0 15px ${theme.glow}); }
          100% { filter: drop-shadow(0 0 5px ${theme.glow}); }
        }
        .pulse {
          animation: pulse 2s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
}
