import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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
      backgroundColor: '#030305',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      color: '#fff',
      position: 'relative',
      overflow: 'hidden', // to contain the background
    }}>
      {/* ── Background Layer (Nano Banana Asset) ── */}
      <div style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundImage: "url('/assets/admin_bg_neon.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        opacity: 0.6,
        filter: 'blur(30px) saturate(1.5)',
        zIndex: 0,
        pointerEvents: 'none',
      }} />

      {/* ── Additional Dark Gradient Overlay ── */}
      <div style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'linear-gradient(180deg, rgba(3,3,5,0.7) 0%, rgba(3,3,5,0.95) 100%)',
        zIndex: 1,
        pointerEvents: 'none',
      }} />

      {/* ── Content Container ── */}
      <div style={{ position: 'relative', zIndex: 10, flex: 1, display: 'flex', flexDirection: 'column', paddingBottom: '90px' }}>
        
        {/* ── Header ── */}
        <motion.header 
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          style={{
            padding: '16px 20px 12px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            background: 'rgba(255,255,255,0.01)',
            backdropFilter: 'blur(40px)',
            WebkitBackdropFilter: 'blur(40px)',
            position: 'sticky',
            top: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <motion.div 
              whileHover={{ rotate: 180, scale: 1.1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 10 }}
              style={{
                width: '36px', height: '36px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
                boxShadow: '0 0 20px rgba(139, 92, 246, 0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '18px',
              }}
            >
              ✧
            </motion.div>
            <div>
              <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 800, letterSpacing: '-0.5px', background: 'linear-gradient(90deg, #fff, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Command Center
              </h1>
              <p style={{ margin: 0, fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Seller Studio
              </p>
            </div>
          </div>
        </motion.header>

        {/* ── Page content with AnimatePresence ── */}
        <main style={{ flex: 1, padding: '20px 16px 0', overflowX: 'hidden' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activePage}
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              style={{ height: '100%' }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* ── Bottom Tab Bar (Floating) ── */}
        <motion.nav 
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.1 }}
          style={{
            position: 'fixed',
            bottom: 'env(safe-area-inset-bottom, 16px)', 
            left: '16px', right: '16px',
            background: 'rgba(255,255,255,0.03)',
            backdropFilter: 'blur(30px)',
            WebkitBackdropFilter: 'blur(30px)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
            borderRadius: '24px',
            display: 'flex',
            justifyContent: 'space-around',
            padding: '10px 8px',
            zIndex: 100,
          }}
        >
          {TABS.map(tab => {
            const isActive = activePage === tab.id;
            return (
              <motion.button
                key={tab.id}
                onClick={() => onNavigate(tab.id)}
                whileTap={{ scale: 0.9 }}
                style={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '8px 16px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: '16px',
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabBg"
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    style={{
                      position: 'absolute',
                      top: 0, left: 0, right: 0, bottom: 0,
                      background: 'rgba(139, 92, 246, 0.15)',
                      borderRadius: '16px',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                    }}
                  />
                )}
                
                <motion.span 
                  animate={{ scale: isActive ? 1.2 : 1, y: isActive ? -2 : 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  style={{ 
                    fontSize: '22px', 
                    lineHeight: 1,
                    position: 'relative',
                    zIndex: 2,
                    filter: isActive ? 'drop-shadow(0 0 8px rgba(139,92,246,0.8))' : 'none',
                    opacity: isActive ? 1 : 0.4
                  }}
                >
                  {tab.icon}
                </motion.span>
                
                <motion.span 
                  animate={{ opacity: isActive ? 1 : 0.4 }}
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    color: isActive ? '#d8b4fe' : '#fff',
                    letterSpacing: '0.5px',
                    position: 'relative',
                    zIndex: 2,
                  }}
                >
                  {tab.label}
                </motion.span>
              </motion.button>
            );
          })}
        </motion.nav>
      </div>
    </div>
  );
}
