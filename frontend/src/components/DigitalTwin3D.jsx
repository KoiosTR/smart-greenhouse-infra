import React, { Suspense, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, OrbitControls, Html, useProgress, Clone, Center } from '@react-three/drei';

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

function GreenhouseModel({ isRotating, isGrowLightOn, isHeatingOn, isIrrigationOn, onToggleActuator }) {
  const { scene } = useGLTF('/mangrove.glb');
  const groupRef = useRef();

  useFrame((state, delta) => {
    if (groupRef.current && isRotating) {
      groupRef.current.rotation.y += delta * 0.35;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Center component mathematically normalizes model to [0,0,0] */}
      <Center>
        <Clone object={scene} />

        {/* DYNAMIC SCADA LIGHTS IN 3D SPACE */}
        {isGrowLightOn && (
          <group position={[0, 2.5, 0]}>
            <pointLight color="#f472b6" intensity={12} distance={12} decay={2} />
            <pointLight color="#c084fc" intensity={8} distance={10} decay={2} position={[0, -0.6, 0]} />
            <pointLight color="#fde047" intensity={5} distance={8} decay={2} position={[1.5, 0, 0]} />
            <pointLight color="#fde047" intensity={5} distance={8} decay={2} position={[-1.5, 0, 0]} />
          </group>
        )}

        {isHeatingOn && (
          <group position={[0, -0.6, 0]}>
            <pointLight color="#ea580c" intensity={8} distance={8} decay={2} />
            <pointLight color="#f97316" intensity={5} distance={6} decay={2} position={[-1.5, 0, 0]} />
            <pointLight color="#f97316" intensity={5} distance={6} decay={2} position={[1.5, 0, 0]} />
          </group>
        )}

        {isIrrigationOn && (
          <pointLight position={[0, 0.8, 0]} color="#0284c7" intensity={7} distance={8} decay={2} />
        )}

        {/* 3D INTERACTIVE HOTSPOT PINS ANCHORED OVER THE GREENHOUSE */}
        <Html position={[0, 2.5, 0]} center distanceFactor={8}>
          <div 
            onClick={(e) => {
              e.stopPropagation();
              onToggleActuator('grow_light_main');
            }}
            style={{
              background: isGrowLightOn ? 'rgba(232, 121, 249, 0.95)' : 'rgba(255, 255, 255, 0.95)',
              color: isGrowLightOn ? '#4a044e' : '#0f172a',
              border: isGrowLightOn ? '2px solid #c026d3' : '2px solid #94a3b8',
              padding: '4px 10px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: isGrowLightOn ? '0 0 16px rgba(232, 121, 249, 0.8)' : '0 2px 10px rgba(0,0,0,0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              pointerEvents: 'auto'
            }}
            title="Tıklayarak Işıkları Aç/Kapat"
          >
            <span>💡</span>
            <span>LED: {isGrowLightOn ? 'AÇIK (ON)' : 'KAPALI'}</span>
          </div>
        </Html>

        <Html position={[-2.0, -0.2, 0.8]} center distanceFactor={8}>
          <div 
            onClick={(e) => {
              e.stopPropagation();
              onToggleActuator('heat1');
            }}
            style={{
              background: isHeatingOn ? 'rgba(254, 215, 170, 0.95)' : 'rgba(255, 255, 255, 0.95)',
              color: isHeatingOn ? '#9a3412' : '#0f172a',
              border: isHeatingOn ? '2px solid #ea580c' : '2px solid #94a3b8',
              padding: '4px 10px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: isHeatingOn ? '0 0 16px rgba(234, 88, 12, 0.6)' : '0 2px 10px rgba(0,0,0,0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              pointerEvents: 'auto'
            }}
            title="Tıklayarak Isıtıcıyı Aç/Kapat"
          >
            <span>🔥</span>
            <span>ISITICI: {isHeatingOn ? 'DEVREDE' : 'KAPALI'}</span>
          </div>
        </Html>

        <Html position={[2.0, 0.2, 0.8]} center distanceFactor={8}>
          <div 
            onClick={(e) => {
              e.stopPropagation();
              onToggleActuator('irrigation');
            }}
            style={{
              background: isIrrigationOn ? 'rgba(224, 242, 254, 0.95)' : 'rgba(255, 255, 255, 0.95)',
              color: isIrrigationOn ? '#0369a1' : '#0f172a',
              border: isIrrigationOn ? '2px solid #0284c7' : '2px solid #94a3b8',
              padding: '4px 10px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: isIrrigationOn ? '0 0 16px rgba(2, 132, 199, 0.5)' : '0 2px 10px rgba(0,0,0,0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              pointerEvents: 'auto'
            }}
            title="Tıklayarak Sulamayı Aç/Kapat"
          >
            <span>💧</span>
            <span>SULAMA: {isIrrigationOn ? 'AKTİF' : 'KAPALI'}</span>
          </div>
        </Html>
      </Center>
    </group>
  );
}

useGLTF.preload('/mangrove.glb');

export default function DigitalTwin3D({ actuators = [], onToggleActuator, controlMode }) {
  const [isRotating, setIsRotating] = useState(false);
  const controlsRef = useRef();

  // Determine active states
  const isGrowLightOn = actuators.some(a => a.id.includes('grow_light') && (a.status === 'RUNNING' || a.status === 'ACTIVE'));
  const isHeatingOn = actuators.some(a => (a.id === 'heat1' || a.id === 'heat2') && (a.status === 'RUNNING' || a.status === 'ACTIVE'));
  const isIrrigationOn = actuators.some(a => a.id.includes('irrigation') && (a.status === 'RUNNING' || a.status === 'ACTIVE'));

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
          camera={{ position: [6, 4.5, 7.5], fov: 38 }}
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
            minDistance={4} 
            maxDistance={20} 
            target={[0, 0, 0]}
          />

          <ambientLight intensity={0.7} />
          <directionalLight position={[8, 12, 8]} intensity={1.1} />
          <directionalLight position={[-8, 6, -6]} intensity={0.5} />

          <Suspense fallback={<Loader />}>
            <GreenhouseModel 
              isRotating={isRotating}
              isGrowLightOn={isGrowLightOn}
              isHeatingOn={isHeatingOn}
              isIrrigationOn={isIrrigationOn}
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
            
            <button
              onClick={() => handleActuatorToggle('grow_light_main')}
              style={{
                background: isGrowLightOn ? '#fdf4ff' : '#f8fafc',
                color: isGrowLightOn ? '#c026d3' : '#475569',
                border: isGrowLightOn ? '1px solid #f0abfc' : '1px solid #cbd5e1',
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
              <span>💡</span> Işıklar {isGrowLightOn ? 'Açık' : 'Kapalı'}
            </button>

            <button
              onClick={() => handleActuatorToggle('heat1')}
              style={{
                background: isHeatingOn ? '#fff7ed' : '#f8fafc',
                color: isHeatingOn ? '#ea580c' : '#475569',
                border: isHeatingOn ? '1px solid #fed7aa' : '1px solid #cbd5e1',
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
              <span>🔥</span> Isıtıcı {isHeatingOn ? 'Devrede' : 'Kapalı'}
            </button>

            <button
              onClick={() => handleActuatorToggle('irrigation')}
              style={{
                background: isIrrigationOn ? '#f0f9ff' : '#f8fafc',
                color: isIrrigationOn ? '#0284c7' : '#475569',
                border: isIrrigationOn ? '1px solid #bae6fd' : '1px solid #cbd5e1',
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
              <span>💧</span> Sulama {isIrrigationOn ? 'Aktif' : 'Kapalı'}
            </button>
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
