import React, { useEffect, useState } from 'react';

export default function SitePower({ selectedDate }) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('Energy');

  const isToday = !selectedDate || selectedDate === new Date().toISOString().split('T')[0];
  
  // Deterministic mock logic based on selectedDate
  const seedStr = selectedDate || "2025-01-01";
  const seedNum = seedStr.split('-').reduce((acc, val) => acc + parseInt(val, 10), 0);
  
  // Format the date for display (e.g. "07/20/2025")
  const displayDate = selectedDate ? new Date(selectedDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '';
  
  // Generate a random-looking but deterministic pattern
  const getDotCount = (colIndex) => {
    if (isToday) return colIndex + 1; // Original pattern
    // Pseudo-random formula based on seed and column
    const offset = (seedNum * (colIndex + 1)) % 10;
    return offset === 0 ? 1 : offset;
  };
  
  // Dynamic totals based on seed
  const solarTotal = isToday ? 28.25 : 15 + ((seedNum * 2) % 20) + (seedNum % 100) / 100;
  const gridTotal = isToday ? 28.22 : 15 + ((seedNum * 3) % 20) + (seedNum % 100) / 100;

  useEffect(() => setMounted(true), []);

  return (
    <div className="panel">
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <h3>Site Power ⓘ</h3>
      </div>
      
      <div className="toggle-group">
        <button 
          className={`toggle-btn ${activeTab === 'Storage' ? 'active' : ''}`}
          onClick={() => setActiveTab('Storage')}
        >Storage</button>
        <button 
          className={`toggle-btn ${activeTab === 'Energy' ? 'active' : ''}`}
          onClick={() => setActiveTab('Energy')}
        >Energy</button>
      </div>

      <div className="power-scatter">
        {[1, 2, 3, 4, 5, 6].map((col, i) => {
          const activeDots = getDotCount(i);
          return (
            <div key={i} className="scatter-col">
              {[...Array(10)].map((_, dotIdx) => (
                <div 
                  key={dotIdx} 
                  className={`dot ${dotIdx < (10 - activeDots) ? 'muted' : ''}`}
                  style={mounted ? { animationDelay: `${(i * 0.1) + (dotIdx * 0.05)}s` } : {}}
                ></div>
              ))}
              <span style={{fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '8px'}}>
                {['00:00', '02:30', '05:00', '07:30', '10:00', '12:30'][i]}
              </span>
            </div>
          );
        })}
      </div>

      <p style={{fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '24px', lineHeight: '1.5'}}>
        ⓘ {isToday ? 'Total energy produced today so far is' : `Total energy produced on ${displayDate} was`} {solarTotal.toFixed(2)} kWh from Solar and {gridTotal.toFixed(2)} kWh from Grid.
      </p>
    </div>
  );
}
