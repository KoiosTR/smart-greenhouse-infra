import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

export default function ClimateTrends({ selectedDate }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`http://localhost:8000/api/trends/date?date=${selectedDate}`)
      .then(res => res.json())
      .then(json => {
        if (json && json.data) {
          const convertedData = json.data.map(d => ({
            ...d,
            temperature: d.temperature !== null ? Number(((d.temperature - 32) * 5/9).toFixed(1)) : null
          }));
          setData(convertedData);
        } else {
          setData([]);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching trends:", err);
        setData([]);
        setLoading(false);
      });
  }, [selectedDate]);

  if (loading) {
    return (
      <div className="panel" style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-muted)' }}>Loading trends...</span>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="panel" style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-muted)' }}>No historical trends available for this date.</span>
      </div>
    );
  }

  return (
    <div className="panel" style={{ height: '320px', padding: '24px' }}>
      <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '16px' }}>Daily Climate Trends</h3>
      <div style={{ height: '240px', width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} domain={['auto', 'auto']} />
            <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
              itemStyle={{ fontSize: '0.85rem', fontWeight: 500 }}
              labelStyle={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '4px' }}
            />
            <Legend wrapperStyle={{ fontSize: '0.85rem', marginTop: '10px' }} />
            <Line yAxisId="left" type="monotone" dataKey="temperature" name="Temp (°C)" stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            <Line yAxisId="right" type="monotone" dataKey="humidity" name="Humidity (%)" stroke="#0ea5e9" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
