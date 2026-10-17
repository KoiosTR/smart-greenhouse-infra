import React, { useState, useEffect } from 'react';
import CurrentConditions from './CurrentConditions';
import Alerts from './Alerts';
import ThreeDModel from './ThreeDModel';
import GrowthMetrics from './GrowthMetrics';
import ClimateTrends from './ClimateTrends';

export default function Overview({ sensorData, aiRisk }) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [historicalData, setHistoricalData] = useState(null);

  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (!isToday) {
      fetch(`http://localhost:8000/api/conditions/date?date=${selectedDate}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.data) {
            setHistoricalData(data.data);
          } else {
            setHistoricalData(null);
          }
        })
        .catch(err => {
          console.error("Error fetching historical data:", err);
          setHistoricalData(null);
        });

      fetch(`http://localhost:8000/api/ml/predict_date?date=${selectedDate}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.status === "success") {
            setHistoricalData(prev => ({
              ...prev,
              ai_risk_score: data.risk_probability,
              is_high_risk: data.is_high_risk
            }));
          }
        })
        .catch(err => console.error("Error fetching historical ML risk:", err));

    } else {
      setHistoricalData(null);
    }
  }, [selectedDate, isToday]);

  const activeData = isToday ? sensorData : historicalData;
  
  let activeAiRisk = aiRisk;
  if (!isToday) {
    if (historicalData && historicalData.ai_risk_score !== undefined && historicalData.ai_risk_score !== null) {
      activeAiRisk = {
        risk_probability: historicalData.ai_risk_score,
        is_high_risk: historicalData.is_high_risk
      };
    } else {
      activeAiRisk = null; 
    }
  }

  return (
    <main className="dashboard-grid">
      {/* LEFT COLUMN */}
      <div className="left-col">
        <CurrentConditions sensorData={activeData} selectedDate={selectedDate} />
        <Alerts aiRisk={activeAiRisk} />
      </div>

      {/* CENTER COLUMN (3D Model) */}
      <ThreeDModel />

      {/* RIGHT COLUMN */}
      <div className="right-col" style={{display: 'flex', flexDirection: 'column', gap: '24px'}}>
        <div style={{display: 'flex', flexDirection: 'column'}}>
          <GrowthMetrics sensorData={activeData} selectedDate={selectedDate} setSelectedDate={setSelectedDate} />
        </div>
        <ClimateTrends selectedDate={selectedDate} />
      </div>
    </main>
  );
}
