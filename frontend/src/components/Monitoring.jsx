import React, { useState, useEffect } from 'react';
import MonitoringCharts from './MonitoringCharts';
import LiveCameras from './LiveCameras';
import { Spark, RuntimeBar, VpdBullet } from './MonitoringViz';

export default function Monitoring() {
  const [scadaData, setScadaData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date().toLocaleTimeString());
  const [filterCategory, setFilterCategory] = useState('all');
  const [kpi, setKpi] = useState([]); // Grafana: son 24 saatlik saatlik seriler (KPI kart grafikleri)
  useEffect(() => {
    fetch('http://localhost:8000/api/monitoring/kpi').then(r => r.json()).then(j => setKpi(j.data || [])).catch(() => setKpi([]));
  }, []);
  const lastKpi = [...kpi].reverse().find(d => d.temp != null) || {};
  const tempDelta = lastKpi.temp != null && lastKpi.target != null ? lastKpi.temp - lastKpi.target : null;
  const dewMargin = lastKpi.temp != null && lastKpi.dew != null ? lastKpi.temp - lastKpi.dew : null; // hava sıcaklığı - çiy noktası

  const [activeModalActuator, setActiveModalActuator] = useState(null);

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

  const facility = scadaData?.facility || {};

  const rawActuators = scadaData?.actuators || [];
  const zones = scadaData?.zones || [];
  const baseLogs = scadaData?.logs || [];
  const allLogs = baseLogs;
  const actuators = rawActuators;

  const filteredActuators = filterCategory === 'all' 
    ? actuators 
    : actuators.filter(a => a.category === filterCategory);

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

  return (
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '28px', overflowY: 'auto', paddingRight: '4px', position: 'relative' }}>
      
      {/* HEADER PANEL */}
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

      {/* TOP 4 KEY FACILITY PARAMETERS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        
        <div className="panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid #f1f5f9' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Ortalama VPD
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0284c7' }}>
              {facility.vpd_kpa ?? '--'}
            </span>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>kPa</span>
          </div>
          <Spark data={kpi} k="vpd" color="#0284c7" gid="kpiVpd" />
          <div className={`mv-chip ${facility.vpd_kpa == null ? '' : facility.vpd_kpa >= 0.8 && facility.vpd_kpa <= 1.2 ? 'ok' : 'warn'}`}>
            {facility.vpd_kpa == null ? '--' : facility.vpd_kpa < 0.8 ? 'Düşük VPD · nemli ortam' : facility.vpd_kpa <= 1.2 ? 'Hedef bandında (0,8–1,2)' : 'Yüksek VPD · kuru ortam'}
          </div>
        </div>

        <div className="panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid #f1f5f9' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Hedef Sıcaklık Rejimi
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#059669' }}>
              {facility.temp_target_c ?? '--'}
            </span>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>°C</span>
          </div>
          <Spark data={kpi} k="temp" color="#059669" k2="target" color2="#94a3b8" gid="kpiTemp" />
          <div className={`mv-chip ${tempDelta == null ? '' : Math.abs(tempDelta) < 1 ? 'ok' : 'warn'}`}>
            {tempDelta == null ? '--' : `Gerçek ${lastKpi.temp} °C · fark ${tempDelta > 0 ? '+' : ''}${tempDelta.toFixed(1)} °C`}
          </div>
        </div>

        <div className="panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid #f1f5f9' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Çiy Noktası (Dew Point)
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#d97706' }}>
              {facility.dew_point_c ?? '--'}
            </span>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>°C</span>
          </div>
          <Spark data={kpi} k="dew" color="#d97706" k2="temp" color2="#94a3b8" gid="kpiDew" />
          <div className={`mv-chip ${dewMargin == null ? '' : dewMargin < 2 ? 'bad' : dewMargin < 4 ? 'warn' : 'ok'}`}>
            {dewMargin == null ? '--' : `Kondensasyon Riski: ${dewMargin < 2 ? 'Yüksek' : dewMargin < 4 ? 'Orta' : 'Düşük'} · marj ${dewMargin.toFixed(1)} °C`}
          </div>
        </div>

        <div className="panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid #f1f5f9' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Güneş Işınımı (Irradiance)
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0f172a' }}>
              {facility.solar_irradiance_w_m2 ?? '--'}
            </span>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>W/m²</span>
          </div>
          <Spark data={kpi} k="solar" color="#f59e0b" gid="kpiSolar" />
          <div className="mv-chip">Dış ortam ölçümü</div>
        </div>

      </div>

      <LiveCameras />

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
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Verdify verisinden izlenen saha donanımları. Durum son arşiv saatine göre, süreler son 24 saat toplamıdır (gecikmeli).
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
                    <span>Son 24 saat çalışma:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <strong style={{ color: isRunning ? '#059669' : '#0f172a', fontWeight: 700 }}>
                        {act.runtime_min == null ? '--' : `${act.runtime_min} dk (${(act.runtime_min / 60).toFixed(1)} sa)`}
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
                  <RuntimeBar minutes={act.runtime_min} running={isRunning} />
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
                Bölge bazlı sıcaklık, nem ve VPD (hedefle karşılaştırmalı)
              </p>
            </div>

            {/* Zone Cards with Click Selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {zones.map((zone) => {
                const temp = zone.temperature_c ?? '--';
                const hum = zone.humidity_pct ?? '--';
                const vpd = zone.vpd_kpa ?? '--';
                const target = zone.vpd_target;
                const vpdDiff = (vpd !== '--' && target != null) ? (vpd - target).toFixed(2) : null;

                return (
                  <div 
                    key={zone.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '16px',
                      padding: '16px 18px',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
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
                          background: '#cbd5e1' 
                        }} />
                        <strong style={{ fontSize: '0.95rem', color: '#0f172a', fontWeight: 700 }}>
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
                        {vpdDiff == null ? '--' : Math.abs(parseFloat(vpdDiff)) < 0.2 ? 'Hedefte' : 'Sapma var'}
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

                    <VpdBullet value={typeof vpd === 'number' ? vpd : null} target={target ?? null} />

                    <div style={{ marginTop: '10px', fontSize: '0.75rem', color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Hedef: <strong style={{ color: '#0f172a' }}>{target ?? '--'} kPa</strong></span>
                      <span>Sapma: <strong style={{ color: Math.abs(parseFloat(vpdDiff)) < 0.2 ? '#059669' : '#d97706' }}>{vpdDiff == null ? '--' : vpdDiff > 0 ? `+${vpdDiff}` : vpdDiff} kPa</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>

        </div>

      </div>

      <MonitoringCharts />

      {/* BOTTOM PANEL: SCADA EVENT & CONTROL AUDIT LOG */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
              Saha SCADA Olay Günlüğü
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Aktüatör açma/kapama olayları (Grafana equipment_state)
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
                  log.type === 'SAFETY_INTERLOCK' ? '#ef4444' : 
                  log.severity === 'success' ? '#10b981' : '#3b82f6'
                }`
              }}
            >
              <span style={{ fontFamily: 'monospace', color: '#64748b', fontSize: '0.78rem', fontWeight: 600 }}>
                {log.time}
              </span>
              <span style={{ 
                background: '#0f172a', 
                color: '#ffffff', 
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
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Son 24 Saat Çalışma</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                  {activeModalActuator.runtime_min ?? '--'} dk
                </div>
              </div>
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Protokol / Veri Yolu</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0284c7', marginTop: '4px' }}>
                  Verdify Grafana (HTTP)
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

    </main>
  );
}
