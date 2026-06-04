import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const TABS = [
  { id: 'dashboard', icon: '📊', label: 'Обзор' },
  { id: 'users',     icon: '👤', label: 'Юзеры' },
  { id: 'payments',  icon: '⭐', label: 'Оплаты' },
  { id: 'errors',    icon: '⚙', label: 'Система' },
];

export default function AdminLayout({ children, activePage, onNavigate }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      color: '#e8e8ed',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* ── Subtle gradient orbs ── */}
      <div style={{
        position: 'fixed', top: '-120px', right: '-80px',
        width: '300px', height: '300px',
        background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />
      <div style={{
        position: 'fixed', bottom: '100px', left: '-60px',
        width: '250px', height: '250px',
        background: 'radial-gradient(circle, rgba(14,165,233,0.06) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      <div style={{ position: 'relative', zIndex: 10, flex: 1, display: 'flex', flexDirection: 'column', paddingBottom: '80px' }}>
        
        {/* ── Header ── */}
        <motion.header 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            background: 'rgba(10,10,15,0.8)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            position: 'sticky', top: 0, zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '28px', height: '28px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #6366f1, #0ea5e9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '13px', fontWeight: 800, color: '#fff',
              letterSpacing: '-0.5px',
            }}>
              SS
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '15px', fontWeight: 700, letterSpacing: '-0.3px', color: '#fff' }}>
                Seller Studio
              </h1>
              <p style={{ margin: 0, fontSize: '10px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.5px' }}>
                Панель управления
              </p>
            </div>
          </div>
          <div style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: '#22c55e', boxShadow: '0 0 6px rgba(34,197,94,0.5)',
          }} />
        </motion.header>

        {/* ── Content ── */}
        <main style={{ flex: 1, padding: '16px', overflowX: 'hidden' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activePage}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* ── Tab Bar ── */}
        <nav style={{
          position: 'fixed',
          bottom: 0, left: 0, right: 0,
          background: 'rgba(10,10,15,0.92)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          justifyContent: 'space-around',
          padding: '6px 0 calc(6px + env(safe-area-inset-bottom))',
          zIndex: 100,
        }}>
          {TABS.map(tab => {
            const isActive = activePage === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onNavigate(tab.id)}
                style={{
                  position: 'relative',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: '2px', padding: '8px 18px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  outline: 'none', WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span style={{ 
                  fontSize: '18px', lineHeight: 1,
                  opacity: isActive ? 1 : 0.3,
                  transition: 'opacity 0.2s',
                }}>
                  {tab.icon}
                </span>
                <span style={{
                  fontSize: '10px', fontWeight: isActive ? 600 : 400,
                  color: isActive ? '#818cf8' : 'rgba(255,255,255,0.3)',
                  transition: 'color 0.2s',
                }}>
                  {tab.label}
                </span>
                {isActive && (
                  <motion.div
                    layoutId="tabIndicator"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    style={{
                      position: 'absolute', top: '-1px', left: '25%', right: '25%',
                      height: '2px', borderRadius: '2px',
                      background: '#818cf8',
                    }}
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
