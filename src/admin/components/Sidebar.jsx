import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const MENU_GROUPS = [
  {
    id: 'main',
    title: null,
    items: [
      { id: 'summary',  icon: '📊', label: 'Сводка' },
      { id: 'users',    icon: '👥', label: 'Пользователи (CRM)' },
      { id: 'log',      icon: '⚡', label: 'Лог генераций' },
    ]
  },
  {
    id: 'generation_settings',
    title: 'Настройки бота',
    items: [
      { id: 'prompts', icon: '🤖', label: 'GPT Промпты' },
      { id: 'broadcasts', icon: '📢', label: 'Рассылки' },
      { id: 'errors',       icon: '🐛', label: 'Ошибки системы' },
    ]
  }
];


export default function Sidebar({ activePage, onNavigate, isMobile, isOpen, onClose }) {
  const [expandedGroups, setExpandedGroups] = useState(
    MENU_GROUPS.reduce((acc, g) => ({ ...acc, [g.id]: true }), {})
  );

  const toggleGroup = (id) => {
    setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleNav = (id) => {
    onNavigate(id);
    if (isMobile && onClose) onClose();
  };

  const sidebarContent = (
    <div style={{
      width: isMobile ? '280px' : '260px',
      height: '100vh',
      background: '#121212',
      borderRight: '1px solid rgba(255,255,255,0.05)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'Inter', sans-serif",
      color: '#e5e7eb',
      overflowY: 'auto',
      overflowX: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: '#121212',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, letterSpacing: '-0.3px', color: '#fff' }}>
            VTON Center
          </h2>
          <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>v3.0.0</div>
        </div>
        {isMobile && (
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#9ca3af', fontSize: '20px', cursor: 'pointer', padding: '4px'
          }}>×</button>
        )}
      </div>

      {/* Menu Groups */}
      <div style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {MENU_GROUPS.map(group => (
          <div key={group.id}>
            {group.title && (
              <div 
                onClick={() => toggleGroup(group.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 12px', cursor: 'pointer',
                  fontSize: '11px', fontWeight: 600, color: '#6b7280',
                  textTransform: 'uppercase', letterSpacing: '0.5px'
                }}
              >
                <span>{group.title}</span>
                <span style={{ transform: expandedGroups[group.id] ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', fontSize: '10px' }}>
                  ▼
                </span>
              </div>
            )}

            <AnimatePresence initial={false}>
              {expandedGroups[group.id] && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '2px', marginTop: group.title ? '4px' : '0' }}
                >
                  {group.items.map(item => {
                    const isActive = activePage === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleNav(item.id)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          width: '100%', padding: '10px 12px',
                          background: isActive ? 'rgba(251, 146, 60, 0.1)' : 'transparent',
                          border: 'none', borderRadius: '8px',
                          color: isActive ? '#fb923c' : '#d1d5db',
                          cursor: 'pointer', textAlign: 'left',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = '#fff'; } }}
                        onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#d1d5db'; } }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontSize: '16px', filter: isActive ? 'drop-shadow(0 0 4px rgba(251,146,60,0.5))' : 'grayscale(100%) opacity(0.7)' }}>
                            {item.icon}
                          </span>
                          <span style={{ fontSize: '13px', fontWeight: isActive ? 600 : 500 }}>
                            {item.label}
                          </span>
                        </div>
                        {item.badge && (
                          <div style={{
                            padding: '2px 6px', borderRadius: '10px',
                            background: isActive ? 'rgba(251, 146, 60, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                            color: isActive ? '#fb923c' : '#ef4444',
                            fontSize: '10px', fontWeight: 700
                          }}>
                            {item.badge}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <AnimatePresence>
        {isOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={onClose}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            />
            <motion.div
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              style={{ position: 'absolute', top: 0, bottom: 0, left: 0 }}
            >
              {sidebarContent}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  }

  return sidebarContent;
}
