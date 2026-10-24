import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Overview from './components/Overview';
import Analytics from './components/Analytics';
import Monitoring from './components/Monitoring';
import SystemHealth from './components/SystemHealth';

import WeatherMap from './components/WeatherMap';
import { animate, stagger } from 'motion/react';

function App() {
  const [activeTab, setActiveTab] = useState('Overview');
  const [sensorData, setSensorData] = useState(null);
  const [aiRisk, setAiRisk] = useState(null);
  const [offline, setOffline] = useState(false);
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

    // Backend hazır değilse (Docker yeni açılıyor) 3 sn'de bir yeniden dener; bağlanınca dakikada bir yeniler
    let stopped = false;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const fetchLatestData = async () => {
      const res = await fetch('http://localhost:8000/api/conditions/latest'); // bağlanamazsa fırlatır -> yeniden dene
      const json = await res.json();
      if (json.data) setSensorData(json.data);
      try {
        const mlJson = await (await fetch('http://localhost:8000/api/ml/predict_today')).json();
        if (mlJson.status === "success") {
          setAiRisk({ risk_probability: mlJson.risk_probability, is_high_risk: mlJson.is_high_risk });
        }
      } catch (e) { /* risk paneli boş kalır, ana veri yine de gösterilir */ }
    };
    const refreshLoop = async () => {
      while (!stopped) {
        try {
          await fetchLatestData();
          setOffline(false);
          fetch('http://localhost:8000/api/sync/refresh', { method: 'POST' }).catch(() => {}); // eksik saatleri arka planda tamamla
          await sleep(60000);
        } catch (e) {
          setOffline(true);
          await sleep(3000);
        }
      }
    };
    refreshLoop();
    connect();

    return () => {
      stopped = true;
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

  // Sekme değişince görünür panelleri sırayla yukarı kaydırarak göster (sayfalar bağlı kaldığı için DOM üzerinden)
  useEffect(() => {
    if (activeTab === 'Weather') return;
    const id = requestAnimationFrame(() => {
      const els = [...document.querySelectorAll('.dashboard-layout .panel')].filter(e => e.offsetParent !== null);
      if (!els.length) return;
      // Bitince satır içi stilleri sil: kalan transform/opacity her paneli ayrı katman yapıp takvim açılır penceresini arkada bırakır
      animate(els, { opacity: [0, 1], transform: ['translateY(18px)', 'none'] }, { duration: 0.45, delay: stagger(0.06), ease: 'easeOut' })
        .then(() => els.forEach(e => { e.style.transform = ''; e.style.opacity = ''; }));
    });
    return () => cancelAnimationFrame(id);
  }, [activeTab]);

  return (
    <div className={`dashboard-layout ${activeTab === 'Weather' ? 'weather-active' : ''}`}>
      <Header activeTab={activeTab} onTabChange={setActiveTab} />
      {offline && <div style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', borderRadius: '12px', padding: '8px 16px', fontSize: '0.85rem', fontWeight: 600 }}>Sunucuya bağlanılıyor… (Docker açılıyorsa birkaç saniye sürebilir)</div>}

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
