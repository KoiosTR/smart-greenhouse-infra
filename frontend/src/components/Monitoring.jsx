import React, { useState, useEffect } from 'react';
import DigitalTwin3D from './DigitalTwin3D';

export default function Monitoring() {
  const [scadaData, setScadaData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date().toLocaleTimeString());
  const [filterCategory, setFilterCategory] = useState('all');

  // INTERACTIVE STATES
  const [controlMode, setControlMode] = useState('auto'); // 'auto' (PID) or 'manual' (Override)
  const [actuatorOverrides, setActuatorOverrides] = useState({});
  const [selectedZoneId, setSelectedZoneId] = useState('center');
  const [customZoneTargets, setCustomZoneTargets] = useState({
    east: 1.01,
    west: 0.85,
    north: 0.88,
    center: 1.00
  });
  const [activeModalActuator, setActiveModalActuator] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [extraLogs, setExtraLogs] = useState([]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const fetchScada = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/monitoring/scada');
      if (res.ok) {
        const data = await res.json();
        setScadaData(data);
        setLastUpdated(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error("SCADA fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScada();
    const interval = setInterval(fetchScada, 15000);
    return () => clearInterval(interval);
  }, []);

  const facility = scadaData?.facility || {
    co2_ppm: 3053,
    dew_point_c: 13.8,
    solar_irradiance_w_m2: 118,
    pressure_hpa: 853.7,
    temp_target_c: 22.7,
    soil_temp_c: 18.8,
    water_total_gal: 723
  };

  const rawActuators = scadaData?.actuators || [];
  const zones = scadaData?.zones || [];
  const baseLogs = scadaData?.logs || [];
  const allLogs = [...extraLogs, ...baseLogs];

  // Merge server actuators with manual overrides if in manual mode
  const actuators = rawActuators.map(act => {
    if (actuatorOverrides[act.id] !== undefined) {
      const isManualOn = actuatorOverrides[act.id];
      return {
        ...act,
        status: isManualOn ? 'RUNNING' : 'IDLE',
        isOverridden: true
      };
    }
    return act;
  });

  const filteredActuators = filterCategory === 'all' 
    ? actuators 
    : actuators.filter(a => a.category === filterCategory);

  const handleToggleActuator = (act) => {
    if (controlMode === 'auto') {
      setControlMode('manual');
    }

    const currentStatus = act.status === 'RUNNING' || act.status === 'ACTIVE' || act.status === 'OPEN';
    const nextStatus = !currentStatus;

    setActuatorOverrides(prev => ({
      ...prev,
      [act.id]: nextStatus
    }));

    const actionText = nextStatus ? 'AÇILDI (ON)' : 'KAPATILDI (OFF)';
    const newLog = {
      time: new Date().toLocaleTimeString(),
      type: 'MANUAL_OVERRIDE',
      message: `[Kullanıcı Müdahalesi] ${act.name} manuel olarak ${actionText}. MQTT Topic: actuators/${act.id}/set -> ${nextStatus ? 1 : 0}`,
      severity: nextStatus ? 'success' : 'info'
    };

    setExtraLogs(prev => [newLog, ...prev]);
    showToast(`⚙️ ${act.name} ${actionText} — Manuel moda geçildi.`);
  };

  const handleSimulateEmergencyTest = () => {
    const testLog = {
      time: new Date().toLocaleTimeString(),
      type: 'SAFETY_INTERLOCK',
      message: '⚡ Emniyet Prosedürü Testi: Yüksek VPD kompanzasyonu tetiklendi. Çatı menfezleri kapandı, sisleme hazırlandı.',
      severity: 'success'
    };
    setExtraLogs(prev => [testLog, ...prev]);
    showToast("⚡ SCADA Güvenlik Kilidi Testi başarıyla simüle edildi!");
  };

  const handleZoneSliderChange = (zoneId, newTarget) => {
    setCustomZoneTargets(prev => ({
      ...prev,
      [zoneId]: parseFloat(newTarget)
    }));
  };

  const getStatusBadge = (status, isRunning) => {
    switch (status) {
      case 'RUNNING':
      case 'ACTIVE':
        return (
          <span style={{ 
            background: '#ecfdf5', 
            color: '#059669', 
            border: '1px solid #a7f3d0', 
            padding: '4px 10px', 
            borderRadius: '9999px', 
            fontSize: '0.75rem', 
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#059669', animation: 'pulse 1.5s infinite' }}></span>
            ÇALIŞIYOR
          </span>
        );
      case 'OPEN':
        return (
          <span style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '4px 10px', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 700 }}>
            AÇIK (OPEN)
          </span>
        );
      case 'CLOSED':
        return (
          <span style={{ background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', padding: '4px 10px', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>
            KAPALI (LOCKED)
          </span>
        );
      case 'NOMINAL':
        return (
          <span style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '4px 10px', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 700 }}>
            GÜVENLİ (NOMINAL)
          </span>
        );
      default:
        return (
          <span style={{ background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', padding: '4px 10px', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>
            BEKLEMEDE (STANDBY)
          </span>
        );
    }
  };

  const getActuatorIcon = (category) => {
    switch (category) {
      case 'heating': return '🔥';
      case 'lighting': return '💡';
      case 'irrigation': return '💧';
      case 'ventilation': return '💨';
      case 'humidity': return '🌫️';
      case 'safety': return '🛡️';
      default: return '⚙️';
    }
  };

  const selectedZone = zones.find(z => z.id === selectedZoneId) || zones[0];
  const activeZoneTarget = selectedZone ? (customZoneTargets[selectedZone.id] ?? selectedZone.vpd_target ?? 1.0) : 1.0;

  return (
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', paddingRight: '4px', position: 'relative' }}>
      
      {/* FLOATING ACTION TOAST */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '32px',
          zIndex: 9999,
          background: '#0f172a',
          color: '#ffffff',
          padding: '12px 20px',
          borderRadius: '12px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          fontSize: '0.85rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          animation: 'slideIn 0.3s ease-out'
        }}>
          <span>{toastMessage}</span>
          <button 
            onClick={() => setToastMessage(null)}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem', marginLeft: '6px' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* HEADER PANEL WITH INTERACTIVE CONTROLS */}
      <div className="panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: '#0f172a' }}>
              Sera Sahası & Ekipman İzleme Paneli (SCADA)
            </h2>
            <span style={{ 
              background: '#ecfdf5', 
              color: '#059669', 
              border: '1px solid #a7f3d0', 
              padding: '4px 12px', 
              borderRadius: '9999px', 
              fontSize: '0.75rem', 
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#059669', animation: 'pulse 1.5s infinite' }}></span>
              CANLI TELEMETRİ
            </span>
          </div>
          <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', fontSize: '0.85rem' }}>
            Gerçek zamanlı aktüatör durumları, çok bölgeli iklim matrisi ve tesis parametreleri (Vallery Facility)
          </p>
        </div>

        {/* TOP INTERACTIVE ACTION BUTTONS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          
          {/* Mode Switcher: Auto PID vs Manual Override */}
          <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '9999px', border: '1px solid #e2e8f0' }}>
            <button
              onClick={() => {
                setControlMode('auto');
                setActuatorOverrides({});
                showToast("🤖 Otomatik SCADA (PID) Moduna dönüldü.");
              }}
              style={{
                background: controlMode === 'auto' ? '#0f172a' : 'transparent',
                color: controlMode === 'auto' ? '#ffffff' : '#64748b',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '9999px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Otomatik (PID)
            </button>
            <button
              onClick={() => {
                setControlMode('manual');
                showToast("⚠️ Manuel Müdahale Modu devrede! Donanım anahtarlarıyla doğrudan kontrol edebilirsiniz.");
              }}
              style={{
                background: controlMode === 'manual' ? '#f59e0b' : 'transparent',
                color: controlMode === 'manual' ? '#0f172a' : '#64748b',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '9999px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Manuel Müdahale
            </button>
          </div>

          <button 
            onClick={handleSimulateEmergencyTest}
            style={{
              background: '#f8fafc',
              color: '#0f172a',
              border: '1px solid #cbd5e1',
              padding: '8px 14px',
              borderRadius: '9999px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 5px rgba(0,0,0,0.02)'
            }}
          >
            <span>⚡</span> Test Tetikle
          </button>

          <button 
            onClick={fetchScada}
            style={{
              background: '#ffffff',
              color: '#0f172a',
              border: '1px solid #e2e8f0',
              padding: '8px 14px',
              borderRadius: '9999px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
            }}
          >
            ↻ Yenile
          </button>
        </div>
      </div>

      {/* INTERACTIVE 3D DIGITAL TWIN (HERO DISPLAY AT TOP OF MONITORING) */}
      <DigitalTwin3D 
        actuators={actuators}
        onToggleActuator={handleToggleActuator}
        controlMode={controlMode}
      />

      {/* TOP 4 KEY FACILITY PARAMETERS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        
        <div className="panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid #f1f5f9' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Karbondioksit (CO2)
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0284c7' }}>
              {facility.co2_ppm?.toLocaleString()}
            </span>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>ppm</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#059669', background: '#ecfdf5', padding: '3px 8px', borderRadius: '6px', alignSelf: 'flex-start', fontWeight: 600 }}>
            ● Zenginleştirilmiş Fotosentez
          </div>
        </div>

        <div className="panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid #f1f5f9' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Hedef Sıcaklık Rejimi
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#059669' }}>
              {facility.temp_target_c}
            </span>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>°C</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', background: '#f8fafc', padding: '3px 8px', borderRadius: '6px', alignSelf: 'flex-start', fontWeight: 500 }}>
            Otomatik PID Isıtma Kontrolü
          </div>
        </div>

        <div className="panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid #f1f5f9' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Çiy Noktası (Dew Point)
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#d97706' }}>
              {facility.dew_point_c}
            </span>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>°C</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#059669', background: '#ecfdf5', padding: '3px 8px', borderRadius: '6px', alignSelf: 'flex-start', fontWeight: 600 }}>
            Kondensasyon Riski: Düşük
          </div>
        </div>

        <div className="panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid #f1f5f9' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Güneş Işınımı (Irradiance)
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0f172a' }}>
              {facility.solar_irradiance_w_m2}
            </span>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>W/m²</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', background: '#f8fafc', padding: '3px 8px', borderRadius: '6px', alignSelf: 'flex-start', fontWeight: 500 }}>
            Barometre: {facility.pressure_hpa} hPa
          </div>
        </div>

      </div>

      {/* MAIN TWO-COLUMN LAYOUT: ACTUATORS (LEFT) & MULTI-ZONE (RIGHT) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(360px, 1.2fr)', gap: '20px' }}>
        
        {/* LEFT COLUMN: ACTUATOR SCADA MATRIX WITH TOGGLE SWITCHES */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
                  Aktüatör & Saha Ekipman Durumları
                </h3>
                {controlMode === 'manual' && (
                  <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                    MANUEL MOD AKTİF (Tıkla & Değiştir)
                  </span>
                )}
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {controlMode === 'auto' 
                  ? 'PID döngüsü tarafından otomatik yönetilen saha donanımları.' 
                  : 'Kartların üzerindeki anahtarlara tıklayarak donanımları anlık olarak açıp kapatabilirsiniz.'}
              </p>
            </div>

            {/* Category Filter Pills */}
            <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '9999px', gap: '4px' }}>
              {[
                { id: 'all', label: 'Tümü' },
                { id: 'heating', label: 'Isıtma' },
                { id: 'lighting', label: 'Aydınlatma' },
                { id: 'ventilation', label: 'Havalandırma' }
              ].map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setFilterCategory(cat.id)}
                  style={{
                    background: filterCategory === cat.id ? '#0f172a' : 'transparent',
                    color: filterCategory === cat.id ? '#ffffff' : '#64748b',
                    border: 'none',
                    padding: '6px 14px',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Actuator Cards Grid with Interactive Switches */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
            {filteredActuators.map((act) => {
              const isRunning = act.status === 'RUNNING' || act.status === 'ACTIVE' || act.status === 'OPEN';
              return (
                <div 
                  key={act.id}
                  style={{
                    background: '#ffffff',
                    border: isRunning ? '1px solid #86efac' : '1px solid #e2e8f0',
                    borderLeft: isRunning ? '5px solid #10b981' : '5px solid #cbd5e1',
                    borderRadius: '16px',
                    padding: '16px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '12px',
                    boxShadow: isRunning ? '0 4px 14px rgba(16, 185, 129, 0.08)' : '0 2px 8px rgba(0, 0, 0, 0.02)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ 
                          width: '32px', 
                          height: '32px', 
                          borderRadius: '8px', 
                          background: isRunning ? '#ecfdf5' : '#f8fafc', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          fontSize: '1.1rem' 
                        }}>
                          {getActuatorIcon(act.category)}
                        </span>
                        <strong style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: 700 }}>
                          {act.name}
                        </strong>
                      </div>
                      
                      {/* Interactive Toggle Switch */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {getStatusBadge(act.status, isRunning)}
                        
                        {/* iOS-Style Interactive Toggle Switch */}
                        <div 
                          onClick={() => handleToggleActuator(act)}
                          title={controlMode === 'auto' ? "Açıp/Kapatmak için önce Manuel Modu seçin" : "Durumu değiştir"}
                          style={{
                            width: '42px',
                            height: '24px',
                            background: isRunning ? '#10b981' : '#cbd5e1',
                            borderRadius: '9999px',
                            position: 'relative',
                            cursor: controlMode === 'manual' ? 'pointer' : 'not-allowed',
                            opacity: controlMode === 'manual' ? 1 : 0.6,
                            transition: 'background 0.3s ease'
                          }}
                        >
                          <div style={{
                            width: '18px',
                            height: '18px',
                            background: '#ffffff',
                            borderRadius: '50%',
                            position: 'absolute',
                            top: '3px',
                            left: isRunning ? '21px' : '3px',
                            transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.2)'
                          }} />
                        </div>
                      </div>
                    </div>

                    <div style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: '1.4' }}>
                      {act.description}
                    </div>
                  </div>

                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    fontSize: '0.78rem',
                    borderTop: '1px solid #f1f5f9',
                    paddingTop: '10px',
                    color: 'var(--text-muted)'
                  }}>
                    <span>Günlük Çalışma Süresi:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <strong style={{ color: isRunning ? '#059669' : '#0f172a', fontWeight: 700 }}>
                        {act.runtime_min > 0 ? `${act.runtime_min} dk (${(act.runtime_min / 60).toFixed(1)} sa)` : '0 dk'}
                      </strong>
                      <button
                        onClick={() => setActiveModalActuator(act)}
                        style={{
                          background: '#f1f5f9',
                          border: 'none',
                          color: '#0f172a',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        ⓘ Detay
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: MULTI-ZONE INTERACTIVE DRILL-DOWN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
                Bölgesel İklim Matrisi
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Detay ve hedef ayarı için herhangi bir bölgeye tıklayın
              </p>
            </div>

            {/* Zone Cards with Click Selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {zones.map((zone) => {
                const isSelected = selectedZoneId === zone.id;
                const temp = zone.temperature_c ?? '--';
                const hum = zone.humidity_pct ?? '--';
                const vpd = zone.vpd_kpa ?? '--';
                const target = customZoneTargets[zone.id] ?? zone.vpd_target ?? 1.0;
                const vpdDiff = vpd !== '--' ? (vpd - target).toFixed(2) : '0';

                return (
                  <div 
                    key={zone.id}
                    onClick={() => setSelectedZoneId(zone.id)}
                    style={{
                      background: '#ffffff',
                      border: isSelected ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                      borderRadius: '16px',
                      padding: '16px 18px',
                      boxShadow: isSelected ? '0 4px 16px rgba(59, 130, 246, 0.12)' : '0 2px 8px rgba(0, 0, 0, 0.02)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      position: 'relative'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ 
                          width: '8px', 
                          height: '8px', 
                          borderRadius: '50%', 
                          background: isSelected ? '#3b82f6' : '#cbd5e1' 
                        }} />
                        <strong style={{ fontSize: '0.95rem', color: isSelected ? '#1d4ed8' : '#0f172a', fontWeight: 700 }}>
                          {zone.name}
                        </strong>
                      </div>
                      <span style={{ 
                        fontSize: '0.72rem', 
                        color: '#059669', 
                        background: '#ecfdf5', 
                        border: '1px solid #a7f3d0',
                        padding: '2px 8px', 
                        borderRadius: '9999px',
                        fontWeight: 700 
                      }}>
                        {isSelected ? 'Seçili Bölge' : 'Nominal'}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                      <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: '10px', textAlign: 'center' }}>
                        <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 600 }}>Sıcaklık</div>
                        <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0f172a', marginTop: '2px' }}>{temp} °C</div>
                      </div>
                      <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: '10px', textAlign: 'center' }}>
                        <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 600 }}>Bağıl Nem</div>
                        <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0f172a', marginTop: '2px' }}>%{hum}</div>
                      </div>
                      <div style={{ background: '#ecfdf5', padding: '8px 10px', borderRadius: '10px', textAlign: 'center', border: '1px solid #d1fae5' }}>
                        <div style={{ color: '#059669', fontSize: '0.72rem', fontWeight: 700 }}>VPD</div>
                        <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#059669', marginTop: '2px' }}>{vpd} kPa</div>
                      </div>
                    </div>

                    <div style={{ marginTop: '10px', fontSize: '0.75rem', color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Hedef: <strong style={{ color: '#0f172a' }}>{target} kPa</strong></span>
                      <span>Sapma: <strong style={{ color: Math.abs(parseFloat(vpdDiff)) < 0.2 ? '#059669' : '#d97706' }}>{vpdDiff > 0 ? `+${vpdDiff}` : vpdDiff} kPa</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* INTERACTIVE ZONE TARGET SLIDER CARD */}
            {selectedZone && (
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                padding: '16px',
                marginTop: '4px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                    🎛️ {selectedZone.name} — Hedef VPD Sürgüsü
                  </span>
                  <strong style={{ color: '#0284c7', fontSize: '0.95rem' }}>{activeZoneTarget} kPa</strong>
                </div>

                <input 
                  type="range"
                  min="0.5"
                  max="1.6"
                  step="0.05"
                  value={activeZoneTarget}
                  onChange={(e) => handleZoneSliderChange(selectedZone.id, e.target.value)}
                  style={{ width: '100%', accentColor: '#0284c7', cursor: 'pointer' }}
                />

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  <span>0.5 kPa (Nemli/Düşük Buharlaşma)</span>
                  <span>1.0 kPa (İdeal)</span>
                  <span>1.6 kPa (Kuru)</span>
                </div>
              </div>
            )}

          </div>

        </div>

      </div>

      {/* BOTTOM PANEL: SCADA EVENT & CONTROL AUDIT LOG */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
              Saha SCADA Otomasyon ve Müdahale Günlüğü
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Tetiklenen aktüatör döngüleri, manuel müdahaleler ve güvenlik kilitleri (Interlocks)
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ 
              fontSize: '0.75rem', 
              color: '#059669', 
              background: '#ecfdf5', 
              border: '1px solid #a7f3d0', 
              padding: '4px 10px', 
              borderRadius: '9999px', 
              fontWeight: 700 
            }}>
              Canlı Akış Aktif ({allLogs.length} Kayıt)
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
          {allLogs.map((log, idx) => (
            <div 
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                fontSize: '0.82rem',
                padding: '10px 16px',
                background: '#f8fafc',
                borderRadius: '10px',
                border: '1px solid #f1f5f9',
                borderLeft: `4px solid ${
                  log.type === 'MANUAL_OVERRIDE' ? '#f59e0b' : 
                  log.type === 'SAFETY_INTERLOCK' ? '#ef4444' : 
                  log.severity === 'success' ? '#10b981' : '#3b82f6'
                }`
              }}
            >
              <span style={{ fontFamily: 'monospace', color: '#64748b', fontSize: '0.78rem', fontWeight: 600 }}>
                {log.time}
              </span>
              <span style={{ 
                background: log.type === 'MANUAL_OVERRIDE' ? '#f59e0b' : '#0f172a', 
                color: log.type === 'MANUAL_OVERRIDE' ? '#000000' : '#ffffff', 
                padding: '2px 8px', 
                borderRadius: '6px', 
                fontSize: '0.7rem',
                fontWeight: 700 
              }}>
                {log.type}
              </span>
              <span style={{ color: '#1e293b', flex: 1, fontWeight: 500 }}>
                {log.message}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ACTUATOR DETAILS MODAL */}
      {activeModalActuator && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div className="panel" style={{ width: '100%', maxWidth: '480px', padding: '24px', borderRadius: '20px', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.4rem' }}>{getActuatorIcon(activeModalActuator.category)}</span>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: 700 }}>
                  {activeModalActuator.name}
                </h3>
              </div>
              <button 
                onClick={() => setActiveModalActuator(null)}
                style={{ background: 'transparent', border: 'none', fontSize: '1.2rem', color: '#64748b', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '18px' }}>
              {activeModalActuator.description}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Mevcut Durum</div>
                <div style={{ marginTop: '4px' }}>
                  {getStatusBadge(activeModalActuator.status)}
                </div>
              </div>
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Günlük Çalışma</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                  {activeModalActuator.runtime_min} dk
                </div>
              </div>
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Donanım Sağlığı</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#059669', marginTop: '4px' }}>
                  %98.4 (Nominal)
                </div>
              </div>
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Protokol / Veri Yolu</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0284c7', marginTop: '4px' }}>
                  MQTT / Modbus-RTU
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => {
                  handleToggleActuator(activeModalActuator);
                  setActiveModalActuator(null);
                }}
                style={{
                  background: '#0f172a',
                  color: 'white',
                  border: 'none',
                  padding: '10px 18px',
                  borderRadius: '10px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Durumu Tersine Çevir (Toggle)
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
