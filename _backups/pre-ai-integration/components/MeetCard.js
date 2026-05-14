import Link from 'next/link';

export default function MeetCard({ meet }) {
  // meet should contain: name, license, date, squadsCount (array or object)
  
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="flex justify-between items-start mb-2">
        <Link href={`/meet/${meet.id}`} style={{ textDecoration: 'none', color: 'inherit', flex: 1 }}>
          <h3 style={{ fontSize: '1.25rem', cursor: 'pointer', transition: 'color 0.2s' }} className="hover-accent">{meet.name}</h3>
        </Link>
        {meet.pbCount > 0 && (
          <div className="badge" style={{ 
            background: 'rgba(16, 185, 129, 0.1)', 
            color: 'var(--success-color)',
            borderColor: 'rgba(16, 185, 129, 0.2)',
            gap: '4px'
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            {meet.pbCount} PBs
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
        <span style={{ opacity: 0.8 }}>{meet.license}</span>
        {meet.date && <span style={{ opacity: 0.5 }}>•</span>}
        {meet.date && <span style={{ opacity: 0.8 }}>{new Date(meet.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
      </div>
      
      <div className="table-wrapper" style={{ marginTop: 'auto' }}>
        <table className="stats-table">
          <thead>
            <tr>
              <th style={{ fontSize: '0.7rem' }}>Squad</th>
              <th className="text-center" style={{ fontSize: '0.7rem' }}>Swimmers</th>
            </tr>
          </thead>
          <tbody>
            {meet.squadsCount && meet.squadsCount.length > 0 ? (
              meet.squadsCount.map((sq, idx) => (
                <tr key={idx}>
                  <td style={{ fontSize: '0.9rem' }}>{sq.squad_name || 'Unassigned'}</td>
                  <td className="text-center" style={{ fontWeight: 700, color: 'var(--accent-primary)', fontSize: '0.9rem' }}>{sq.count}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="2" className="text-center" style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.85rem' }}>No attendance logged</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .hover-accent:hover {
          color: var(--accent-primary);
        }
      `}</style>
    </div>
  );
}
