import React, { useState, useEffect } from 'react';

export default function SystemHealth({ sensorData }) {
  const [msgCount, setMsgCount] = useState(0);
  const [throughput, setThroughput] = useState(0);

  // Calculate throughput (msg/sec)
  useEffect(() => {
    if (sensorData) {
      setMsgCount(prev => prev + 1);
    }
  }, [sensorData]);

  useEffect(() => {
    const interval = setInterval(() => {
      setThroughput(msgCount);
      setMsgCount(0);
    }, 1000);
    return () => clearInterval(interval);
  }, [msgCount]);

  return (
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto', padding: '12px 0' }}>
      <div className="panel glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2>System Health & Data Pipeline</h2>
          <p style={{ color: 'var(--text-muted)' }}>Monitoring end-to-end data throughput and infrastructure integrity</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div className="panel glass-panel" style={{ textAlign: 'center', padding: '32px' }}>
          <h3 style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>Current Throughput</h3>
          <div style={{ fontSize: '4rem', fontWeight: 'bold', color: throughput > 10 ? '#ef4444' : '#10b981' }}>
            {throughput}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>messages / second</div>
          
          <div style={{ marginTop: '32px' }}>
            <div style={{ height: '8px', width: '100%', background: '#334155', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ 
                height: '100%', 
                width: `${Math.min((throughput / 1000) * 100, 100)}%`, 
                background: throughput > 10 ? '#ef4444' : '#10b981',
                transition: 'width 0.3s ease'
              }}></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#64748b', marginTop: '8px' }}>
              <span>0 (Idle)</span>
              <span>1000 (Max Capacity)</span>
            </div>
          </div>
        </div>

        <div className="panel glass-panel">
          <h3 style={{ marginBottom: '24px' }}>Data Pipeline Architecture</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>1</div>
              <div style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
                <div style={{ fontWeight: 'bold' }}>Verdify Public Dashboard + saatlik arşiv</div>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Canlı sera telemetrisi</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>2</div>
              <div style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', borderLeft: '4px solid #10b981' }}>
                <div style={{ fontWeight: 'bold' }}>FastAPI Backend</div>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Veri işleme ve risk tahmini (VPD, GBM)</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>3</div>
              <div style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', borderLeft: '4px solid #8b5cf6' }}>
                <div style={{ fontWeight: 'bold' }}>Supabase PostgreSQL</div>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Saatlik arşiv (sensor_metrics, outdoor_weather_data)</div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </main>
  );
}
