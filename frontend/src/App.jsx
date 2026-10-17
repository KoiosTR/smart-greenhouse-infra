import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Overview from './components/Overview';
import Analytics from './components/Analytics';
import Monitoring from './components/Monitoring';
import SystemHealth from './components/SystemHealth';

import WeatherMap from './components/WeatherMap';

function App() {
  const [activeTab, setActiveTab] = useState('Overview');
  const [sensorData, setSensorData] = useState(null);
  const [aiRisk, setAiRisk] = useState(null);
  const [trainingUpdate, setTrainingUpdate] = useState(null);

  useEffect(() => {
    let ws = null;
    let reconnectTimeout = null;

    const connect = () => {
      ws = new WebSocket('ws://localhost:8000/ws');
      
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'sensor_update') {
            setSensorData(payload.data);
          } else if (payload.type === 'ai_prediction') {
            setAiRisk(payload);
          } else if (payload.type === 'training_update') {
            setTrainingUpdate(payload);
          }
        } catch(e) {
          console.error(e);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected. Reconnecting in 3 seconds...');
        reconnectTimeout = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.warn('WebSocket bağlantı uyarısı (yeniden deneniyor):', err?.message || 'bağlantı kurulamadı');
        ws.close();
      };
    };

    const fetchLatestData = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/conditions/latest');
        const json = await res.json();
        if (json.data) {
          setSensorData(json.data);
          
          // Now fetch the AI prediction for today based on historical data
          const mlRes = await fetch('http://localhost:8000/api/ml/predict_today');
          const mlJson = await mlRes.json();
          if (mlJson.status === "success") {
            setAiRisk({
              risk_probability: mlJson.risk_probability,
              is_high_risk: mlJson.is_high_risk
            });
          }
        }
      } catch(e) {
        console.error("Failed to fetch latest conditions or ML prediction:", e);
      }
    };
    fetchLatestData();
    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        } else {
          ws.onopen = () => {
            try { ws.close(); } catch (_) {}
          };
        }
      }
    };
  }, []);

  return (
    <div className={`dashboard-layout ${activeTab === 'Weather' ? 'weather-active' : ''}`}>
      <Header activeTab={activeTab} onTabChange={setActiveTab} />
      
      <div style={{ display: activeTab === 'Overview' ? 'contents' : 'none' }}>
        <Overview sensorData={sensorData} aiRisk={aiRisk} />
      </div>
      {activeTab === 'Weather' && <WeatherMap sensorData={sensorData} />}
      {activeTab === 'Analytics' && <Analytics trainingUpdate={trainingUpdate} />}
      <div style={{ display: activeTab === 'Monitoring' ? 'contents' : 'none' }}>
        <Monitoring />
      </div>
      {activeTab === 'System Health' && <SystemHealth sensorData={sensorData} />}
    </div>
  );
}

export default App;
