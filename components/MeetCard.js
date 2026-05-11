export default function MeetCard({ meet }) {
  // meet should contain: name, license, date, squadsCount (array or object)
  
  return (
    <div className="card">
      <h3 style={{ marginBottom: '0.5rem', fontWeight: 600 }}>{meet.name}</h3>
      <div style={{ display: 'flex', gap: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        <span>{meet.license}</span>
        {meet.date && <span>• {new Date(meet.date).toLocaleDateString()}</span>}
      </div>
      
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Squad</th>
              <th>Swimmers Attended</th>
            </tr>
          </thead>
          <tbody>
            {meet.squadsCount && meet.squadsCount.length > 0 ? (
              meet.squadsCount.map((sq, idx) => (
                <tr key={idx}>
                  <td>{sq.squad_name || 'Unassigned'}</td>
                  <td style={{ fontWeight: 600, color: 'var(--accent-color)' }}>{sq.count}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="2" className="text-center" style={{ color: 'var(--text-secondary)' }}>No attendance data visible</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
