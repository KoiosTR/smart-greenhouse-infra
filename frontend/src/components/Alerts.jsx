import React from 'react';

export default function Alerts({ aiRisk }) {
  // Determine risk level based on probability
  let riskLevel = 'loading';
  let prob = 0;
  
  if (aiRisk && aiRisk.risk_probability !== undefined) {
    prob = aiRisk.risk_probability;
    if (prob < 0.3) riskLevel = 'low';
    else if (prob < 0.5) riskLevel = 'moderate';
    else riskLevel = 'high';
  }

  const alertCount = riskLevel === 'high' ? 1 : 0;

    const getAlertUI = () => {
    switch (riskLevel) {
      case 'loading':
        return (
          <div style={{
            padding: '20px', textAlign: 'center', background: '#f8fafc',
            borderRadius: '12px', border: '1px dashed #cbd5e1', color: '#64748b'
          }}>
            <span style={{fontSize: '1.2rem', marginBottom: '8px', display: 'block'}}>🔍</span>
            <p style={{fontSize: '0.9rem', margin: 0, fontWeight: '500'}}>No AI Data Available</p>
            <p style={{fontSize: '0.75rem', margin: '4px 0 0 0', opacity: 0.8}}>Risk calculation is missing for this specific date.</p>
          </div>
        );
      case 'low':
        return (
          <div className="alert-item" style={{
            background: 'linear-gradient(145deg, #f0fdf4, #dcfce7)',
            border: '1px solid #bbf7d0',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 4px 15px rgba(34, 197, 94, 0.1)'
          }}>
            <span style={{fontSize: '1.5rem'}}>🌱</span>
            <div style={{display: 'flex', flexDirection: 'column'}}>
              <span style={{fontSize: '0.95rem', fontWeight: '700', color: '#166534'}}>Optimal Conditions</span>
              <span style={{fontSize: '0.8rem', color: '#15803d', marginTop: '2px'}}>
                AI Disease Risk: {(prob * 100).toFixed(1)}% (Low)
              </span>
            </div>
          </div>
        );
      case 'moderate':
        return (
          <div className="alert-item" style={{
            background: 'linear-gradient(145deg, #fffbeb, #fef3c7)',
            border: '1px solid #fde68a',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 4px 15px rgba(245, 158, 11, 0.1)'
          }}>
            <span style={{fontSize: '1.5rem'}}>⚠️</span>
            <div style={{display: 'flex', flexDirection: 'column'}}>
              <span style={{fontSize: '0.95rem', fontWeight: '700', color: '#92400e'}}>Moderate Risk Warning</span>
              <span style={{fontSize: '0.8rem', color: '#b45309', marginTop: '2px'}}>
                AI Disease Risk: {(prob * 100).toFixed(1)}% (Caution)
              </span>
            </div>
          </div>
        );
      case 'high':
        return (
          <div className="alert-item" style={{
            background: 'linear-gradient(145deg, #fef2f2, #fee2e2)',
            border: '1px solid #fecaca',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 4px 15px rgba(239, 68, 68, 0.15)',
            animation: 'pulse-red 2s infinite'
          }}>
            <span style={{fontSize: '1.5rem', color: 'var(--accent-red)'}}>🤖</span>
            <div style={{display: 'flex', flexDirection: 'column'}}>
              <span style={{fontSize: '0.95rem', fontWeight: '700', color: '#991b1b'}}>High Disease Risk!</span>
              <span style={{fontSize: '0.8rem', color: '#dc2626', marginTop: '2px'}}>
                Probability: {(prob * 100).toFixed(1)}% (Action Required)
              </span>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="panel" style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <h3>Alerts ({alertCount})</h3>
        <button style={{background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b'}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
        </button>
      </div>
      
      {getAlertUI()}

      <style jsx="true">{`
        @keyframes pulse-red {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
      `}</style>
    </div>
  );
}
