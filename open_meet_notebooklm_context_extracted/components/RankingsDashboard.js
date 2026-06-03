import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function RankingsDashboard({ rankings = [] }) {
  const latestSnapshot = useMemo(() => {
    if (!rankings.length) return null;
    return rankings[0].snapshot_date;
  }, [rankings]);

  const currentRankings = useMemo(() => {
    return rankings.filter(r => r.snapshot_date === latestSnapshot);
  }, [rankings, latestSnapshot]);

  const trendData = useMemo(() => {
    if (!rankings.length) return [];
    
    // Group by snapshot_date and find best rank at any level for that date
    const dateMap = {};
    rankings.forEach(r => {
      const date = new Date(r.snapshot_date).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
      if (!dateMap[date]) {
        dateMap[date] = { 
          date, 
          rawDate: r.snapshot_date,
          kent: null, 
          regional: null, 
          national: null 
        };
      }
      
      const rank = parseInt(r.rank);
      if (r.district === 'Kent') {
        if (dateMap[date].kent === null || rank < dateMap[date].kent) dateMap[date].kent = rank;
      } else if (r.district === 'South East') {
        if (dateMap[date].regional === null || rank < dateMap[date].regional) dateMap[date].regional = rank;
      } else if (r.district === 'England') {
        if (dateMap[date].national === null || rank < dateMap[date].national) dateMap[date].national = rank;
      }
    });

    return Object.values(dateMap).sort((a,b) => new Date(a.rawDate) - new Date(b.rawDate));
  }, [rankings]);

  if (!rankings.length) return null;

  return (
    <div className="glass-card mb-16" style={{ padding: '2.5rem' }}>
      <div className="flex justify-between items-start mb-10">
        <div>
          <div className="section-title" style={{ color: 'var(--accent-cyan)', fontSize: '0.7rem', fontWeight: 900 }}>Competitive Standing Audit</div>
          <h2 style={{ fontSize: '2.2rem', fontWeight: 900, margin: '8px 0 0', letterSpacing: '-0.03em' }}>District & National Rankings</h2>
          <p style={{ fontSize: '0.7rem', opacity: 0.4, fontStyle: 'italic', marginTop: 4 }}>Last Synced: {new Date(latestSnapshot).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="flex gap-4">
          {['England', 'South East', 'Kent'].map(dist => {
            const best = currentRankings
              .filter(r => r.district === dist && r.rank && !isNaN(parseInt(r.rank)))
              .sort((a,b) => (parseInt(a.rank) || 999) - (parseInt(b.rank) || 999))[0];
            if (!best) return null;
            return (
              <div key={dist} style={{ 
                padding: '12px 20px', 
                background: 'rgba(255,255,255,0.03)', 
                borderRadius: '16px', 
                border: '1px solid rgba(255,255,255,0.05)',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 900, opacity: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>{dist === 'England' ? 'National' : (dist === 'South East' ? 'Regional' : 'County')}</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: dist === 'England' ? 'var(--accent-amber)' : 'var(--accent-cyan)' }}>#{best.rank}</div>
                <div style={{ fontSize: '0.55rem', opacity: 0.4, fontWeight: 700, whiteSpace: 'nowrap' }}>{best.stroke}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2">
          <div style={{ fontSize: '0.7rem', fontWeight: 900, opacity: 0.4, textTransform: 'uppercase', marginBottom: '1.5rem', letterSpacing: '0.1em' }}>Historical Rank Momentum</div>
          <div style={{ height: 300, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis 
                  reversed 
                  tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} 
                  axisLine={false} 
                  tickLine={false} 
                  label={{ value: 'Rank', angle: -90, position: 'insideLeft', fill: 'rgba(255,255,255,0.2)', fontSize: 10, fontWeight: 900 }}
                />
                <Tooltip 
                  contentStyle={{ background: 'var(--bg-deep)', border: '1px solid var(--glass-border)', borderRadius: '12px' }}
                  itemStyle={{ fontSize: '0.8rem', fontWeight: 700 }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: 20, fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }} />
                <Line type="monotone" dataKey="kent" name="County" stroke="rgba(255,255,255,0.6)" strokeWidth={3} dot={{ r: 4, fill: '#fff' }} connectNulls />
                <Line type="monotone" dataKey="regional" name="Regional" stroke="var(--accent-cyan)" strokeWidth={3} dot={{ r: 4, fill: 'var(--accent-cyan)' }} connectNulls />
                <Line type="monotone" dataKey="national" name="National" stroke="var(--accent-amber)" strokeWidth={3} dot={{ r: 4, fill: 'var(--accent-amber)' }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.7rem', fontWeight: 900, opacity: 0.4, textTransform: 'uppercase', marginBottom: '1.5rem', letterSpacing: '0.1em' }}>Top Event Standing</div>
          <div className="space-y-4">
            {currentRankings
              .filter(r => r.rank && !isNaN(parseInt(r.rank)))
              .sort((a,b) => (parseInt(a.rank) || 999) - (parseInt(b.rank) || 999))
              .slice(0, 6).map((r, i) => (
              <div key={i} className="flex justify-between items-center p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 900 }}>{r.stroke}</div>
                  <div style={{ fontSize: '0.65rem', opacity: 0.4 }}>{r.district} • {r.pool === 'L' ? 'Long' : 'Short'} Course</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: r.rank <= 10 ? 'var(--accent-cyan)' : 'white' }}>#{r.rank}</div>
                  <div style={{ fontSize: '0.6rem', opacity: 0.4, fontWeight: 700 }}>{r.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
