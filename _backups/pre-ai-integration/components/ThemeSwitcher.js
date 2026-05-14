import { useTheme } from '../lib/ThemeContext';

export default function ThemeSwitcher() {
  const { theme, toggleTheme, themes } = useTheme();

  const options = [
    { id: themes.MIDNIGHT, color: '#00d4ff', label: 'Midnight' },
    { id: themes.SOLAR, color: '#fbbf24', label: 'Solar' },
    { id: themes.NORDIC, color: '#38bdf8', label: 'Nordic' },
    { id: themes.EMERALD, color: '#10b981', label: 'Emerald' }
  ];

  return (
    <div className="theme-switcher">
      {options.map((opt) => (
        <button
          key={opt.id}
          className={`theme-btn ${theme === opt.id ? 'active' : ''}`}
          onClick={() => toggleTheme(opt.id)}
          title={opt.label}
        >
          <span className="color-dot" style={{ backgroundColor: opt.color }}></span>
        </button>
      ))}

      <style jsx>{`
        .theme-switcher {
          display: flex;
          gap: 10px;
          background: rgba(0, 0, 0, 0.2);
          padding: 6px;
          border-radius: 100px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .theme-btn {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: 2px solid transparent;
          background: transparent;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s cubic-bezier(0.2, 0, 0.2, 1);
          padding: 0;
        }
        .theme-btn:hover {
          transform: scale(1.15);
          background: rgba(255, 255, 255, 0.05);
        }
        .theme-btn.active {
          border-color: rgba(255, 255, 255, 0.4);
          box-shadow: 0 0 15px rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.1);
        }
        .color-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          transition: all 0.3s;
        }
        .theme-btn.active .color-dot {
          width: 14px;
          height: 14px;
          box-shadow: 0 0 10px currentColor;
        }
      `}</style>
    </div>
  );
}
