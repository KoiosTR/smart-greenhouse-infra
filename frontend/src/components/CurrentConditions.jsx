import React from 'react';

export default function CurrentConditions({ sensorData, selectedDate }) {
  const isToday = !selectedDate || selectedDate === new Date().toISOString().split('T')[0];

  const tempC = (sensorData && sensorData.temperature !== null) ? ((sensorData.temperature - 32) * 5/9).toFixed(1) : '--';
  const vpd = (sensorData && sensorData.vpd !== null) ? sensorData.vpd.toFixed(2) : '--';
  const humidity = (sensorData && sensorData.humidity !== null) ? sensorData.humidity.toFixed(0) : '--';
  
  // CO2 is empty in the current DB, so we replace it with Dew Point (Çiğ Noktası)
  const dewPoint = (tempC !== '--' && humidity !== '--') 
    ? (parseFloat(tempC) - ((100 - parseFloat(humidity)) / 5)).toFixed(1) 
    : '--';

  return (
    <div className="panel" style={{position: 'relative'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
        <div>
          <h3 style={{marginBottom: '4px'}}>{isToday ? 'Current Conditions' : 'Historical Conditions'}</h3>
          <p style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>Historical DB Data</p>
        </div>
        <button style={{background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b'}}>
          <span style={{color: sensorData ? 'var(--success)' : '#ccc'}}>●</span>
        </button>
      </div>
      
      <div className="conditions-grid" style={{marginTop: '20px'}}>
        <div className="condition-card">
          <span className="condition-label">Temperature</span>
          <span className="condition-value">{tempC}<span style={{fontSize:'1rem', color:'var(--text-muted)', marginLeft:'4px'}}>°C</span></span>
        </div>
        <div className="condition-card">
          <span className="condition-label">VPD</span>
          <span className="condition-value">{vpd}<span style={{fontSize:'1rem', color:'var(--text-muted)', marginLeft:'4px'}}>kPa</span></span>
        </div>
        <div className="condition-card">
          <span className="condition-label">Humidity</span>
          <span className="condition-value">{humidity}<span style={{fontSize:'1rem', color:'var(--text-muted)', marginLeft:'4px'}}>%</span></span>
        </div>
        <div className="condition-card">
          <span className="condition-label">Dew Point</span>
          <span className="condition-value">{dewPoint}<span style={{fontSize:'1rem', color:'var(--text-muted)', marginLeft:'4px'}}>°C</span></span>
        </div>
      </div>
      
      <div style={{display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)', margin: '16px 0'}}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
        <span>{isToday ? 'Sensor readings reflect current greenhouse metrics.' : `Sensor averages for ${selectedDate}.`}</span>
      </div>
      <button style={{width: '100%', padding: '12px', background: '#0f172a', color: 'white', borderRadius: '12px', border: 'none', fontWeight: '500', cursor: 'pointer'}}>
        View Detailed Report
      </button>
    </div>
  );
}
