import React, { useEffect, useState } from 'react';

export default function Consumption({ selectedDate }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isToday = !selectedDate || selectedDate === new Date().toISOString().split('T')[0];
  const seedStr = selectedDate || "2025-01-01";
  const seedNum = seedStr.split('-').reduce((acc, val) => acc + parseInt(val, 10), 0);

  const solarTotal = isToday ? 28.25 : 15 + ((seedNum * 2) % 20) + (seedNum % 100) / 100;
  const gridTotal = isToday ? 28.22 : 15 + ((seedNum * 3) % 20) + (seedNum % 100) / 100;
  const overallTotal = solarTotal + gridTotal;
  
  const solarPercent = Math.round((solarTotal / overallTotal) * 100);
  const gridPercent = 100 - solarPercent;

  return (
    <div className="panel">
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
        <h3 style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
          Consumption
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
        </h3>
        <button style={{background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b'}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
        </button>
      </div>
      <div style={{marginTop: '16px'}}>
        <span style={{fontSize: '2rem', fontWeight: '600'}}>{overallTotal.toFixed(2)}</span>
        <span style={{color: 'var(--text-muted)', marginLeft: '4px'}}>Kw</span>
      </div>
      <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginTop: '16px'}}>
        <span style={{color: 'var(--accent-green)'}}>● {solarTotal.toFixed(2)} kWh</span>
        <span style={{color: 'var(--text-muted)'}}>{gridTotal.toFixed(2)} kWh</span>
      </div>
      <div className="progress-bar-bg">
        {mounted && <div className="progress-bar-fill" style={{width: `${solarPercent}%`}}></div>}
      </div>
      <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '4px', color: 'var(--text-main)', fontWeight: '600'}}>
        <span>{solarPercent}%</span>
        <span>{gridPercent}%</span>
      </div>
    </div>
  );
}
