import React from 'react';

export default function CoachesEyeGlossary() {
  return (
    <div className="print-only" style={{ pageBreakBefore: 'always', padding: '2rem' }}>
      <div style={{ borderLeft: '4px solid var(--accent-cyan)', paddingLeft: '1rem', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.8rem', fontWeight: 900, textTransform: 'uppercase', margin: 0 }}>Appendix: CoachesEye Educational Glossary</h2>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: '8px 0 0 0' }}>A guide to understanding your athlete's performance metrics.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div style={{ border: '1px solid #ccc', padding: '1.5rem', borderRadius: '12px' }}>
          <h4 style={{ fontSize: '1.1rem', fontWeight: 900, marginBottom: '8px', color: '#000' }}>World Aquatics (WA) Points</h4>
          <p style={{ fontSize: '0.85rem', lineHeight: 1.6, color: '#333' }}>WA Points (formerly FINA points) allow us to compare performances across different strokes and distances. A score of 1000 represents the current World Record. By tracking WA points instead of just times, we can see if a swimmer's 50m Freestyle is objectively better than their 200m Breaststroke.</p>
        </div>

        <div style={{ border: '1px solid #ccc', padding: '1.5rem', borderRadius: '12px' }}>
          <h4 style={{ fontSize: '1.1rem', fontWeight: 900, marginBottom: '8px', color: '#000' }}>Drop-Off Ratio (Endurance Decay)</h4>
          <p style={{ fontSize: '0.85rem', lineHeight: 1.6, color: '#333' }}>This compares an athlete's best 50m sprint to their 100m pace. An optimal ratio is around 2.10x. If the ratio is higher (e.g., 2.25x), it indicates an "Endurance Deficit"—meaning they have raw speed but lack the aerobic fitness to sustain it. If lower, they have a "Speed Deficit."</p>
        </div>

        <div style={{ border: '1px solid #ccc', padding: '1.5rem', borderRadius: '12px' }}>
          <h4 style={{ fontSize: '1.1rem', fontWeight: 900, marginBottom: '8px', color: '#000' }}>True In-Race Execution</h4>
          <p style={{ fontSize: '0.85rem', lineHeight: 1.6, color: '#333' }}>This tracks exactly how a swimmer splits their race. A "Heavy Positive Split" means they swam the first half much faster than the second, usually indicating they went out too fast and suffered from lactate fatigue. A "Negative Split" means they finished faster than they started.</p>
        </div>

        <div style={{ border: '1px solid #ccc', padding: '1.5rem', borderRadius: '12px' }}>
          <h4 style={{ fontSize: '1.1rem', fontWeight: 900, marginBottom: '8px', color: '#000' }}>Biological Maturation (Vorontsov)</h4>
          <p style={{ fontSize: '0.85rem', lineHeight: 1.6, color: '#333' }}>Chronological age (birthdays) doesn't equal biological age. Early developers hit growth spurts sooner, granting temporary physical advantages. Our system tracks these "Windows of Opportunity" to ensure training loads match the athlete's true biological development stage.</p>
        </div>

        <div style={{ border: '1px solid #ccc', padding: '1.5rem', borderRadius: '12px' }}>
          <h4 style={{ fontSize: '1.1rem', fontWeight: 900, marginBottom: '8px', color: '#000' }}>Squad Readiness Score (0–100)</h4>
          <p style={{ fontSize: '0.85rem', lineHeight: 1.6, color: '#333' }}>A composite index (0–100) combining training attendance, meet compliance, volume consistency, and performance trajectory. A score above 75 indicates an athlete is "squad-ready" for higher-level competition. Below 50 signals an aerobic base deficit and flags the swimmer for a coaching intervention. It is not a judgment — it is a diagnostic tool.</p>
        </div>
      </div>
    </div>
  );
}
