import React, { useState, useEffect, createContext, useContext } from 'react';
import AdminLayout from './components/AdminLayout';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Payments from './pages/Payments';
import Errors from './pages/Errors';
import Broadcasts from './pages/Broadcasts';
import Generations from './pages/Generations';
import PlaceholderPage from './pages/PlaceholderPage';

// ═══════════════════════════════════════════
//  Admin Context — accessKey для API запросов
// ═══════════════════════════════════════════

const AdminContext = createContext(null);
export const useAdmin = () => useContext(AdminContext);

// ═══════════════════════════════════════════
//  AdminApp
// ═══════════════════════════════════════════

export default function AdminApp() {
  const [status, setStatus] = useState('loading');
  const [adminUser, setAdminUser] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [activePage, setActivePage] = useState('dashboard');

  // Получаем accessKey из URL (?key=...) — передаётся ботом
  const accessKey = new URLSearchParams(window.location.search).get('key') || '';

  // Telegram initData (если доступен — для мобильного)
  const initData = (() => {
    try { return window.Telegram?.WebApp?.initData || ''; }
    catch { return ''; }
  })();

  useEffect(() => {
    // Настройка Telegram WebApp
    try {
      const tg = window.Telegram?.WebApp;
      if (tg) {
        tg.expand();
        tg.setHeaderColor('#030305');
        tg.setBackgroundColor('#030305');
      }
    } catch { /* ok */ }

    // Dev-режим
    if (!accessKey && !initData && import.meta.env.DEV) {
      setAdminUser({ id: 0, firstName: 'Dev', username: 'devmode' });
      setStatus('ready');
      return;
    }

    // Нет ключа и нет initData — нет доступа
    if (!accessKey && !initData) {
      setErrorMsg('Откройте через Telegram бот командой /admin');
      setStatus('error');
      return;
    }

    // Верифицируем через бэкенд
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
  }, []);

  if (status === 'loading') return <AdminLoader />;
  if (status === 'error') return <AdminError message={errorMsg} />;

  const pages = {
    dashboard: <Dashboard />,
    changelog: <PlaceholderPage title="История изменений" />,
    docs: <PlaceholderPage title="Документация" />,
    overview: <Dashboard />, // redirect
    users: <Users />,
    generations: <Generations />,
    complaints: <PlaceholderPage title="Жалобы" />,
    reviews: <PlaceholderPage title="Отзывы" />,
    payments: <Payments />,
    payment_analytics: <PlaceholderPage title="Аналитика оплат" />,
    certificates: <PlaceholderPage title="Сертификаты" />,
    certificate_occasions: <PlaceholderPage title="Поводы сертификатов" />,
    limit_history: <PlaceholderPage title="История лимитов" />,
    templates: <PlaceholderPage title="Шаблоны" />,
    prompts: <PlaceholderPage title="GPT Промпты" />,
    categories: <PlaceholderPage title="Категории" />,
    broadcasts: <Broadcasts />,
    funnels: <PlaceholderPage title="Воронки" />,
    referrals: <PlaceholderPage title="Рефералка" />,
    ai_limits: <PlaceholderPage title="AI Лимиты" />,
    api_logs: <PlaceholderPage title="API Логи" />,
    ai_report: <PlaceholderPage title="AI Отчёт" />,
    settings: <PlaceholderPage title="Системные настройки" />,
    errors: <Errors />,
  };

  const authHeaders = {
    'X-Admin-Key': accessKey || '',
    'X-Admin-Init-Data': initData || '',
  };

  return (
    <AdminContext.Provider value={{ adminUser, accessKey, authHeaders }}>
      <AdminLayout activePage={activePage} onNavigate={setActivePage}>
        {pages[activePage] || pages.dashboard}
      </AdminLayout>
    </AdminContext.Provider>
  );
}

// ── Loading screen ──
function AdminLoader() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#030305',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{
        width: '48px', height: '48px',
        borderRadius: '50%',
        border: '3px solid rgba(139, 92, 246, 0.2)',
        borderTop: '3px solid #8b5cf6',
        animation: 'spin 0.8s linear infinite',
      }} />
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', margin: 0 }}>
        Загрузка Command Center...
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Error screen ──
function AdminError({ message }) {
  const currentUrl = window.location.href;
  const hasTelegram = typeof window !== 'undefined' && !!window.Telegram;
  const hasWebApp = typeof window !== 'undefined' && !!window.Telegram?.WebApp;
  const initDataLength = (typeof window !== 'undefined' && window.Telegram?.WebApp?.initData?.length) || 0;
  const searchParams = typeof window !== 'undefined' ? window.location.search : '';

  return (
    <div style={{
      minHeight: '100vh',
      background: '#030305',
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

      <div style={{
        marginTop: '32px',
        padding: '12px',
        background: 'rgba(255,255,255,0.02)',
        borderRadius: '8px',
        border: '1px solid rgba(255,255,255,0.05)',
        fontSize: '10px',
        fontFamily: 'monospace',
        color: 'rgba(255,255,255,0.3)',
        maxWidth: '90%',
        wordBreak: 'break-all',
        textAlign: 'left',
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '4px', color: 'rgba(255,255,255,0.5)' }}>Debug Info:</div>
        <div>URL: {currentUrl}</div>
        <div>Params: {searchParams}</div>
        <div>TG SDK: {hasTelegram ? 'Loaded' : 'Not Loaded'}</div>
        <div>TG WebApp: {hasWebApp ? 'Yes' : 'No'}</div>
        <div>initData len: {initDataLength}</div>
      </div>
    </div>
  );
}

