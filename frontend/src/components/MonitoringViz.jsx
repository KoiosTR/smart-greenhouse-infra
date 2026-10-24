import React from 'react';
import './MonitoringCharts.css';
import { motion } from 'motion/react';
import { ResponsiveContainer, ComposedChart, Area, Line, YAxis } from 'recharts';

// Monitoring kartları için küçük görsel öğeler (yazı yerine grafik)

// Mini trend: area (ana seri) + isteğe bağlı kesikli hedef/ikinci çizgi
export function Spark({ data, k, color, k2, color2, gid }) {
  if (!data?.some(d => d[k] != null)) return <div className="mv-spark mv-empty">veri yok</div>;
  return (
    <div className="mv-spark">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
          <Area type="monotone" dataKey={k} stroke={color} strokeWidth={2.2} fill={`url(#${gid})`} dot={false} connectNulls isAnimationActive={false} />
          {k2 && <Line type="monotone" dataKey={k2} stroke={color2} strokeWidth={1.6} strokeDasharray="4 4" dot={false} connectNulls isAnimationActive={false} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// Günlük çalışma süresi: 24 saatin yüzdesi
export function RuntimeBar({ minutes, running }) {
  if (minutes == null) return null;
  const pct = Math.min(100, (minutes / 1440) * 100);
  return (
    <div className="mv-run" title={`${minutes} dk / 1440 dk`}>
      <div className="mv-run-track">
        <motion.div className={`mv-run-fill${running ? ' on' : ''}`} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
      </div>
      <span>%{pct < 10 ? pct.toFixed(1) : Math.round(pct)}</span>
    </div>
  );
}

// VPD göstergesi: 0-2 kPa ölçeği, hedef bandı (0,8-1,2) gölgeli, hedef çentik, ölçüm noktası
const SCALE_MAX = 2;
const pos = (v) => `${Math.max(0, Math.min(100, (v / SCALE_MAX) * 100))}%`;
export function VpdBullet({ value, target }) {
  const v = typeof value === 'number' ? value : null;
  const off = v != null && target != null && Math.abs(v - target) >= 0.2;
  return (
    <div className="mv-bullet">
      <div className="mv-bullet-track">
        <div className="mv-band" style={{ left: pos(0.8), width: `${((1.2 - 0.8) / SCALE_MAX) * 100}%` }} />
        {target != null && <div className="mv-target" style={{ left: pos(target) }} />}
        {v != null && <motion.div className={`mv-dot${off ? ' off' : ''}`} initial={{ left: '0%' }} animate={{ left: pos(v) }} transition={{ type: 'spring', stiffness: 70, damping: 16 }} />}
      </div>
      <div className="mv-bullet-scale">{[[0, '0'], [0.8, '0,8'], [1.2, '1,2'], [2, '2,0']].map(([v, l]) => <span key={l} style={{ left: pos(v) }}>{l}</span>)}</div>
    </div>
  );
}
