import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, ComposedChart, Area, Legend,
} from 'recharts';
import { cardIn, Reveal } from '../motionKit';
import './MonitoringCharts.css';

// Gerçek veri: Grafana (verdify-tsdb) -> /api/monitoring/charts
const EQUIP = {
  heat1: { label: 'Isıtıcı 1', color: '#f97316' },
  heat2: { label: 'Isıtıcı 2', color: '#fb923c' },
  fan1: { label: 'Fan 1', color: '#60a5fa' },
  fan2: { label: 'Fan 2', color: '#93c5fd' },
  fog: { label: 'Sisleme', color: '#a78bfa' },
  vent: { label: 'Havalandırma', color: '#34d399' },
  grow_light_main: { label: 'Büyütme Işığı', color: '#fbbf24' },
  drip_wall: { label: 'Damla (Duvar)', color: '#22d3ee' },
  drip_center: { label: 'Damla (Merkez)', color: '#2dd4bf' },
};
const ZONES = { north: ['Kuzey', '#6366f1'], center: ['Merkez', '#f59e0b'], east: ['Doğu', '#10b981'], west: ['Batı', '#ec4899'] };
const AXIS = { fill: '#94a3b8', fontSize: 12 };

// VPD bantları: <0.8 yüksek nem (küf riski), 0.8-1.2 hedef, >1.2 kuru
const binColor = (v) => (v < 0.8 ? '#60a5fa' : v < 1.2 ? '#34d399' : '#fbbf24');

const STOPS = [[0.4, [59, 130, 246]], [0.8, [16, 185, 129]], [1.2, [251, 191, 36]], [1.8, [239, 68, 68]]];
function heatColor(v) {
  if (v <= STOPS[0][0]) return `rgb(${STOPS[0][1]})`;
  for (let i = 1; i < STOPS.length; i++) {
    if (v <= STOPS[i][0]) {
      const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i], t = (v - a) / (b - a);
      return `rgb(${ca.map((c, k) => Math.round(c + (cb[k] - c) * t)).join(',')})`;
    }
  }
  return `rgb(${STOPS[STOPS.length - 1][1]})`;
}

function Tip({ active, payload, label, unit = '', digits = 1, fmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="mc-tip">
      <div className="mc-tip-title">{fmt ? fmt(label) : label}</div>
      {payload.filter(p => p.value != null).map(p => (
        <div key={p.dataKey} className="mc-tip-row">
          <span className="mc-dot" style={{ background: p.color || p.fill }} />
          <span>{p.name}</span>
          <strong>{Number(p.value).toFixed(digits)}{unit}</strong>
        </div>
      ))}
    </div>
  );
}

function Card({ i, title, sub, children, wide, right }) {
  return (
    <motion.section className={`mc-card${wide ? ' mc-wide' : ''}`} {...cardIn(i)}>
      <header className="mc-card-head">
        <div>
          <h4>{title}</h4>
          <p>{sub}</p>
        </div>
        {right}
      </header>
      {children}
    </motion.section>
  );
}

