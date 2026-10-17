import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Silence known benign library warnings/logs from Three.js and R3F
const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && (args[0].includes('THREE.Clock') || args[0].includes('The width(0) and height(0) of chart'))) return;
  originalWarn(...args);
};

const originalError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('WebGLRenderer: Context Lost')) return;
  originalError(...args);
};

createRoot(document.getElementById('root')).render(
  <App />
);
