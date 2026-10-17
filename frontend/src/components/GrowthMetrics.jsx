import React, { useEffect, useState, useRef } from 'react';
import Calendar from 'react-calendar';
import './Calendar.css';

export default function GrowthMetrics({ sensorData, selectedDate, setSelectedDate }) {
  const [mounted, setMounted] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const calendarRef = useRef(null);

  // Close calendar when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        setShowCalendar(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [calendarRef]);

  const isToday = selectedDate === new Date().toISOString().split('T')[0];
  
  const [trends, setTrends] = useState([]);

  useEffect(() => {
    fetch(`http://localhost:8000/api/trends/date?date=${selectedDate}`)
      .then(res => res.json())
      .then(json => {
        if (json && json.data) {
          setTrends(json.data);
        } else {
          setTrends([]);
        }
      })
      .catch(err => {
        console.error("Error fetching trends for insights:", err);
        setTrends([]);
      });
  }, [selectedDate]);

  const validTemps = trends.filter(t => t.temperature !== null);
  const maxTempObj = validTemps.length > 0 ? validTemps.reduce((prev, current) => (prev.temperature > current.temperature) ? prev : current) : null;
  const minTempObj = validTemps.length > 0 ? validTemps.reduce((prev, current) => (prev.temperature < current.temperature) ? prev : current) : null;
  
  const maxTempC = maxTempObj ? ((maxTempObj.temperature - 32) * 5/9).toFixed(1) : null;
  const minTempC = minTempObj ? ((minTempObj.temperature - 32) * 5/9).toFixed(1) : null;
  
  // Calculate Avg VPD for the day, or use current sensorData if today and active
  const validVpds = trends.filter(t => t.vpd !== null);
  const avgVpd = validVpds.length > 0 ? (validVpds.reduce((sum, curr) => sum + curr.vpd, 0) / validVpds.length).toFixed(2) : (sensorData && sensorData.vpd ? sensorData.vpd.toFixed(2) : null);
  
  // VPD Sweet spot logic (Ideal is 0.8 to 1.2)
  let vpdStatusColor = '#94a3b8';
  let vpdStatusText = 'No Data';
  let vpdPercent = 0;
  
  if (avgVpd !== null) {
    const vpd = parseFloat(avgVpd);
    vpdPercent = Math.min((vpd / 2.5) * 100, 100); // map 0-2.5 to 0-100%
    if (vpd >= 0.8 && vpd <= 1.2) {
      vpdStatusColor = '#10b981'; // Green
      vpdStatusText = 'Optimal Transpiration';
    } else if (vpd < 0.8) {
      vpdStatusColor = '#3b82f6'; // Blue
      vpdStatusText = 'Low (Risk of Mold)';
    } else {
      vpdStatusColor = '#ef4444'; // Red
      vpdStatusText = 'High (Plant Stress)';
    }
  }
  
  const getDisplayLabel = () => {
    if (isToday) return 'Today';
    const d = new Date(selectedDate);
    // Return the day of the week (e.g., Monday, Tuesday)
    return d.toLocaleDateString('en-US', { weekday: 'long' });
  };

  const handleDateChange = (date) => {
    // Format to YYYY-MM-DD
    const offset = date.getTimezoneOffset()
    date = new Date(date.getTime() - (offset*60*1000))
    setSelectedDate(date.toISOString().split('T')[0]);
    setShowCalendar(false);
  };

  const displayDateStr = selectedDate ? new Date(selectedDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '';

  useEffect(() => setMounted(true), []);

  return (
    <>
      <div className="panel" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', marginBottom: '24px', position: 'relative'}}>
        <div style={{display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--text-muted)'}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          <span style={{fontSize: '0.9rem', color: '#0f172a', fontWeight: '500'}}>{getDisplayLabel()}</span>
        </div>
        
        <div 
          onClick={() => setShowCalendar(!showCalendar)}
          style={{
            fontSize: '0.85rem', 
            color: 'var(--text-muted)', 
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '4px',
            transition: 'background 0.2s',
          }}
          onMouseOver={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
        >
          {displayDateStr}
        </div>

        {showCalendar && (
          <div ref={calendarRef} style={{ position: 'absolute', top: '100%', right: '0', zIndex: 50, marginTop: '8px' }}>
            <Calendar 
              onChange={handleDateChange} 
              value={new Date(selectedDate)}
              calendarType="gregory"
            />
          </div>
        )}

        <button style={{background: 'none', border: 'none', cursor: 'pointer', color: '#64748b'}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        </button>
      </div>

      <div className="panel">
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
          <h3>Climate Insights</h3>
          <span style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>Daily Summary</span>
        </div>
        
        {/* VPD Health Indicator */}
        <div style={{marginBottom: '20px', padding: '12px', background: 'var(--bg-main)', borderRadius: '12px', border: '1px solid #e2e8f0'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
            <span style={{fontSize: '0.85rem', fontWeight: '500', color: 'var(--text-muted)'}}>VPD Health</span>
            <span style={{fontSize: '0.85rem', fontWeight: '600', color: vpdStatusColor}}>{avgVpd !== null ? `${avgVpd} kPa` : '--'}</span>
          </div>
          <div style={{width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', position: 'relative'}}>
            <div style={{
              position: 'absolute', top: 0, bottom: 0, left: '32%', width: '16%', background: 'rgba(16, 185, 129, 0.2)'
            }}></div> {/* The Sweet Spot Zone (0.8 to 1.2 on a 2.5 scale is roughly 32% to 48%) */}
            <div style={{
              height: '100%', 
              width: `${vpdPercent}%`, 
              background: vpdStatusColor,
              borderRadius: '4px',
              transition: 'width 1s ease-out, background 0.5s'
            }}></div>
          </div>
          <div style={{fontSize: '0.75rem', color: vpdStatusColor, marginTop: '6px', textAlign: 'right', fontWeight: '500'}}>
            {vpdStatusText}
          </div>
        </div>

        {/* Daily Extremes (Min/Max) */}
        <div style={{display: 'flex', gap: '12px'}}>
          <div style={{flex: 1, padding: '12px', background: 'var(--bg-main)', borderRadius: '12px', border: '1px solid #fecaca', display: 'flex', flexDirection: 'column'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px'}}>
              <span style={{color: '#ef4444'}}>🔥</span>
              <span style={{fontSize: '0.8rem', fontWeight: '500', color: '#7f1d1d'}}>Peak Heat</span>
            </div>
            <span style={{fontSize: '1.4rem', fontWeight: '700', color: '#1e293b'}}>
              {maxTempC !== null ? `${maxTempC}°C` : '--'}
            </span>
            <span style={{fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px'}}>
              {maxTempObj ? `at ${maxTempObj.time}` : 'No data'}
            </span>
          </div>
          
          <div style={{flex: 1, padding: '12px', background: 'var(--bg-main)', borderRadius: '12px', border: '1px solid #bfdbfe', display: 'flex', flexDirection: 'column'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px'}}>
              <span style={{color: '#3b82f6'}}>❄️</span>
              <span style={{fontSize: '0.8rem', fontWeight: '500', color: '#1e3a8a'}}>Lowest Drop</span>
            </div>
            <span style={{fontSize: '1.4rem', fontWeight: '700', color: '#1e293b'}}>
              {minTempC !== null ? `${minTempC}°C` : '--'}
            </span>
            <span style={{fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px'}}>
              {minTempObj ? `at ${minTempObj.time}` : 'No data'}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
