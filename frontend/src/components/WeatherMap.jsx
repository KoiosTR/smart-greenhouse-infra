import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, ZoomControl, Polygon, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import 'leaflet/dist/leaflet.css';
import './WeatherMap.css';

export default function WeatherMap({ sensorData }) {
  const [weatherData, setWeatherData] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(11);
  const [pollutionTab, setPollutionTab] = useState('REAL TIME');

  // Component to track map zoom changes
  const MapEvents = () => {
    useMapEvents({
      zoomend: (e) => {
        setZoomLevel(e.target.getZoom());
      }
    });
    return null;
  };
  
  // Dummy data for the charts to mimic the design
  const pollutionDataRealTime = [
    { time: '06:00', value: 30 }, { time: '08:00', value: 45 }, 
    { time: '10:00', value: 35 }, { time: '12:00', value: 50 }, 
    { time: '14:00', value: 42 }, { time: '16:00', value: 38 },
    { time: '18:00', value: 30 }, { time: '20:00', value: 25 }
  ];

  const pollutionDataWeekly = [
    { time: 'Mon', value: 45 }, { time: 'Tue', value: 52 }, 
    { time: 'Wed', value: 38 }, { time: 'Thu', value: 65 }, 
    { time: 'Fri', value: 48 }, { time: 'Sat', value: 35 },
    { time: 'Sun', value: 40 }
  ];

  const pollutionDataMonthly = [
    { time: 'Week 1', value: 42 }, { time: 'Week 2', value: 50 }, 
    { time: 'Week 3', value: 39 }, { time: 'Week 4', value: 46 }
  ];

  const activePollutionData = pollutionTab === 'REAL TIME' 
    ? pollutionDataRealTime 
    : pollutionTab === 'WEEKLY' 
      ? pollutionDataWeekly 
      : pollutionDataMonthly;

  const carbonData = [
    { name: 'Jan', current: 110, baseline: 100 },
    { name: 'Feb', current: 120, baseline: 100 },
    { name: 'Mar', current: 80, baseline: 100 },
    { name: 'Apr', current: 150, baseline: 100 },
    { name: 'May', current: 110, baseline: 100 }
  ];

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/weather/latest');
        const json = await res.json();
        if (json.data) {
          setWeatherData(json.data);
        }
      } catch(e) {
        console.error("Failed to fetch weather data:", e);
      }
    };
    fetchWeather();
    const interval = setInterval(fetchWeather, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  // Longmont, Colorado coordinates for the map
  const mapCenter = [40.1672, -105.1019];

  const temp = weatherData?.temperature_c != null ? weatherData.temperature_c.toFixed(1) : '--';
  const humidity = weatherData?.humidity != null ? weatherData.humidity.toFixed(0) : '--';
  const rainfall = weatherData?.rainfall_mm != null ? weatherData.rainfall_mm.toFixed(1) : '--';
  const windSpeed = weatherData?.wind_speed_kmh != null ? weatherData.wind_speed_kmh.toFixed(1) : '--';
  
  // Use solar irradiance instead of PM2.5 since we have outdoor solar data
  const solar = weatherData?.solar_irradiance_w_m2 != null ? weatherData.solar_irradiance_w_m2.toFixed(0) : '--';
  
  // CO2 is empty in the DB, so we calculate Dew Point (Çiğ Noktası) instead for the cards
  const indoorTempC = sensorData?.temperature != null ? (sensorData.temperature - 32) * 5/9 : null;
  const indoorHum = sensorData?.humidity;
  const dewPoint = (indoorTempC != null && indoorHum != null) ? (indoorTempC - ((100 - indoorHum) / 5)).toFixed(1) : '--';
  const windDir = weatherData?.wind_direction_deg || 0;
  const windSpeedNum = weatherData?.wind_speed_kmh || 0;

  // Function to deform a perfect circle into an egg/teardrop shape based on wind direction
  const generateDeformedBlob = (centerLat, centerLng, baseRadiusMeters, layerIndex = 1) => {
    const points = [];
    // We force a strong minimum wind effect (e.g. 25 km/h) so the skew is ALWAYS visible
    const effectiveWindSpeed = Math.max(windSpeedNum, 25);
    
    // Convert meteorological wind direction to mathematical radians
    const mathAngleFrom = (270 - windDir) % 360; 
    const mathAngleTo = (mathAngleFrom + 180) % 360;
    const blowToRad = mathAngleTo * (Math.PI / 180);
    
    // Aggressive stretch factors
    const stretchFactor = Math.min(effectiveWindSpeed / 20, 2.0); // Up to 200% stretch
    const squashFactor = 0.5; // Squash the tail by 50%
    
    // Approximate conversions for Colorado latitude
    const metersPerLat = 111320;
    const metersPerLng = 40075000 * Math.cos(centerLat * Math.PI / 180) / 360;

    for (let i = 0; i <= 360; i += 5) {
        const rad = i * (Math.PI / 180);
        
        // Alignment: 1 = pointing exactly downwind, -1 = pointing exactly upwind
        const alignment = Math.cos(rad - blowToRad);
        
        let r = baseRadiusMeters;
        if (alignment > 0) {
            // Stretch forward significantly (use power to make it more teardrop/pointy)
            r += baseRadiusMeters * stretchFactor * Math.pow(alignment, 1.2); 
        } else {
            // Squash the back
            r += baseRadiusMeters * squashFactor * alignment; 
        }
        
        // Add multiple sine waves for a truly amorphous (blob-like) organic shape
        // We use layerIndex to alter the phase and frequency of the waves so each layer is unique!
        const amorphousWobble = (0.10 + (layerIndex * 0.05)) * Math.sin((rad - blowToRad) * (2 + layerIndex)) 
                              + 0.10 * Math.cos(rad * (3 + layerIndex))
                              + 0.08 * Math.sin(rad * (5 - layerIndex + (layerIndex*0.5)));
        r += baseRadiusMeters * amorphousWobble;
        
        const dx = r * Math.cos(rad); // East
        const dy = r * Math.sin(rad); // North
        
        points.push([
            centerLat + (dy / metersPerLat),
            centerLng + (dx / metersPerLng)
        ]);
    }
    return points;
  };

  const centerPos = [40.1672, -105.1019];

  // Calculate dynamic scale factor so bubbles scale and move inwards/outwards naturally when zooming
  const baseZoom = 11;
  const zoomScale = Math.pow(2, zoomLevel - baseZoom);
  const clampedScale = Math.max(0.3, Math.min(zoomScale, 2.5));

  const centerIcon = L.divIcon({
    className: 'custom-blob-marker',
    html: `
      <div class="center-pin"><span></span></div>
      ${zoomLevel >= 9 ? `
      <div class="floating-bubbles-map-anchored" style="transform: scale(${clampedScale}); transition: transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);">
        <div class="bubble bubble-rain">
          <div class="icon">🌧️</div>
          <div class="value">${rainfall} <span>mm</span></div>
          <div class="label">RAINFALL</div>
        </div>
        <div class="bubble bubble-temp">
          <div class="icon">☀️</div>
          <div class="value">${temp} <span>°C</span></div>
          <div class="label">TEMPERATURE</div>
        </div>
        <div class="bubble bubble-humidity">
          <div class="icon">💧</div>
          <div class="value">${humidity} <span>%</span></div>
          <div class="label">HUMIDITY</div>
        </div>
        <div class="bubble bubble-aqi">
          <div class="icon">☀️</div>
          <div class="value">${solar} <span>W/m²</span></div>
          <div class="label">SOLAR RAD.</div>
        </div>
      </div>
      ` : ''}
    `,
    iconSize: [0, 0], iconAnchor: [0, 0]
  });

  return (
    <div className="weather-map-container">
      {/* Background Map */}
      <MapContainer 
        center={centerPos} 
        zoom={11} 
        scrollWheelZoom={true}
        zoomControl={false}
        className="leaflet-map-background"
      >
        <ZoomControl position="topright" />
        <TileLayer
          url="https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}"
          attribution=""
        />

        {/* Heatmap Blobs using dynamic Polygons that deform based on Wind Direction! */}
        <Polygon positions={generateDeformedBlob(centerPos[0], centerPos[1], 15000, 1)} pathOptions={{ color: 'transparent', fillColor: '#8bc34a', fillOpacity: 0.2 }} />
        <Polygon positions={generateDeformedBlob(centerPos[0], centerPos[1], 9000, 2)} pathOptions={{ color: 'transparent', fillColor: '#ffeb3b', fillOpacity: 0.3 }} />
        <Polygon positions={generateDeformedBlob(centerPos[0], centerPos[1], 5000, 3)} pathOptions={{ color: 'transparent', fillColor: '#ff5722', fillOpacity: 0.4 }} />

        <MapEvents />

        {/* Center Pin & Floating Bubbles */}
        <Marker position={centerPos} icon={centerIcon} />

      </MapContainer>

      {/* Bottom Cards */}
      <div className="bottom-cards">
        
        <div className="glass-card pollution-card">
          <div className="card-header">
            <h3>Pollution Trend Analysis</h3>
            <div className="tabs">
              <span className={pollutionTab === 'REAL TIME' ? 'active' : ''} onClick={() => setPollutionTab('REAL TIME')}>REAL TIME</span>
              <span className={pollutionTab === 'WEEKLY' ? 'active' : ''} onClick={() => setPollutionTab('WEEKLY')}>WEEKLY</span>
              <span className={pollutionTab === 'MONTHLY' ? 'active' : ''} onClick={() => setPollutionTab('MONTHLY')}>MONTHLY</span>
            </div>
          </div>
          <div className="chart-container" style={{height: '110px', marginTop: '10px'}}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activePollutionData}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f5b041" stopOpacity={0.6}/>
                    <stop offset="95%" stopColor="#f5b041" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{fill: '#888', fontSize: 12}} />
                <YAxis hide domain={['dataMin - 10', 'dataMax + 10']} />
                <RechartsTooltip />
                <Area type="monotone" dataKey="value" stroke="#f5b041" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card airflow-card">
          <h3>Air Flow Status</h3>
          <div className="airflow-content">
            <div className="wind-speed-display">
              <span className="number">{windSpeed}</span>
              <span className="unit">km/hours</span>
            </div>
            
            <div className="compass-radar">
              <div className="compass-center">
                <span className="icon">🍃</span>
                <span className="val">{windSpeedNum > 0 ? (windSpeedNum / 3.6).toFixed(1) : '0.0'} m/s</span>
              </div>
              <span className="dir n">N</span>
              <span className="dir e">E</span>
              <span className="dir s">S</span>
              <span className="dir w">W</span>
              <span className="dot dot-ne"></span>
              <span className="dot dot-se"></span>
              <span className="dot dot-sw"></span>
              <span className="dot dot-nw"></span>
              
              <div className="wind-pointer" style={{ transform: `rotate(${windDir}deg)` }}></div>
            </div>
          </div>
          <div className="airflow-footer">
            <span className="leaf-icon">🍃</span>
            <div>
              <strong>Fresh Air Movement!</strong>
              <p>Wind circulation is helping reduce pollutant</p>
            </div>
          </div>
        </div>

        <div className="glass-card carbon-card">
          <div className="card-header">
            <h3>Dew Point Analysis</h3>
            <div className="legend">
              <span className="dot current"></span> Current
              <span className="dot baseline"></span> Target
            </div>
          </div>
          <div className="chart-container" style={{height: '70px', marginBottom: '8px'}}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={carbonData}>
                <YAxis hide domain={['auto', 'auto']} />
                <Line type="monotone" dataKey="current" stroke="#4caf50" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="baseline" stroke="#3b82f6" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="carbon-offset">
            <div className="carbon-leaf">💧</div>
            <div className="carbon-info">
              <span className="label">Condensation Risk (Dew Point)</span>
              <span className="value">{dewPoint} °C</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
