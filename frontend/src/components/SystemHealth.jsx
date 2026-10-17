import React, { useState, useEffect } from 'react';

export default function SystemHealth({ sensorData }) {
  const [msgCount, setMsgCount] = useState(0);
  const [throughput, setThroughput] = useState(0);
  const [isStressTesting, setIsStressTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

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

  const handleStressTest = async () => {
    setIsStressTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('http://localhost:8000/api/test/load', { method: 'POST' });
      const data = await res.json();
      setTestResult(`Successfully injected ${data.messages_sent} messages to MQTT in burst mode.`);
    } catch (err) {
      setTestResult(`Stress test failed: ${err.message}`);
    }
    setIsStressTesting(false);
  };

  return (
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto', padding: '12px 0' }}>
      <div className="panel glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2>System Health & Data Pipeline</h2>
          <p style={{ color: 'var(--text-muted)' }}>Monitoring end-to-end data throughput and infrastructure integrity</p>
        </div>
        <div>
          <button 
            onClick={handleStressTest}
            disabled={isStressTesting}
            style={{ 
              padding: '10px 16px', 
              background: isStressTesting ? '#475569' : '#ef4444', 
              color: 'white', 
              border: 'none', 
              borderRadius: '8px', 
              cursor: isStressTesting ? 'not-allowed' : 'pointer', 
              fontWeight: 'bold', 
              boxShadow: isStressTesting ? 'none' : '0 4px 12px rgba(239, 68, 68, 0.3)' 
            }}
          >
            {isStressTesting ? 'Injecting Load...' : '⚠️ Run Stress Test (1000 msg/sec)'}
          </button>
        </div>
      </div>

      {testResult && (
        <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', color: '#10b981', padding: '16px', borderRadius: '8px' }}>
          {testResult}
        </div>
      )}
      
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
                <div style={{ fontWeight: 'bold' }}>Greenhouse Simulator</div>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Generates JSON payloads from CSV</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>2</div>
              <div style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
                <div style={{ fontWeight: 'bold' }}>Mosquitto MQTT Broker</div>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Edge communication layer (Port 1883)</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#ec4899', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>3</div>
              <div style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', borderLeft: '4px solid #ec4899' }}>
                <div style={{ fontWeight: 'bold' }}>Apache Kafka</div>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Message Queue (Topic: raw-sensor-data)</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>4</div>
              <div style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', borderLeft: '4px solid #10b981' }}>
                <div style={{ fontWeight: 'bold' }}>FastAPI Backend</div>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Data Parsing & AI Inference</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>5</div>
              <div style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', borderLeft: '4px solid #8b5cf6' }}>
                <div style={{ fontWeight: 'bold' }}>TimescaleDB</div>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Time-series optimized Hypertable</div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </main>
  );
}
