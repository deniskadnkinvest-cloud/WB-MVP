import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from './Sidebar';

export default function AdminLayout({ children, activePage, onNavigate }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: '#0a0a0a',
      fontFamily: "'Inter', -apple-system, sans-serif",
      color: '#e5e7eb',
      overflow: 'hidden'
    }}>
      {/* ── Sidebar ── */}
      <Sidebar 
        activePage={activePage} 
        onNavigate={onNavigate} 
        isMobile={isMobile} 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
      />

      {/* ── Main Content Area ── */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'relative',
        overflow: 'hidden',
        background: '#0a0a0a' // Тёмный фон контента
      }}>
        {/* Subtle background glow */}
        <div style={{
          position: 'absolute', top: '-10%', left: '50%', transform: 'translateX(-50%)',
          width: '600px', height: '600px',
          background: 'radial-gradient(circle, rgba(251, 146, 60, 0.03) 0%, transparent 60%)',
          pointerEvents: 'none', zIndex: 0
        }} />

        {/* ── Header ── */}
        <header style={{
          height: '64px',
          padding: '0 24px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          background: 'rgba(10,10,10,0.8)',
          backdropFilter: 'blur(20px)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'relative', zIndex: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {isMobile && (
              <button 
                onClick={() => setIsSidebarOpen(true)}
                style={{
                  background: 'none', border: 'none', color: '#d1d5db',
                  fontSize: '24px', cursor: 'pointer', padding: '0 8px 0 0', display: 'flex'
                }}
              >
                ☰
              </button>
            )}
            
            {/* Page Title & Breadcrumb logic could go here */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#9ca3af' }}>
              <span>{activePage.charAt(0).toUpperCase() + activePage.slice(1)}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Admin Profile Mockup */}
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%',
              background: '#fb923c', color: '#000',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: '13px'
            }}>
              A
            </div>
          </div>
        </header>

        {/* ── Page Content ── */}
        <main style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '24px',
          position: 'relative', zIndex: 1,
        }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activePage}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