export default function MonitoringCharts() {
  const [days, setDays] = useState(7);
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let live = true;
    setErr(false);
    fetch(`http://localhost:8000/api/monitoring/charts?days=${days}`)
      .then(r => r.json())
      .then(j => live && setD(j.data))
      .catch(() => live && setErr(true));
    return () => { live = false; };
  }, [days]);

  if (err || !d) {
    return <div className="mc-state">{err ? 'Grafana verisi alınamadı.' : 'Grafikler yükleniyor…'}</div>;
  }

  const total = d.vpd_histogram.reduce((s, b) => s + b.hours, 0);
  const inTarget = d.vpd_histogram.filter(b => b.bin >= 0.8 && b.bin < 1.2).reduce((s, b) => s + b.hours, 0);
  const usedEquip = d.equipment.filter(e => d.runtime_daily.some(r => (r[e] || 0) > 0));
  const heatDays = [...new Set(d.vpd_heatmap.map(c => c.day))];
  const heatMap = new Map(d.vpd_heatmap.map(c => [`${c.day}-${c.hour}`, c.vpd]));

  return (
    <section className="mc-wrap">
      <div className="mc-head">
        <div>
          <h3>Analiz Grafikleri</h3>
          <p>Verdify public dashboard + saatlik arşiv · Denver saati</p>
        </div>
        <div className="mc-seg">
          {[7, 14, 30].map(n => (
            <button key={n} className={days === n ? 'on' : ''} onClick={() => setDays(n)}>{n} gün</button>
          ))}
        </div>
      </div>

      <div className="mc-grid">
        <Card i={0} title="VPD Dağılımı" sub={`Son ${d.days} gün, saatlik ortalamalar · hedef bandında %${total ? Math.round((inTarget / total) * 100) : 0}`}
          right={<div className="mc-legend"><span><i style={{ background: '#60a5fa' }} />&lt;0,8</span><span><i style={{ background: '#34d399' }} />0,8–1,2</span><span><i style={{ background: '#fbbf24' }} />&gt;1,2</span></div>}>
          <div className="mc-chart">
            <Reveal k={d.days}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.vpd_histogram} barCategoryGap="12%">
                  <CartesianGrid vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="bin" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={v => v.toFixed(1)} />
                  <YAxis tick={AXIS} axisLine={false} tickLine={false} width={34} />
                  <Tooltip cursor={{ fill: 'rgba(148,163,184,0.12)' }} content={<Tip unit=" saat" digits={0} fmt={v => `VPD ${Number(v).toFixed(1)}–${(Number(v) + 0.1).toFixed(1)} kPa`} />} />
                  <Bar dataKey="hours" name="Süre" radius={[8, 8, 0, 0]} isAnimationActive={false}>
                    {d.vpd_histogram.map(b => <Cell key={b.bin} fill={binColor(b.bin)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Reveal>
          </div>
        </Card>

        <Card i={1} title="Ekipman Çalışma Süresi" sub={`Günlük toplam (dk) · son ${d.days} gün`}>
          <div className="mc-chart">
            <Reveal k={d.days}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.runtime_daily} barCategoryGap="22%">
                  <CartesianGrid vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="day" tick={AXIS} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS} axisLine={false} tickLine={false} width={40} />
                  <Tooltip cursor={{ fill: 'rgba(148,163,184,0.12)' }} content={<Tip unit=" dk" />} />
                  {usedEquip.map((e, k) => (
                    <Bar key={e} dataKey={e} name={EQUIP[e]?.label || e} stackId="a" fill={EQUIP[e]?.color || '#94a3b8'}
                      radius={k === usedEquip.length - 1 ? [6, 6, 0, 0] : 0} isAnimationActive={false} />
                  ))}
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#64748b', paddingTop: 8 }} />
                </BarChart>
              </ResponsiveContainer>
            </Reveal>
          </div>
        </Card>

        <Card i={2} title="Bölge Sıcaklıkları" sub="Son 24 saat, saatlik ortalama (°C) · Denver saati">
          <div className="mc-chart">
            <Reveal k="zones">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={d.zones_24h}>
                  <CartesianGrid vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="time" tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={28} />
                  <YAxis tick={AXIS} axisLine={false} tickLine={false} width={34} domain={['dataMin - 1', 'dataMax + 1']} tickFormatter={v => Math.round(v)} />
                  <Tooltip content={<Tip unit=" °C" />} />
                  {Object.entries(ZONES).map(([k, [label, color]]) => (
                    <Line key={k} type="monotone" dataKey={k} name={label} stroke={color} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
                  ))}
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#64748b', paddingTop: 8 }} />
                </LineChart>
              </ResponsiveContainer>
            </Reveal>
          </div>
        </Card>

        <Card i={3} title="Sıcaklık ve Hedef Bandı" sub="Son 24 saat, saatlik ortalama (°C) · gölge: hedef aralığı">
          <div className="mc-chart">
            <Reveal k="band">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={d.zones_24h.map(r => ({ ...r, band: r.low != null && r.high != null ? [r.low, r.high] : null }))}>
                  <CartesianGrid vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="time" tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={28} />
                  <YAxis tick={AXIS} axisLine={false} tickLine={false} width={34} domain={['auto', 'auto']} tickFormatter={v => Math.round(v)} />
                  <Tooltip content={<Tip unit=" °C" />} />
                  <Area type="monotone" dataKey="band" name="Hedef aralığı" stroke="none" fill="#34d399" fillOpacity={0.18} connectNulls isAnimationActive={false} />
                  <Line type="monotone" dataKey="avg" name="Ortalama sıcaklık" stroke="#f97316" strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#64748b', paddingTop: 8 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </Reveal>
          </div>
        </Card>

        <Card i={4} wide title="VPD Isı Haritası" sub={`Saat (${d.timezone}) × gün · ortalama VPD (kPa)`}
          right={<div className="mc-scale"><span>0,4</span><i /><span>1,8</span></div>}>
          <div className="mc-heat" style={{ '--rows': heatDays.length }}>
            <div className="mc-heat-hours">
              <span />
              {Array.from({ length: 24 }, (_, h) => <span key={h}>{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span>)}
            </div>
            {heatDays.map((day, r) => (
              <div className="mc-heat-row" key={day}>
                <span className="mc-heat-day">{day}</span>
                {Array.from({ length: 24 }, (_, h) => {
                  const v = heatMap.get(`${day}-${h}`);
                  return (
                    <motion.i key={h} className="mc-cell" title={v == null ? `${day} ${h}:00 · veri yok` : `${day} ${String(h).padStart(2, '0')}:00 · ${v.toFixed(2)} kPa`}
                      style={v == null ? undefined : { background: heatColor(v) }}
                      initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, delay: r * 0.025 + h * 0.008 }} />
                  );
                })}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}
