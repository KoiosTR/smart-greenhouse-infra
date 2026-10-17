import React, { Suspense, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import GreenhouseScene from './GreenhouseScene';

class DigitalTwinErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMsg: error?.message || '3D Render Hatası' };
  }

  componentDidCatch(error, errorInfo) {
    console.error("DigitalTwin3D Hatası:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '460px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8fafc',
          borderRadius: '20px',
          border: '1px solid #e2e8f0',
          padding: '24px',
          textAlign: 'center',
          gap: '12px'
        }}>
          <span style={{ fontSize: '2.5rem' }}>🌱</span>
          <h3 style={{ margin: 0, color: '#0f172a', fontWeight: 700 }}>
            3D Sera Modeli Yüklenemedi
          </h3>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>
            {this.state.errorMsg}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, errorMsg: '' })}
            style={{
              marginTop: '8px',
              background: '#0f172a',
              color: '#ffffff',
              border: 'none',
              padding: '8px 18px',
              borderRadius: '9999px',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            Yeniden Başlat
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function Loader() {
  return (
    <Html center>
      <div style={{
        color: '#0f172a',
        fontWeight: 700,
        background: 'rgba(255,255,255,0.92)',
        padding: '10px 20px',
        borderRadius: '12px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        backdropFilter: 'blur(8px)',
        border: '1px solid #e2e8f0',
        whiteSpace: 'nowrap',
        fontSize: '0.85rem'
      }}>
        🌱 3D Sera Modeli Yükleniyor...
      </div>
    </Html>
  );
}

const PIN_THEMES = {
  light: { on: ['rgba(232, 121, 249, 0.95)', '#4a044e', '#c026d3', 'rgba(232, 121, 249, 0.8)'], icon: '💡' },
  heat: { on: ['rgba(254, 215, 170, 0.95)', '#9a3412', '#ea580c', 'rgba(234, 88, 12, 0.6)'], icon: '🔥' },
  water: { on: ['rgba(224, 242, 254, 0.95)', '#0369a1', '#0284c7', 'rgba(2, 132, 199, 0.5)'], icon: '💧' },
};

function Pin({ position, theme, isOn, label, onLabel, title, onClick }) {
  const [bg, fg, border, glow] = PIN_THEMES[theme].on;
  return (
    <Html position={position} center distanceFactor={14}>
      <div
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        style={{
          background: isOn ? bg : 'rgba(255, 255, 255, 0.95)',
          color: isOn ? fg : '#0f172a',
          border: isOn ? `2px solid ${border}` : '2px solid #94a3b8',
          padding: '4px 10px',
          borderRadius: '9999px',
          fontSize: '11px',
          fontWeight: 800,
          cursor: 'pointer',
          boxShadow: isOn ? `0 0 16px ${glow}` : '0 2px 10px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          whiteSpace: 'nowrap',
          userSelect: 'none',
          pointerEvents: 'auto'
        }}
        title={title}
      >
        <span>{PIN_THEMES[theme].icon}</span>
        <span>{label}: {isOn ? onLabel : 'KAPALI'}</span>
      </div>
    </Html>
  );
}

function GreenhouseModel({ isRotating, state, onToggleActuator }) {
  return (
    <GreenhouseScene state={state} rotate={isRotating}>
      <Pin position={[0, 4.9, 0]} theme="light" isOn={state.growLight} label="LED" onLabel="AÇIK (ON)"
        title="Tıklayarak Işıkları Aç/Kapat" onClick={() => onToggleActuator('grow_light_main')} />
      <Pin position={[5.2, 0.5, 0]} theme="heat" isOn={state.heating} label="ISITICI" onLabel="DEVREDE"
        title="Tıklayarak Isıtıcıyı Aç/Kapat" onClick={() => onToggleActuator('heat1')} />
      <Pin position={[-5.2, 1.4, 0]} theme="water" isOn={state.irrigation} label="SULAMA" onLabel="AKTİF"
        title="Tıklayarak Sulamayı Aç/Kapat" onClick={() => onToggleActuator('irrigation')} />
    </GreenhouseScene>
  );
}

export default function DigitalTwin3D({ actuators = [], onToggleActuator, controlMode }) {
  const [isRotating, setIsRotating] = useState(false);
  const controlsRef = useRef();

  // Determine active states
  const isOn = (match) => actuators.some(a => match(a.id) && ['RUNNING', 'ACTIVE', 'OPEN'].includes(a.status));
  const state = {
    growLight: isOn(id => id.includes('grow_light')),
    heating: isOn(id => id === 'heat1' || id === 'heat2'),
    irrigation: isOn(id => id.includes('irrigation')),
    vent: isOn(id => id === 'vent'),
    fans: isOn(id => id.startsWith('fan')),
    fogging: isOn(id => id === 'fog'),
  };
  const isGrowLightOn = state.growLight;

  const handleActuatorToggle = (id) => {
    const act = actuators.find(a => a.id === id || a.id.includes(id));
    if (act && onToggleActuator) {
      onToggleActuator(act);
    }
  };

  const handleResetCamera = () => {
    if (controlsRef.current) {
      controlsRef.current.reset();
    }
  };

  return (
    <DigitalTwinErrorBoundary>
      <div style={{
        position: 'relative',
        width: '100%',
        height: '460px',
        background: 'radial-gradient(circle at 50% 40%, #f1f5f9 0%, #e2e8f0 100%)',
        borderRadius: '20px',
        overflow: 'hidden',
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
      }}>
        
        {/* TOP LEFT STATUS BADGE */}
        <div style={{
          position: 'absolute',
          top: '16px',
          left: '18px',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          pointerEvents: 'none'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(255, 255, 255, 0.92)',
            backdropFilter: 'blur(8px)',
            padding: '6px 14px',
            borderRadius: '9999px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
            border: '1px solid rgba(226, 232, 240, 0.8)'
          }}>
            <span style={{ fontSize: '1.1rem' }}>🌐</span>
            <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>3D Sera Dijital İkizi (Digital Twin)</strong>
            <span style={{
              background: isGrowLightOn ? '#fdf4ff' : '#f1f5f9',
              color: isGrowLightOn ? '#c026d3' : '#64748b',
              padding: '2px 8px',
              borderRadius: '9999px',
              fontSize: '0.72rem',
              fontWeight: 700,
              border: isGrowLightOn ? '1px solid #f0abfc' : '1px solid #e2e8f0'
            }}>
              {isGrowLightOn ? '✨ LED Aydınlatma Devrede' : 'Doğal Güneş Işığı'}
            </span>
          </div>

          <div style={{
            fontSize: '0.75rem',
            color: '#64748b',
            background: 'rgba(255, 255, 255, 0.8)',
            padding: '4px 10px',
            borderRadius: '6px',
            alignSelf: 'flex-start',
            backdropFilter: 'blur(4px)'
          }}>
            💡 Model üzerindeki 3D pinlere veya alttaki butonlara tıklayarak donanımları tetikleyin!
          </div>
        </div>

        {/* TOP RIGHT CONTROLS */}
        <div style={{
          position: 'absolute',
          top: '16px',
          right: '18px',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <button
            onClick={handleResetCamera}
            style={{
              background: 'rgba(255, 255, 255, 0.92)',
              color: '#0f172a',
              border: '1px solid #e2e8f0',
              padding: '6px 12px',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
            }}
          >
            🎯 Kamerayı Sıfırla
          </button>

          <button
            onClick={() => setIsRotating(!isRotating)}
            style={{
              background: isRotating ? '#0f172a' : 'rgba(255, 255, 255, 0.92)',
              color: isRotating ? '#ffffff' : '#0f172a',
              border: '1px solid #e2e8f0',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
            }}
            title={isRotating ? "Dönmeyi Durdur" : "Otomatik Döndür"}
          >
            {isRotating ? '⏸' : '▶'}
          </button>
        </div>

        {/* 3D CANVAS WITH BULLETPROOF OFFLINE LIGHTING AND CENTERED MODEL */}
        <Canvas 
          camera={{ position: [12, 8, 15], fov: 38 }}
          gl={{ powerPreference: 'default', antialias: true, failIfMajorPerformanceCaveat: false }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener('webglcontextlost', (e) => {
              e.preventDefault();
            }, false);
          }}
        >
          <color attach="background" args={['#e2e8f0']} />
          
          <OrbitControls 
            ref={controlsRef}
            makeDefault
            enableZoom={true} 
            maxPolarAngle={Math.PI / 2.05} 
            minDistance={6}
            maxDistance={40}
            target={[0, 1.8, 0]}
          />

          <Suspense fallback={<Loader />}>
            <GreenhouseModel
              isRotating={isRotating}
              state={state}
              onToggleActuator={handleActuatorToggle}
            />
          </Suspense>
        </Canvas>

        {/* BOTTOM QUICK INTERACTION BAR */}
        <div style={{
          position: 'absolute',
          bottom: '12px',
          left: '18px',
          right: '18px',
          zIndex: 10,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          {/* Quick Actuator Toggle Buttons */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(255, 255, 255, 0.92)',
            backdropFilter: 'blur(8px)',
            padding: '4px 8px',
            borderRadius: '9999px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
          }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginLeft: '6px' }}>Hızlı Tetik:</span>
            
            {[
              { id: 'grow_light_main', on: state.growLight, icon: '💡', name: 'Işıklar', onTxt: 'Açık', offTxt: 'Kapalı', bg: '#fdf4ff', fg: '#c026d3', bd: '#f0abfc' },
              { id: 'heat1', on: state.heating, icon: '🔥', name: 'Isıtıcı', onTxt: 'Devrede', offTxt: 'Kapalı', bg: '#fff7ed', fg: '#ea580c', bd: '#fed7aa' },
              { id: 'irrigation', on: state.irrigation, icon: '💧', name: 'Sulama', onTxt: 'Aktif', offTxt: 'Kapalı', bg: '#f0f9ff', fg: '#0284c7', bd: '#bae6fd' },
              { id: 'vent', on: state.vent, icon: '🪟', name: 'Menfez', onTxt: 'Açık', offTxt: 'Kapalı', bg: '#f0fdf4', fg: '#16a34a', bd: '#bbf7d0' },
              { id: 'fan1', on: state.fans, icon: '🌀', name: 'Fan', onTxt: 'Çalışıyor', offTxt: 'Beklemede', bg: '#f0fdfa', fg: '#0d9488', bd: '#99f6e4' },
              { id: 'fog', on: state.fogging, icon: '☁️', name: 'Sisleme', onTxt: 'Aktif', offTxt: 'Beklemede', bg: '#f8fafc', fg: '#0369a1', bd: '#cbd5e1' },
            ].map((b) => (
              <button
                key={b.id}
                onClick={() => handleActuatorToggle(b.id)}
                style={{
                  background: b.on ? b.bg : '#f8fafc',
                  color: b.on ? b.fg : '#475569',
                  border: `1px solid ${b.on ? b.bd : '#cbd5e1'}`,
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                <span>{b.icon}</span> {b.name} {b.on ? b.onTxt : b.offTxt}
              </button>
            ))}
          </div>

          <div style={{
            background: 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(6px)',
            padding: '4px 12px',
            borderRadius: '9999px',
            fontSize: '0.72rem',
            color: '#475569',
            border: '1px solid #e2e8f0',
            pointerEvents: 'none'
          }}>
            🖱️ Sol Tıkla Döndür · Sağ Tıkla Kaydır · Tekerlekle Yakınlaş
          </div>
        </div>

      </div>
    </DigitalTwinErrorBoundary>
  );
}
