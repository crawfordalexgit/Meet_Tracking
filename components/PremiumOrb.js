export default function PremiumOrb({ value = 0, label, size = 120, trend, icon, customValue, unit = '%' }) {
  const numValue = (typeof value !== 'number' || isNaN(value)) ? 0 : value;
  const displayValue = Math.max(0, numValue);
  const safeRingValue = Math.min(100, displayValue);
  const r = size * 0.4;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - (customValue ? (typeof value === 'number' && value > 0 ? 100 : 0) : safeRingValue) / 100);

  // Dynamic colors based on value
  const getTheme = (v) => {
    if (v < 40) return { color: '#ff4d4d', gradient: 'url(#gradRed)', glow: 'rgba(255, 77, 77, 0.5)', pulse: true };
    if (v < 70) return { color: '#ffaa00', gradient: 'url(#gradAmber)', glow: 'rgba(255, 170, 0, 0.4)', pulse: false };
    return { color: '#00f2fe', gradient: 'url(#gradTeal)', glow: 'rgba(0, 242, 254, 0.4)', pulse: false };
  };

  const theme = getTheme(customValue ? (typeof value === 'number' && value > 0 ? 100 : 20) : safeRingValue);

  return (
    <div className={`premium-orb-container ${theme.pulse ? 'pulse' : ''}`} style={{ width: size + 20, textAlign: 'center' }}>
      <div className="orb-wrapper" style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
          <defs>
            <linearGradient id="gradTeal" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00f2fe" />
              <stop offset="100%" stopColor="#00c6ff" />
            </linearGradient>
            <linearGradient id="gradAmber" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ffaa00" />
              <stop offset="100%" stopColor="#ff7700" />
            </linearGradient>
            <linearGradient id="gradRed" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ff4d4d" />
              <stop offset="100%" stopColor="#ff0055" />
            </linearGradient>
          </defs>
          
          <circle 
            cx={cx} cy={cy} r={r} 
            fill="none" 
            stroke="rgba(255,255,255,0.03)" 
            strokeWidth={size * 0.08} 
          />
          
          <circle 
            cx={cx} cy={cy} r={r} 
            fill="none" 
            stroke={theme.gradient} 
            strokeWidth={size * 0.08} 
            strokeDasharray={circ}
            strokeDashoffset={customValue ? (typeof value === 'number' && value > 0 ? 0 : circ) : offset}
            strokeLinecap="round"
            style={{ 
              filter: `drop-shadow(0 0 6px ${theme.glow})`,
              transition: 'stroke-dashoffset 2s cubic-bezier(0.4, 0, 0.2, 1)' 
            }}
          />
        </svg>

        <div style={{ 
          position: 'absolute', 
          inset: 0, 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center' 
        }}>
          {icon && <div style={{ fontSize: `${size * 0.15}px`, marginBottom: 2 }}>{icon}</div>}
          <div style={{ fontSize: `${size * (customValue && customValue.length > 3 ? 0.18 : 0.22)}px`, fontWeight: 900, color: 'white', lineHeight: 1 }}>
            {customValue || `${Math.round(displayValue)}${unit}`}
          </div>
          {trend && (
            <div style={{ fontSize: `${size * 0.07}px`, color: trend > 0 ? '#00f2fe' : '#ff4d4d', opacity: 0.8, marginTop: 2, fontWeight: 700 }}>
              {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
            </div>
          )}
        </div>
      </div>

      {label && (
        <div className="orb-label" style={{ 
          fontSize: '0.5rem', 
          fontWeight: 800, 
          letterSpacing: '0.1em', 
          marginTop: 10, 
          opacity: 0.6, 
          textTransform: 'uppercase',
          lineHeight: 1.2,
          maxWidth: size + 10,
          margin: '10px auto 0'
        }}>
          {label}
        </div>
      )}

      <style jsx>{`
        .premium-orb-container {
          transition: transform 0.3s ease, filter 0.3s ease;
        }
        .premium-orb-container:hover {
          transform: scale(1.05);
          filter: brightness(1.15);
        }
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.02); opacity: 0.85; }
          100% { transform: scale(1); opacity: 1; }
        }
        .pulse {
          animation: pulse 2s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
}
