import React, { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import GreenhouseScene from './GreenhouseScene';

// Overview'da canlı aktüatör verisi yok; sakin bir vitrin durumu gösterilir.
const SHOWCASE_STATE = { fans: true, vent: true };

function Loader() {
  return (
    <Html center>
      <div style={{
        color: '#1e293b', 
        fontWeight: 600, 
        background: 'rgba(255,255,255,0.92)', 
        padding: '8px 16px', 
        borderRadius: '8px', 
        boxShadow: '0 4px 15px rgba(0,0,0,0.1)', 
        whiteSpace: 'nowrap',
        fontSize: '0.85rem'
      }}>
        🌱 3D Model Yükleniyor...
      </div>
    </Html>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMsg: error.message };
  }

  componentDidCatch(error, errorInfo) {
    console.error("3D Model Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display:'flex', 
          alignItems:'center', 
          justifyContent:'center', 
          height:'100%', 
          background:'#fee2e2', 
          color:'#b91c1c', 
          padding:'20px', 
          borderRadius:'12px', 
          textAlign:'center', 
          flexDirection:'column'
        }}>
          <span style={{fontSize:'2rem', marginBottom:'12px'}}>⚠️</span>
          <strong>3D Model Yüklenemedi</strong>
          <span style={{fontSize:'0.8rem', marginTop:'8px'}}>{this.state.errorMsg}</span>
          <button 
            onClick={() => this.setState({ hasError: false, errorMsg: '' })}
            style={{
              marginTop: '12px',
              padding: '6px 14px',
              background: '#0f172a',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Yeniden Dene
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function ThreeDModel() {
  const [isRotating, setIsRotating] = useState(true);

  return (
    <div className="center-col" style={{position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', background: '#e2e8f0', overflow: 'hidden', borderRadius: '20px'}}>
      
      {/* Play/Pause Button */}
      <button 
        onClick={() => setIsRotating(!isRotating)}
        style={{
          position: 'absolute', top: '16px', right: '16px', zIndex: 10,
          background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '50%',
          width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', color: '#0f172a'
        }}
        title={isRotating ? "Dönmeyi Durdur" : "Döndür"}
      >
        {isRotating ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        )}
      </button>

      <div style={{flex: 1, width: '100%', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0}}>
        <ErrorBoundary>
          <Canvas 
            camera={{ position: [17, 11, 21], fov: 35 }}
            gl={{ powerPreference: 'default', antialias: true, failIfMajorPerformanceCaveat: false }}
            onCreated={({ gl }) => {
              gl.domElement.addEventListener('webglcontextlost', (e) => {
                e.preventDefault();
              }, false);
            }}
          >
            <color attach="background" args={['#e2e8f0']} />
            
            <OrbitControls makeDefault enablePan={false} target={[0, 1.8, 0]} minDistance={8} maxDistance={40} maxPolarAngle={Math.PI / 2.05} />

            <Suspense fallback={<Loader />}>
              <GreenhouseScene state={SHOWCASE_STATE} rotate={isRotating} />
            </Suspense>
          </Canvas>
        </ErrorBoundary>
      </div>
      
      <div className="overlay-info" style={{zIndex: 1, pointerEvents: 'none', position: 'absolute', bottom: 0, width: '100%', background: 'linear-gradient(to top, rgba(226, 232, 240, 1), transparent)'}}>
        <div>
          <h2>Greenhouse A1</h2>
          <p style={{color: 'var(--text-muted)', fontSize: '0.9rem'}}>Plant Zone</p>
          
          <div style={{display: 'flex', gap: '24px', marginTop: '16px', fontSize: '0.85rem'}}>
            <div>
              <div style={{color: 'var(--text-muted)'}}>Sector ID</div>
              <div style={{fontWeight: '600', color: 'var(--text-main)'}}>GH-A1</div>
            </div>
            <div>
              <div style={{color: 'var(--text-muted)'}}>Crop</div>
              <div style={{fontWeight: '600', color: 'var(--text-main)'}}>Heirloom Tomatoes</div>
            </div>
            <div>
              <div style={{color: 'var(--text-muted)'}}>Planting Date</div>
              <div style={{fontWeight: '600', color: 'var(--text-main)'}}>Mar 15, 2025</div>
            </div>
          </div>
        </div>
        
        <div style={{textAlign: 'right'}}>
          <div style={{fontSize: '2rem', fontWeight: '700'}}>2.74 <span style={{fontSize: '1rem', color: 'var(--text-muted)'}}>kW</span></div>
          <div style={{color: 'var(--text-muted)', fontSize: '0.85rem'}}>Current Production</div>
        </div>
      </div>
    </div>
  );
}
