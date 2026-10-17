import React from 'react';

export default function Header({ activeTab, onTabChange }) {
  return (
    <header>
      <div className="logo" style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
        <span>Verdify</span>
      </div>
      
      <div className="nav-tabs">
        {['Overview', 'Weather', 'Analytics', 'Monitoring', 'System Health'].map(tab => (
          <div 
            key={tab} 
            className={`nav-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => onTabChange(tab)}
            style={{cursor: 'pointer'}}
          >
            {tab}
          </div>
        ))}
      </div>

      <div className="nav-right" style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
        <button style={{background: 'white', border: 'none', padding: '10px', borderRadius: '50%', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.02)'}}>
          🔔
        </button>
        <div className="user-profile">
          <div className="avatar">A</div>
          <div style={{display: 'flex', flexDirection: 'column'}}>
            <span>Arda</span>
            <span style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>Admin</span>
          </div>
          <span>▼</span>
        </div>
      </div>
    </header>
  );
}
