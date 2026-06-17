import React, { useState, useEffect, createContext, useContext, useMemo, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from './components/Sidebar';

// ═══════════════════════════════════════════
//  Admin Context — accessKey для API запросов
// ═══════════════════════════════════════════

const AdminContext = createContext(null);
export const useAdmin = () => useContext(AdminContext);

const SummaryTab      = lazy(() => import('./pages/SummaryTab'));
const UsersCRM        = lazy(() => import('./pages/UsersCRM'));
const LogTab          = lazy(() => import('./pages/LogTab'));
const Errors          = lazy(() => import('./pages/Errors'));
const Broadcasts      = lazy(() => import('./pages/Broadcasts'));
const Prompts         = lazy(() => import('./pages/Prompts'));
const PlaceholderPage = lazy(() => import('./pages/PlaceholderPage'));

const PAGE_MAP = {
  summary:              <SummaryTab />,
  users:                <UsersCRM />,
  log:                  <LogTab />,
  errors:               <Errors />,
  broadcasts:           <Broadcasts />,
  prompts:              <Prompts />,
};

function getPage(id) {
  return PAGE_MAP[id] || <PlaceholderPage />;
}

// ═══════════════════════════════════════════
//  AdminApp
// ═══════════════════════════════════════════

export default function AdminApp() {
  const [status, setStatus]         = useState('loading');
  const [adminUser, setAdminUser]   = useState(null);
  const [errorMsg, setErrorMsg]     = useState('');
  const [activePage, setActivePage] = useState('summary');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const accessKey = useMemo(() => new URLSearchParams(window.location.search).get('key') || '', []);

  const initData = useMemo(() => {
    try { return window.Telegram?.WebApp?.initData || ''; }
    catch { return ''; }
  }, []);

  useEffect(() => {
    try {
      const tg = window.Telegram?.WebApp;
      if (tg) {
        tg.expand();
        tg.setHeaderColor('#0a0a0f');
        tg.setBackgroundColor('#0a0a0f');
      }
    } catch { /* ok */ }

    if (!accessKey && !initData && import.meta.env.DEV) {
      setAdminUser({ id: 0, firstName: 'Dev', username: 'devmode' });
      setStatus('ready');
      return;
    }

    if (!accessKey && !initData) {
      setErrorMsg('Откройте через Telegram бот командой /admin');
      setStatus('error');
      return;
    }

    fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: initData || undefined, accessKey: accessKey || undefined }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setAdminUser(data.user);
          setStatus('ready');
        } else {
          setErrorMsg('Нет доступа');
          setStatus('error');
        }
      })
      .catch(() => {
        setErrorMsg('Ошибка подключения к серверу');
        setStatus('error');
      });
  }, [accessKey, initData]);

  const authHeaders = useMemo(() => ({
    'X-Admin-Key': accessKey || '',
    'X-Admin-Init-Data': initData || '',
  }), [accessKey, initData]);

  const contextValue = useMemo(() => ({
    adminUser,
    accessKey,
    authHeaders,
  }), [adminUser, accessKey, authHeaders]);

  if (status === 'loading') return <AdminLoader />;
  if (status === 'error')   return <AdminError message={errorMsg} />;

  return (
    <AdminContext.Provider value={contextValue}>
      <div style={{
        minHeight: '100vh',
        maxHeight: '100vh',
        background: '#0a0a0f',
        fontFamily: "'Inter', -apple-system, sans-serif",
        color: '#f0f0f5',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>

        {/* ── Top Header с кнопкой шторки ── */}
        <header style={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          background: 'rgba(10,10,15,0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          flexShrink: 0,
          zIndex: 50,
        }}>
          {/* Кнопка хамбургера */}
          <button
            onClick={() => setSidebarOpen(true)}
            style={{
              width: '36px',
              height: '36px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '10px',
              cursor: 'pointer',
              flexShrink: 0,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{ display: 'block', width: '16px', height: '1.5px', background: 'rgba(255,255,255,0.7)', borderRadius: '2px' }} />
            <span style={{ display: 'block', width: '16px', height: '1.5px', background: 'rgba(255,255,255,0.7)', borderRadius: '2px' }} />
            <span style={{ display: 'block', width: '16px', height: '1.5px', background: 'rgba(255,255,255,0.7)', borderRadius: '2px' }} />
          </button>

          {/* Заголовок */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '-0.3px', color: '#fff' }}>
              {PAGE_TITLES[activePage] || 'Seller Bot'}
            </div>
          </div>

          {/* Аватар админа */}
          <div style={{
            width: '30px',
            height: '30px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #818cf8, #c084fc)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 700,
            color: '#fff',
            flexShrink: 0,
          }}>
            {(adminUser?.firstName || 'A')[0].toUpperCase()}
          </div>
        </header>

        {/* ── Боковая шторка ── */}
        <Sidebar
          activePage={activePage}
          onNavigate={(id) => { setActivePage(id); setSidebarOpen(false); }}
          isMobile={true}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* ── Контент страницы ── */}
        <main style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
        }}>
          <Suspense fallback={<PageSpinner />}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activePage}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                {getPage(activePage)}
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </main>
      </div>
    </AdminContext.Provider>
  );
}

// ── Заголовки страниц ──
const PAGE_TITLES = {
  summary:          '📊 Сводка',
  users:            '👥 Пользователи (CRM)',
  log:              '⚡ Лог генераций',
  errors:           '🐛 Ошибки системы',
  broadcasts:       '📢 Рассылки',
  prompts:          '🤖 GPT Промпты',
};

// ── Спиннер загрузки страницы ──
function PageSpinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '60px' }}>
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
        style={{
          width: '28px', height: '28px', borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.06)',
          borderTopColor: '#818cf8',
        }}
      />
    </div>
  );
}

// ── Loading screen ──
function AdminLoader() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
      fontFamily: "'Inter', sans-serif",
    }}>
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
        style={{
          width: '40px', height: '40px',
          borderRadius: '50%',
          border: '3px solid rgba(129, 140, 248, 0.15)',
          borderTop: '3px solid #818cf8',
        }}
      />
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', margin: 0 }}>
        Загрузка…
      </p>
    </div>
  );
}

// ── Error screen ──
function AdminError({ message }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      padding: '24px',
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{ fontSize: '48px' }}>🔒</div>
      <h2 style={{ color: '#fff', margin: 0, fontSize: '18px', fontWeight: 600 }}>
        Доступ закрыт
      </h2>
      <p style={{
        color: 'rgba(255,255,255,0.5)',
        fontSize: '14px',
        margin: 0,
        textAlign: 'center',
        lineHeight: '1.5',
      }}>
        {message}
      </p>
    </div>
  );
}
