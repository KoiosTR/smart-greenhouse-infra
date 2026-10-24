import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

export default function Analytics({ trainingUpdate }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Training State
  const [isTraining, setIsTraining] = useState(false);
  const [trainingData, setTrainingData] = useState([]);
  const [trainingStatus, setTrainingStatus] = useState(null); // 'started', 'running', 'completed', 'error'
  const [finalMetrics, setFinalMetrics] = useState(null);

  useEffect(() => {
    fetch('http://localhost:8000/api/analytics/historical')
      .then(res => res.json())
      .then(json => {
        const formattedData = (json.data || []).map(d => ({
          ...d,
          timeLabel: new Date(d.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }));
        setData(formattedData);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching analytics', err);
        setLoading(false);
      });
  }, []);

  // Listen to training updates from WebSocket
  useEffect(() => {
    if (trainingUpdate) {
      if (trainingUpdate.status === 'started') {
        setIsTraining(true);
        setTrainingData([]);
        setTrainingStatus('started');
        setFinalMetrics(null);
      } else if (trainingUpdate.status === 'running') {
        setTrainingStatus('running');
        setTrainingData(prev => [...prev, {
          epoch: trainingUpdate.epoch,
          loss: trainingUpdate.loss
        }]);
      } else if (trainingUpdate.status === 'completed') {
        setTrainingStatus('completed');
        setFinalMetrics(trainingUpdate.metrics);
        // Turn off training mode after 10 seconds automatically, or let user close it
      } else if (trainingUpdate.status === 'error') {
        setTrainingStatus('error');
      }
    }
  }, [trainingUpdate]);

  const handleStartTraining = () => {
    fetch('http://localhost:8000/api/train/start', { method: 'POST' })
      .catch(err => console.error('Failed to start training', err));
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: 'rgba(255, 255, 255, 0.9)', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
          <p style={{ margin: 0, fontWeight: 'bold' }}>{label}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ margin: 0, color: entry.color }}>
              {entry.name}: {entry.value?.toFixed(4) || entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto', padding: '12px 0' }}>
      <div className="panel glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2>AI Analytics Dashboard</h2>
          <p style={{ color: 'var(--text-muted)' }}>Historical Data & Predictive AI Risk Modeling</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {isTraining ? (
            <button 
              onClick={() => setIsTraining(false)}
              style={{ padding: '10px 16px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid #334155', borderRadius: '8px', cursor: 'pointer' }}
            >
              Exit Training View
            </button>
          ) : (
            <button 
              onClick={handleStartTraining}
              style={{ padding: '10px 16px', background: 'linear-gradient(90deg, #3b82f6, #10b981)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)' }}
            >
              ▶ Start AI Model Training
            </button>
          )}
          <button style={{ padding: '10px 16px', background: '#0f172a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
            Export CSV
          </button>
        </div>
      </div>
      
      {isTraining ? (
        // --- TRAINING DASHBOARD ---
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
          <div className="panel glass-panel" style={{ textAlign: 'center', background: trainingStatus === 'completed' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(15, 23, 42, 0.4)' }}>
            <h2 style={{ color: trainingStatus === 'completed' ? '#10b981' : '#e2e8f0', marginBottom: '8px' }}>
              {trainingStatus === 'started' ? 'Initializing AI Engine...' : 
               trainingStatus === 'running' ? 'Training PyTorch Model...' : 
               trainingStatus === 'completed' ? 'Model Training Completed!' : 'Training Error'}
            </h2>
            
            {trainingStatus === 'running' && trainingData.length > 0 && (
              <p style={{ fontSize: '1.2rem', color: '#94a3b8' }}>
                Epoch {trainingData[trainingData.length-1].epoch} / 20 | Loss: {trainingData[trainingData.length-1].loss.toFixed(4)}
              </p>
            )}
            
            {trainingStatus === 'completed' && finalMetrics && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '32px', marginTop: '16px' }}>
                <div>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'white' }}>{(finalMetrics.acc * 100).toFixed(1)}%</div>
                  <div style={{ color: 'var(--text-muted)' }}>Accuracy</div>
                </div>
                <div>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'white' }}>{(finalMetrics.prec * 100).toFixed(1)}%</div>
                  <div style={{ color: 'var(--text-muted)' }}>Precision</div>
                </div>
                <div>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'white' }}>{(finalMetrics.rec * 100).toFixed(1)}%</div>
                  <div style={{ color: 'var(--text-muted)' }}>Recall</div>
                </div>
              </div>
            )}
          </div>
          
          <div className="panel glass-panel">
            <h3 style={{ marginBottom: '16px' }}>Real-time Training Loss (BCEWithLogits)</h3>
            <div style={{ height: '400px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trainingData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                  <XAxis dataKey="epoch" stroke="#94a3b8" label={{ value: 'Epoch', position: 'insideBottomRight', fill: '#94a3b8', offset: -5 }} />
                  <YAxis stroke="#94a3b8" domain={['auto', 'auto']} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="loss" name="Training Loss" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 8 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : loading ? (
        // --- LOADING HISTORICAL DATA ---
        <div className="panel glass-panel" style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
          Loading historical data...
        </div>
      ) : data.length === 0 ? (
        // --- NO DATA ---
        <div className="panel glass-panel" style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
          No historical data available yet.
        </div>
      ) : (
        // --- HISTORICAL DATA DASHBOARD ---
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
          <div className="panel glass-panel">
            <h3 style={{ marginBottom: '16px' }}>AI Disease Risk Score (Area)</h3>
            <div style={{ height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="timeLabel" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="risk" name="AI Risk Score" stroke="#ef4444" fillOpacity={1} fill="url(#colorRisk)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div className="panel glass-panel">
              <h3 style={{ marginBottom: '16px' }}>Avg Temperature (°F)</h3>
              <div style={{ height: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="timeLabel" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" domain={['auto', 'auto']} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="temp" name="Temp (F)" stroke="#3b82f6" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="panel glass-panel">
              <h3 style={{ marginBottom: '16px' }}>Avg VPD (kPa)</h3>
              <div style={{ height: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="timeLabel" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" domain={['auto', 'auto']} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="vpd" name="VPD (kPa)" stroke="#10b981" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
