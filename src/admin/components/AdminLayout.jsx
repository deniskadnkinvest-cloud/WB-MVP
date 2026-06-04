import React from 'react';

const TABS = [
  { id: 'dashboard', icon: '🎛', label: 'Пульс' },
  { id: 'users',     icon: '👥', label: 'Юзеры' },
  { id: 'payments',  icon: '💰', label: 'Платежи' },
  { id: 'errors',    icon: '🚨', label: 'Ошибки' },
];

export default function AdminLayout({ children, activePage, onNavigate }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#030305',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      color: '#fff',
      position: 'relative',
      // Отступ снизу для таббара
      paddingBottom: '80px',
    }}>
      {/* ── Header ── */}
      <header style={{
        padding: '16px 20px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(3,3,5,0.95)',
        backdropFilter: 'blur(20px)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px', height: '32px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '16px',
          }}>
            🎛
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '16px', fontWeight: 700, lineHeight: 1 }}>
              Command Center
            </h1>
            <p style={{ margin: 0, fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
              Seller Studio Admin
            </p>
          </div>
        </div>
      </header>

      {/* ── Page content ── */}
      <main style={{ flex: 1, padding: '16px 16px 0', overflowX: 'hidden' }}>
        {children}
      </main>

      {/* ── Bottom Tab Bar ── */}
      <nav style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        background: 'rgba(10,10,18,0.97)',
        backdropFilter: 'blur(24px)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        justifyContent: 'space-around',
        padding: '8px 0 calc(8px + env(safe-area-inset-bottom))',
        zIndex: 100,
      }}>
        {TABS.map(tab => {
          const isActive = activePage === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onNavigate(tab.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 16px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                borderRadius: '12px',
                transition: 'all 0.2s',
                opacity: isActive ? 1 : 0.45,
                transform: isActive ? 'scale(1.05)' : 'scale(1)',
              }}
            >
              <span style={{ fontSize: '20px', lineHeight: 1 }}>{tab.icon}</span>
              <span style={{
                fontSize: '10px',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? '#8b5cf6' : '#fff',
                letterSpacing: '0.3px',
              }}>
                {tab.label}
              </span>
              {isActive && (
                <div style={{
                  width: '4px', height: '4px',
                  borderRadius: '50%',
                  background: '#8b5cf6',
                  position: 'absolute',
                  bottom: '6px',
                }} />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
