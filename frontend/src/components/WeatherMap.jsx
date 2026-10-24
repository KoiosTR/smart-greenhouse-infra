import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, ZoomControl, Polygon, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { motion } from 'motion/react';
import { cardIn, CountUp, Reveal } from '../motionKit';
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
  
  // Gerçek veri: Grafana (dış ortam güneş radyasyonu ve iç ortam çiğ noktası)
  const RANGE = { 'REAL TIME': 'day', WEEKLY: 'week', MONTHLY: 'month' };
  const [solarTrend, setSolarTrend] = useState([]);
  const [dewTrend, setDewTrend] = useState([]);

  useEffect(() => {
    fetch(`http://localhost:8000/api/weather/solar-trend?range=${RANGE[pollutionTab]}`)
      .then(r => r.json()).then(j => setSolarTrend(j.data || [])).catch(() => setSolarTrend([]));
  }, [pollutionTab]);

  useEffect(() => {
    fetch('http://localhost:8000/api/weather/dew-trend')
      .then(r => r.json()).then(j => setDewTrend(j.data || [])).catch(() => setDewTrend([]));
  }, []);

  const activePollutionData = solarTrend;
  const carbonData = dewTrend;

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
  
  const dewPoint = sensorData?.dew_point != null ? ((sensorData.dew_point - 32) * 5/9).toFixed(1) : '--';
  const windDir = weatherData?.wind_direction_deg || 0;
  const windSpeedNum = weatherData?.wind_speed_kmh || 0;

  // Yumuşak, organik leke: yalnızca düşük dereceli harmonikler (sivri uç yok) + rüzgar yönünde hafif uzama
  const generateDeformedBlob = (centerLat, centerLng, baseRadiusMeters, layerIndex = 1) => {
    const points = [];
    const blowToRad = ((270 - windDir + 180) % 360) * (Math.PI / 180); // rüzgarın estiği yön
    const stretch = Math.min(windSpeedNum / 40, 0.5); // rüzgar yoksa dairesel kalır
    const metersPerLat = 111320;
    const metersPerLng = 40075000 * Math.cos(centerLat * Math.PI / 180) / 360;
    const ph = layerIndex * 1.3; // katman başına farklı faz: iç içe ama birbirinin kopyası değil

    for (let i = 0; i < 360; i += 3) {
      const a = i * (Math.PI / 180);
      const w = a - blowToRad;
      const r = baseRadiusMeters * (1
        + stretch * Math.cos(w) // rüzgar yönünde uzar, ters yönde daralır
        + 0.16 * Math.cos(2 * (a + ph))
        + 0.10 * Math.sin(3 * a + ph * 2));
      points.push([centerLat + (r * Math.sin(a)) / metersPerLat, centerLng + (r * Math.cos(a)) / metersPerLng]);
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
        <Polygon positions={generateDeformedBlob(centerPos[0], centerPos[1], 17000, 1)} pathOptions={{ stroke: false, className: 'blob-soft', fillColor: '#8bc34a', fillOpacity: 0.28, interactive: false }} />
        <Polygon positions={generateDeformedBlob(centerPos[0], centerPos[1], 10500, 2)} pathOptions={{ stroke: false, className: 'blob-soft', fillColor: '#fcd34d', fillOpacity: 0.42, interactive: false }} />
        <Polygon positions={generateDeformedBlob(centerPos[0], centerPos[1], 5800, 3)} pathOptions={{ stroke: false, className: 'blob-soft', fillColor: '#f97316', fillOpacity: 0.5, interactive: false }} />

        <MapEvents />

        {/* Center Pin & Floating Bubbles */}
        <Marker position={centerPos} icon={centerIcon} />

      </MapContainer>

      {/* Bottom Cards */}
      <div className="bottom-cards">
        
        <motion.div className="glass-card pollution-card" {...cardIn(0)}>
          <div className="card-header">
            <h3>Solar Radiation Trend (W/m²){pollutionTab === 'REAL TIME' ? '' : ' · daily peak'}</h3>
            <div className="tabs">
              <span className={pollutionTab === 'REAL TIME' ? 'active' : ''} onClick={() => setPollutionTab('REAL TIME')}>REAL TIME</span>
              <span className={pollutionTab === 'WEEKLY' ? 'active' : ''} onClick={() => setPollutionTab('WEEKLY')}>WEEKLY</span>
              <span className={pollutionTab === 'MONTHLY' ? 'active' : ''} onClick={() => setPollutionTab('MONTHLY')}>MONTHLY</span>
            </div>
          </div>
          <div className="chart-container" style={{height: '110px', marginTop: '10px'}}>
            <Reveal k={pollutionTab + activePollutionData.length}>
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
                <Area isAnimationActive={false} type="monotone" dataKey="value" stroke="#f5b041" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
              </AreaChart>
            </ResponsiveContainer>
            </Reveal>
          </div>
        </motion.div>

        <motion.div className="glass-card airflow-card" {...cardIn(1)}>
          <h3>Air Flow Status</h3>
          <div className="airflow-content">
            <div className="wind-speed-display">
              <span className="number"><CountUp value={windSpeed} /></span>
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
              
              <motion.div className="wind-pointer" animate={{ rotate: windDir }} transition={{ type: 'spring', stiffness: 60, damping: 14 }} />
            </div>
          </div>
          <div className="airflow-footer">
            <span className="leaf-icon">🍃</span>
            <div>
              <strong>{weatherData?.wind_speed_kmh == null ? 'No Wind Data' : windSpeedNum >= 5 ? 'Air Movement Detected' : 'Calm Air'}</strong>
              <p>{weatherData?.wind_speed_kmh == null ? 'Wind is not published by the data source' : windSpeedNum >= 5 ? `Outdoor wind at ${windSpeed} km/h` : 'Little outdoor air movement right now'}</p>
            </div>
          </div>
        </motion.div>

        <motion.div className="glass-card carbon-card" {...cardIn(2)}>
          <div className="card-header">
            <h3>Dew Point Analysis · Outdoor</h3>
            <div className="legend">
              <span className="dot current"></span> Dew point
              <span className="dot baseline"></span> Air temp
            </div>
          </div>
          <div className="chart-container" style={{height: '70px', marginBottom: '8px'}}>
            <Reveal k={carbonData.length}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={carbonData}>
                <YAxis hide domain={['auto', 'auto']} />
                <Line isAnimationActive={false} type="monotone" dataKey="current" stroke="#4caf50" strokeWidth={3} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="baseline" stroke="#3b82f6" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            </Reveal>
          </div>
          <div className="carbon-offset">
            <div className="carbon-leaf">💧</div>
            <div className="carbon-info">
              <span className="label">Condensation Risk (Dew Point)</span>
              <span className="value"><CountUp value={dewPoint} /> °C</span>
            </div>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
