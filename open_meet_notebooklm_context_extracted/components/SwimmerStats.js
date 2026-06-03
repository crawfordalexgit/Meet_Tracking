import Link from 'next/link';

export default function SwimmerStats({ swimmers }) {
  return (
    <div className="card" style={{ marginTop: '2rem' }}>
      <h3 style={{ marginBottom: '1.5rem', fontWeight: 600 }}>Swimmer Statistics</h3>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Swimmer Name</th>
              <th>Squad</th>
              <th>Meets Attended</th>
              <th>Total Events</th>
            </tr>
          </thead>
          <tbody>
            {swimmers && swimmers.length > 0 ? (
              swimmers.map((swimmer) => (
                <tr key={swimmer.id}>
                  <td style={{ fontWeight: 500 }}>
                    <Link href={`/swimmer/${swimmer.id}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>
                      {swimmer.full_name}
                    </Link>
                  </td>
                  <td>{swimmer.squads?.name}</td>
                  <td>{swimmer.meetCount}</td>
                  <td>{swimmer.eventCount}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4" className="text-center" style={{ color: 'var(--text-secondary)' }}>No swimmers found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
